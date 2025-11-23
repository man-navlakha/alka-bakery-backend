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

export const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const { data, error } = await supabaseAdmin
            .from("orders")
            .update({ status })
            .eq("id", id)
            .select()
            .single();
            
        if(error) throw error;
        res.json(data);
    } catch (e) {
        res.status(500).json({message: "Update failed"});
    }
}