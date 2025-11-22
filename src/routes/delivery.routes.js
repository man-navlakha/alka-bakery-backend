import express from "express";
import { haversineDistance } from "../utils/distance.js";

const router = express.Router();

// Your shop location
const SHOP_LAT = 22.999; 
const SHOP_LON = 72.599;

const DELIVERY_RADIUS_KM = 5;

router.post("/check", (req, res) => {
  const { lat, lon } = req.body;

  if (!lat || !lon) return res.status(400).json({ error: "No coords" });

  const distance = haversineDistance(SHOP_LAT, SHOP_LON, lat, lon);

  let fee = 0;
  let insideZone = true;

  if (distance <= 3) fee = 20;
  else if (distance <= 6) fee = 40;
  else insideZone = false;

  return res.json({
    distance: Number(distance.toFixed(2)),
    insideZone,
    fee: insideZone ? fee : null,
  });
});

export default router;
