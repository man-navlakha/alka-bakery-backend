import fetch from "node-fetch";
import NodeCache from "node-cache";
import dotenv from "dotenv";
dotenv.config();

const tokenCache = new NodeCache({ stdTTL: 3300 }); // 55 min

const CLIENT_ID = process.env.MAPMYINDIA_CLIENT_ID;
const CLIENT_SECRET = process.env.MAPMYINDIA_CLIENT_SECRET;

// ------------ Generate OAuth Token ------------
export async function getAccessToken() {
  const cached = tokenCache.get("mmi_token");
  if (cached) return cached;

  const url = `https://outpost.mapmyindia.com/api/security/oauth/token?grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  const data = await resp.json();
  if (!data.access_token) {
    console.error("MapmyIndia token error:", data);
    throw new Error("Failed to generate MapmyIndia token");
  }

  tokenCache.set("mmi_token", data.access_token, data.expires_in - 60);
  return data.access_token;
}

// ------------ Autosuggest / Autocomplete ------------
export async function getAutocomplete(query) {
  const token = await getAccessToken();
  const url = `https://atlas.mapmyindia.com/api/places/search/json?query=${encodeURIComponent(query)}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    }
  });

  const data = await resp.json();
  return data;
}

// ------------ Place Details (via eLoc) ------------
export async function getPlaceDetails(eLoc) {
  const token = await getAccessToken();

  const url = `https://atlas.mapmyindia.com/api/places/details/json?eloc=${eLoc}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await resp.json();
  return data;
}
