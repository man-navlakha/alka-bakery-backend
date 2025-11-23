// src/controllers/phonePeController.js
import axios from "axios";
import { PHONEPE_CONFIG } from "../config/phonepe.js";
import { supabaseAdmin } from "../config/supabase.js";

// Hardcoded Sandbox URLs for Stability (Overrides config if needed)
const SANDBOX_AUTH_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token";
const SANDBOX_PAY_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay";
const SANDBOX_STATUS_URL_BASE = "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order";

/**
 * 1. Helper to get Access Token (OAuth)
 */
const getAccessToken = async () => {
  try {
    const params = new URLSearchParams();
    params.append("client_id", PHONEPE_CONFIG.CLIENT_ID);
    params.append("client_version", PHONEPE_CONFIG.CLIENT_VERSION);
    params.append("client_secret", PHONEPE_CONFIG.CLIENT_SECRET);
    params.append("grant_type", "client_credentials");

    console.log("Fetching Auth Token..."); // DEBUG

    const response = await axios.post(SANDBOX_AUTH_URL, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!response.data?.access_token) {
      throw new Error("No access_token in response");
    }

    return response.data.access_token;
  } catch (error) {
    console.error("Auth Token Error:", error.response?.data || error.message);
    throw new Error("Failed to generate payment token");
  }
};

/**
 * 2. INITIATE PAYMENT (V2)
 */
export const initiatePhonePePayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.body;

    // Cart Validation
    const { data: carts, error: cartError } = await supabaseAdmin
      .from("carts")
      .select("*, cart_items(*)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    if (cartError) throw cartError;
    const cart = carts?.find((c) => c.cart_items && c.cart_items.length > 0);
    if (!cart) return res.status(400).json({ message: "Cart empty" });

    const DELIVERY_FEE = 50;
    const amount = Number(cart.grand_total) + DELIVERY_FEE;
    const transactionId = `T${Date.now()}`; 

    // Get Token
    const accessToken = await getAccessToken();

    // Prepare Payload
    const payload = {
      merchantOrderId: transactionId,
      amount: amount * 100, 
      merchantUserId: `MUID${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)}`,
      paymentFlow: {
        type: "PG_CHECKOUT",
        merchantUrls: {
          redirectUrl: `${PHONEPE_CONFIG.REDIRECT_URL_BASE}?txnId=${transactionId}&addrId=${addressId}`,
        },
      },
    };

    const response = await axios.post(SANDBOX_PAY_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${accessToken}`, 
      },
    });

    res.json({
      url: response.data.redirectUrl,
      transactionId,
    });

  } catch (error) {
    console.error("Init Error:", error.response?.data || error.message);
    res.status(500).json({ 
      message: "Payment initiation failed", 
      details: error.response?.data || error.message 
    });
  }
};

/**
 * 3. VALIDATE PAYMENT (V2)
 */
export const validatePhonePePayment = async (req, res) => {
  try {
    const { transactionId, addressId } = req.body;
    const userId = req.user.id;

    console.log(`Validating: ${transactionId}`); // DEBUG

    const accessToken = await getAccessToken();

    // Construct Status URL
    const statusUrl = `${SANDBOX_STATUS_URL_BASE}/${transactionId}/status`;
    
    console.log("Status URL:", statusUrl); // DEBUG

    const response = await axios.get(statusUrl, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${accessToken}`,
      },
    });

    const state = response.data.state;
    console.log("Payment State:", state); // DEBUG

    if (state === "COMPLETED") {
      
      // --- ORDER CREATION ---
      const { data: carts } = await supabaseAdmin
        .from("carts").select("*, cart_items(*)")
        .eq("user_id", userId).eq("status", "active")
        .order("updated_at", { ascending: false });
      const cart = carts?.find((c) => c.cart_items?.length > 0);
      
      if(!cart) return res.json({success:true, message:"Order likely already placed"});

      const { data: address } = await supabaseAdmin.from("addresses").select("*").eq("id", addressId).single();
      const finalTotal = Number(cart.grand_total) + 50;

     const { data: order } = await supabaseAdmin.from("orders").insert({
          user_id: userId,
          address_snapshot: address,
          subtotal: cart.subtotal,
          discount_amount: cart.discount_total,
          coupon_code: cart.coupon_code,
          delivery_fee: 50,
          grand_total: finalTotal,
          payment_method: "PhonePe",
          status: "pending",       // Order Status
          payment_status: "paid"   // <--- NEW: Mark as Paid
      }).select().single();

      const items = cart.cart_items.map(i => ({
          order_id: order.id, product_id: i.product_id, product_name: "Item",
          unit: i.unit, variant_label: i.variant_label, quantity: i.quantity,
          unit_price: i.unit_price, line_total: i.line_total, grams: i.grams
      }));
      await supabaseAdmin.from("order_items").insert(items);
      await supabaseAdmin.from("cart_items").delete().eq("cart_id", cart.id);
      await supabaseAdmin.from("carts").update({subtotal:0, grand_total:0, discount_total:0}).eq("id", cart.id);

      return res.json({ success: true, message: "Order placed successfully" });
    } else {
      return res.status(400).json({ success: false, message: `Status: ${state}` });
    }

  } catch (error) {
    console.error("Validate Error:", error.response?.data || error.message);
    // Return 200 with failure flag to avoid crashing frontend
    res.json({ success: false, message: "Validation check failed", details: error.message });
  }
};