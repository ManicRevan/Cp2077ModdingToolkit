// communityService.js
// Community/sharing features for Cyberpunk 2077 Modding Toolkit
// Integrates with NexusMods, ModDB, and a custom backend for asset sharing

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

// --- NexusMods API ---
const NEXUS_API_BASE = 'https://api.nexusmods.com/v1';

/**
 * Browse mods from NexusMods
 * @param {string} apiKey
 * @param {string} query
 * @param {number} page
 * @returns {Promise<object[]>}
 */
export async function browseMods(apiKey, query = '', page = 1) {
  const url = `${NEXUS_API_BASE}/games/cyberpunk2077/mods.json`;
  const res = await axios.get(url, {
    headers: { apikey: apiKey },
    params: { search: query, page }
  });
  return res.data.mods || [];
}

/**
 * Download a mod from NexusMods
 * @param {string} apiKey
 * @param {number} modId
 * @param {string} destDir
 * @returns {Promise<string>} Path to downloaded file
 */
export async function downloadMod(apiKey, modId, destDir) {
  const url = `${NEXUS_API_BASE}/games/cyberpunk2077/mods/${modId}/files.json`;
  const res = await axios.get(url, { headers: { apikey: apiKey } });
  const fileUrl = res.data.files[0]?.uri;
  if (!fileUrl) throw new Error('No downloadable file found');
  const fileName = path.basename(fileUrl);
  const destPath = path.join(destDir, fileName);
  const writer = fs.createWriteStream(destPath);
  const fileRes = await axios({ url: fileUrl, method: 'GET', responseType: 'stream' });
  fileRes.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  return destPath;
}

/**
 * Rate a mod on NexusMods
 * @param {string} apiKey
 * @param {number} modId
 * @param {number} rating (1-5)
 */
export async function rateMod(apiKey, modId, rating) {
  const url = `${NEXUS_API_BASE}/games/cyberpunk2077/mods/${modId}/ratings.json`;
  await axios.post(url, { rating }, { headers: { apikey: apiKey } });
  return true;
}

/**
 * Comment on a mod (custom backend or NexusMods if supported)
 * @param {string} apiKey
 * @param {number} modId
 * @param {string} comment
 */
export async function commentMod(apiKey, modId, comment) {
  // NexusMods does not support comments via API; use custom backend if needed
  throw new Error('Commenting via API not supported.');
}

/**
 * Get comments for a mod (custom backend or NexusMods if supported)
 * @param {number} modId
 */
export async function getComments(modId) {
  // NexusMods does not support comments via API; use custom backend if needed
  return [];
}

// --- Asset Sharing (Custom Backend Example) ---
const ASSET_API_BASE = 'https://cp77modkit-assets.example.com/api'; // Replace with real backend

/**
 * Upload an asset to the community asset sharing backend
 * @param {string} apiKey
 * @param {string} filePath
 * @param {object} meta (name, description, tags)
 */
export async function uploadAsset(apiKey, filePath, meta) {
  const url = `${ASSET_API_BASE}/assets/upload`;
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('name', meta.name);
  form.append('description', meta.description);
  form.append('tags', meta.tags.join(','));
  const res = await axios.post(url, form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${apiKey}` }
  });
  return res.data;
}

/**
 * Browse shared assets
 * @param {string} query
 * @param {number} page
 */
export async function browseAssets(query = '', page = 1) {
  const url = `${ASSET_API_BASE}/assets`;
  const res = await axios.get(url, { params: { search: query, page } });
  return res.data.assets || [];
} 