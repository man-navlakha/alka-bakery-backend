import PDFDocument from "pdfkit";
import { supabaseAdmin } from "../config/supabase.js"; // <--- Import Admin Client

export const placeOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId, paymentMethod = "COD" } = req.body;

    if (!addressId) return res.status(400).json({ message: "Delivery address is required" });

    // 1. Get Active Cart (Using Admin Client)
    const { data: carts, error: cartError } = await supabaseAdmin
      .from("carts")
      .select("*, cart_items(*)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    if (cartError) throw cartError;

    const cart = carts?.find(c => c.cart_items && c.cart_items.length > 0);

    if (!cart) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // 2. Get Address Snapshot (Using Admin Client)
    const { data: address } = await supabaseAdmin
      .from("addresses")
      .select("*")
      .eq("id", addressId)
      .single();

    if (!address) return res.status(404).json({ message: "Address not found" });

    // 3. Calculate Finals
    const DELIVERY_FEE = 50;
    const finalTotal = Number(cart.grand_total) + DELIVERY_FEE;

    // 4. Create Order (Using Admin Client - Bypasses RLS)
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        address_snapshot: address,
        subtotal: cart.subtotal,
        discount_amount: cart.discount_total,
        coupon_code: cart.coupon_code,
        delivery_fee: DELIVERY_FEE,
        grand_total: finalTotal,
        payment_method: paymentMethod,
        status: "pending"
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 5. Move Items to Order Items
    const orderItemsData = cart.cart_items.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: "Product Item", 
      unit: item.unit,
      variant_label: item.variant_label,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
      grams: item.grams // <--- FIXED: Added grams field mapping
    }));

    const { error: itemsError } = await supabaseAdmin.from("order_items").insert(orderItemsData);
    if (itemsError) throw itemsError;

    // 6. Cleanup Cart
    await supabaseAdmin.from("cart_items").delete().eq("cart_id", cart.id);
    
    await supabaseAdmin.from("carts").update({ 
      subtotal: 0, 
      grand_total: 0, 
      discount_total: 0, 
      coupon_code: null, 
      coupon_discount: 0, 
      auto_coupon_code: null, 
      auto_discount: 0 
    }).eq("id", cart.id);

    res.status(201).json({ message: "Order placed successfully!", orderId: order.id });

  } catch (error) {
    console.error("Place Order Error:", error);
    res.status(500).json({ message: "Failed to place order", details: error.message });
  }
};

export const getUserOrders = async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Get Orders Error:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

export const getAllOrdersAdmin = async (req, res) => {
  try {
    // Fetch all orders with items
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("*, order_items(*)") // You can also join 'users(name, email)' if you have foreign keys set up correctly
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Admin Get Orders Error:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// controllers/orderController.js (or same file you posted)
export const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Order id missing" });

    // Accept only these keys from client
    const allowed = ["status", "payment_status", "payment_method"];
    const payload = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        payload[k] = req.body[k];
      }
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    // Basic validation (customize as per your app)
    const allowedStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
    if (payload.status && !allowedStatuses.includes(payload.status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }
    const allowedPaymentStatus = ["paid", "pending", "refunded"];
    if (payload.payment_status && !allowedPaymentStatus.includes(payload.payment_status)) {
      return res.status(400).json({ message: "Invalid payment_status value" });
    }

    // Update using admin client (bypass RLS)
    const { data, error, status } = await supabaseAdmin
      .from("orders")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase update error:", { message: error.message, details: error.details, hint: error.hint });
      // If Supabase returns 400/429/5xx, forward meaningful info
      return res.status(500).json({ message: "Database update failed", details: error.message });
    }

    if (!data) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json(data);
  } catch (err) {
    console.error("UpdateOrder caught:", err);
    // Return error details in development; keep generic in production
    return res.status(500).json({ message: "Update failed", details: err.message });
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 1. Fetch Order to check ownership and status
    const { data: order, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select("status, user_id")
      .eq("id", id)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 2. Security Check: Does order belong to user?
    if (order.user_id !== userId) {
      return res.status(403).json({ message: "Unauthorized access to this order" });
    }

    // 3. Logic Check: Is it too late to cancel?
    const nonCancellable = ["shipped", "delivered", "cancelled"];
    if (nonCancellable.includes(order.status)) {
      return res.status(400).json({ message: `Cannot cancel order that is ${order.status}` });
    }

    // 4. Update Status
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ message: "Order cancelled successfully", order: updated });

  } catch (error) {
    console.error("Cancel Order Error:", error);
    res.status(500).json({ message: "Failed to cancel order" });
  }
};


export const generateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fetch full order details
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", id)
      .single();

    if (!order) return res.status(404).json({ message: "Order not found" });

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });

    // Stream to response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=invoice-${order.id.slice(0,8)}.pdf`);
    doc.pipe(res);

    // --- PDF Content ---
    doc.fontSize(20).text('ALKA BAKERY', { align: 'center' });
    doc.fontSize(12).text('Fresh & Authentic', { align: 'center' });
    doc.moveDown();

    doc.fontSize(16).text('INVOICE', { underline: true });
    doc.fontSize(10).text(`Order ID: ${order.id}`);
    doc.text(`Date: ${new Date(order.created_at).toLocaleString()}`);
    doc.text(`Status: ${order.payment_status.toUpperCase()}`);
    doc.moveDown();

    doc.text(`Bill To: ${order.address_snapshot.recipient_name}`);
    doc.text(`${order.address_snapshot.house_no}, ${order.address_snapshot.street_address}`);
    doc.text(`${order.address_snapshot.city} - ${order.address_snapshot.pincode}`);
    doc.moveDown();

    // Table Header
    const yStart = doc.y;
    doc.text('Item', 50, yStart, { width: 250 });
    doc.text('Qty', 300, yStart, { width: 50, align: 'center' });
    doc.text('Price', 350, yStart, { width: 80, align: 'right' });
    doc.text('Total', 430, yStart, { width: 80, align: 'right' });
    
    doc.moveTo(50, yStart + 15).lineTo(510, yStart + 15).stroke();
    doc.moveDown();

    // Items
    order.order_items.forEach(item => {
        const name = `${item.product_name} (${item.variant_label || item.unit})`;
        const y = doc.y;
        doc.text(name, 50, y, { width: 250 });
        doc.text(item.quantity, 300, y, { width: 50, align: 'center' });
        doc.text(item.unit_price, 350, y, { width: 80, align: 'right' });
        doc.text(item.line_total, 430, y, { width: 80, align: 'right' });
        doc.moveDown(0.5);
    });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(510, doc.y).stroke();
    doc.moveDown();

    // Totals
    doc.text(`Subtotal: Rs. ${order.subtotal}`, { align: 'right' });
    doc.text(`Delivery: Rs. ${order.delivery_fee}`, { align: 'right' });
    if(order.discount_amount > 0) doc.text(`Discount: - Rs. ${order.discount_amount}`, { align: 'right' });
    doc.fontSize(14).text(`Grand Total: Rs. ${order.grand_total}`, { align: 'right', bold: true });

    doc.end();

  } catch (error) {
    console.error("Invoice Error:", error);
    res.status(500).json({ message: "Failed to generate invoice" });
  }
};