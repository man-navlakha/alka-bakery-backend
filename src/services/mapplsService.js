// src/services/mapplsService.js
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

let accessToken = null;
let tokenExpiry = null;

// 1. Helper to get or refresh the OAuth Token
const getAccessToken = async () => {
  // Check if token exists and is valid (buffer of 60 seconds)
  if (accessToken && tokenExpiry && new Date() < new Date(tokenExpiry - 60000)) {
    return accessToken;
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.MAPMYINDIA_CLIENT_ID);
    params.append('client_secret', process.env.MAPMYINDIA_CLIENT_SECRET);

    const response = await axios.post(
      'https://outpost.mappls.com/api/security/oauth/token',
      params,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    accessToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    
    return accessToken;
  } catch (error) {
    console.error("Error generating Mappls token:", error.response?.data || error.message);
    throw new Error("Failed to authenticate with Mappls");
  }
};

// 2. Autosuggest API Function
export const autoSuggest = async (query, location = null) => {
  const token = await getAccessToken();
  const params = { query };
  if (location) params.location = location; 

  try {
    const response = await axios.get('https://atlas.mappls.com/api/places/search/json', {
      params,
      headers: { 'Authorization': `bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 3. Place Details API Function
export const getPlaceDetails = async (eLoc) => {
  const token = await getAccessToken();
  try {
    const response = await axios.get(`https://explore.mappls.com/apis/O2O/entity/${eLoc}`, {
      headers: { 'Authorization': `bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};