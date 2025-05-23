import axios from 'axios';
import fs from 'fs';
import path from 'path';

const SKETCHFAB_API_URL = 'https://api.sketchfab.com/v3';

// Search assets on Sketchfab
export async function searchAssets(query, page = 1, perPage = 24) {
  try {
    const res = await axios.get(`${SKETCHFAB_API_URL}/search`, {
      params: {
        type: 'models',
        q: query,
        downloadable: true,
        sort_by: 'relevance',
        page,
        per_page: perPage
      }
    });
    return { success: true, results: res.data.results, total: res.data.total, next: res.data.next };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// Get asset details by UID
export async function getAssetDetails(uid) {
  try {
    const res = await axios.get(`${SKETCHFAB_API_URL}/models/${uid}`);
    return { success: true, asset: res.data };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// Download asset (GLTF/ZIP) by UID
export async function downloadAsset(uid, destDir) {
  try {
    // Get download info
    const infoRes = await axios.get(`${SKETCHFAB_API_URL}/models/${uid}/download`);
    const url = infoRes.data.gltf.url || infoRes.data.url;
    if (!url) return { success: false, message: 'No downloadable URL found.' };
    // Download file
    const fileName = `${uid}.zip`;
    const destPath = path.join(destDir, fileName);
    const writer = fs.createWriteStream(destPath);
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream'
    });
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    return { success: true, file: destPath };
  } catch (err) {
    return { success: false, message: err.message };
  }
} 