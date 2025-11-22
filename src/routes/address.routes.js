import express from "express";
import { supabase } from "../config/supabase.js";

const router = express.Router();
router.post("/save", async (req, res) => {
  const body = req.body;

  if (body.is_primary) {
    await supabase
      .from("user_addresses_minimal")
      .update({ is_primary: false })
      .eq("user_id", body.user_id);
  }

  const { data, error } = await supabase
    .from("user_addresses_minimal")
    .insert(body)
    .select("*");

  res.json({ data, error });
});
router.get("/list/:userId", async (req, res) => {
  const { data, error } = await supabase
    .from("user_addresses_minimal")
    .select("*")
    .eq("user_id", req.params.userId)
    .order("is_primary", { ascending: false });

  res.json({ data, error });
});

router.delete("/delete/:id", async (req, res) => {
  const { error } = await supabase
    .from("user_addresses_minimal")
    .delete()
    .eq("id", req.params.id);

  res.json({ success: !error });
});

router.post("/set-primary/:id/:userId", async (req, res) => {
  const { userId, id } = req.params;

  await supabase
    .from("user_addresses_minimal")
    .update({ is_primary: false })
    .eq("user_id", userId);

  await supabase
    .from("user_addresses_minimal")
    .update({ is_primary: true })
    .eq("id", id);

  res.json({ success: true });
});


export default router;

