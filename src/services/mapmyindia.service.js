import fetch from "node-fetch";
import NodeCache from "node-cache";
import dotenv from "dotenv";
dotenv.config();

const tokenCache = new NodeCache({ stdTTL: 3300 });

const CLIENT_ID = process.env.MAPMYINDIA_CLIENT_ID;
const CLIENT_SECRET = process.env.MAPMYINDIA_CLIENT_SECRET;
const REST_KEY = process.env.MAPMYINDIA_REST_KEY;

// ---------------------- OAuth Token ----------------------
export async function getAccessToken() {
  const cached = tokenCache.get("mmi_token");
  if (cached) return cached;

  const url = `https://outpost.mapmyindia.com/api/security/oauth/token?grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`;

  console.log("🔑 Requesting OAuth token...");

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const data = await resp.json();
  console.log("🔑 OAuth Token response:", data);

  if (!data.access_token) throw new Error("Token error");

  tokenCache.set("mmi_token", data.access_token, data.expires_in - 60);
  return data.access_token;
}

// ---------------------- Autosuggest (REST KEY) ----------------------
export async function getAutocomplete(query) {
  const token = await getAccessToken(); // OAuth token

  const url =
    `https://atlas.mappls.com/api/places/search/json?query=${encodeURIComponent(query)}&region=IND`;

  console.log("🔎 Atlas Autosuggest API URL:", url);

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `bearer ${token}`,
    },
  });

  console.log("🔎 Autosuggest status:", resp.status);

  const data = await resp.json();
  console.log("📡 Autosuggest response:", data);

  return data;
}


// ---------------------- Place Details (OAuth Token) ----------------------
export async function getPlaceDetails(eLoc) {
  const token = await getAccessToken();
  const url = `https://atlas.mappls.com/api/places/details/json?eloc=${eLoc}`;

  const resp = await fetch(url, {
    headers: { Authorization: `bearer ${token}` },
  });

  const data = await resp.json();
  return data;
}

