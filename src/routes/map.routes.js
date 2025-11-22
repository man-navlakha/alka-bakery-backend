import express from "express";
import { getAutocomplete, getPlaceDetails } from "../services/mapmyindia.service.js";

const router = express.Router();

// ---------- AUTOCOMPLETE ----------
router.get("/autocomplete", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json({ suggestions: [] });

    const result = await getAutocomplete(q);

    const suggestions = (result?.suggestedLocations || []).map(s => ({
      id: s.eLoc,                 // stable ID
      label: s.placeName,
      address: s.placeAddress,
      lat: s.latitude,
      lon: s.longitude,
    }));

    return res.json({ suggestions });
  } catch (err) {
    console.error("Autosuggest error:", err);
    return res.status(500).json({ error: "autosuggest_failed" });
  }
});


// ---------- PLACE DETAILS ----------
router.get("/details/:eloc", async (req, res) => {
  try {
    const eLoc = req.params.eloc;
    const details = await getPlaceDetails(eLoc);

    return res.json(details);
  } catch (err) {
    console.error("Place details error:", err.message);
    return res.status(500).json({ error: "details_failed" });
  }
});

export default router;
