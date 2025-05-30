// assetManager.js
// Advanced asset management for Cyberpunk 2077 Modding Toolkit
// Tagging, searching, previewing, batch operations, dependency graph

import fs from 'fs';
import path from 'path';

const ASSET_DB_PATH = path.join(process.cwd(), 'output', 'assetdb.json');

function loadDb() {
  if (!fs.existsSync(ASSET_DB_PATH)) return { assets: [] };
  return JSON.parse(fs.readFileSync(ASSET_DB_PATH, 'utf8'));
}
function saveDb(db) {
  fs.writeFileSync(ASSET_DB_PATH, JSON.stringify(db, null, 2));
}

// LRU Cache for asset previews
const PREVIEW_CACHE_SIZE = 50;
const previewCache = new Map(); // key: assetPath, value: preview
function getFromCache(key) {
  if (previewCache.has(key)) {
    const value = previewCache.get(key);
    previewCache.delete(key);
    previewCache.set(key, value);
    return value;
  }
  return null;
}
function setInCache(key, value) {
  if (previewCache.has(key)) previewCache.delete(key);
  previewCache.set(key, value);
  if (previewCache.size > PREVIEW_CACHE_SIZE) {
    const firstKey = previewCache.keys().next().value;
    previewCache.delete(firstKey);
  }
}
// Debounced saveDb
let saveDbTimeout = null;
function debouncedSaveDb(db) {
  if (saveDbTimeout) clearTimeout(saveDbTimeout);
  saveDbTimeout = setTimeout(() => saveDb(db), 250);
}

/**
 * Scan asset directories and update the asset database
 * @param {string[]} dirs
 */
export function scanAssets(dirs) {
  const db = loadDb();
  const seen = new Set();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isFile()) {
        seen.add(filePath);
        if (!db.assets.find(a => a.path === filePath)) {
          db.assets.push({ path: filePath, tags: [], type: path.extname(file).slice(1) });
        }
      }
    }
  }
  // Remove deleted assets
  db.assets = db.assets.filter(a => seen.has(a.path));
  saveDb(db);
  return db.assets;
}

/**
 * Tag an asset
 * @param {string} assetPath
 * @param {string[]} tags
 */
export function tagAsset(assetPath, tags) {
  const db = loadDb();
  const asset = db.assets.find(a => a.path === assetPath);
  if (asset) {
    asset.tags = Array.from(new Set([...(asset.tags || []), ...tags]));
    debouncedSaveDb(db);
    return true;
  }
  return false;
}

/**
 * Search assets by name, type, or tags
 * @param {object} query { name, type, tags }
 */
export function searchAssets(query = {}) {
  const db = loadDb();
  return db.assets.filter(a => {
    if (query.name && !a.path.toLowerCase().includes(query.name.toLowerCase())) return false;
    if (query.type && a.type !== query.type) return false;
    if (query.tags && query.tags.length && !query.tags.every(t => a.tags.includes(t))) return false;
    return true;
  });
}

/**
 * Get a preview for an asset (returns a data URL for images, text for scripts, etc.)
 * @param {string} assetPath
 */
export function getAssetPreview(assetPath) {
  const cached = getFromCache(assetPath);
  if (cached) return cached;
  const ext = path.extname(assetPath).toLowerCase();
  let preview;
  if ([".png", ".jpg", ".jpeg", ".dds", ".tga", ".xbm"].includes(ext)) {
    const data = fs.readFileSync(assetPath);
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    preview = `data:${mime};base64,${data.toString('base64')}`;
  } else if ([".txt", ".js", ".lua", ".reds", ".json"].includes(ext)) {
    preview = fs.readFileSync(assetPath, 'utf8').slice(0, 2000);
  } else {
    preview = 'Preview not supported.';
  }
  setInCache(assetPath, preview);
  return preview;
}

/**
 * Batch tag assets
 * @param {string[]} assetPaths
 * @param {string[]} tags
 */
export function batchTagAssets(assetPaths, tags) {
  const db = loadDb();
  for (const assetPath of assetPaths) {
    const asset = db.assets.find(a => a.path === assetPath);
    if (asset) {
      asset.tags = Array.from(new Set([...(asset.tags || []), ...tags]));
    }
  }
  debouncedSaveDb(db);
  return true;
}

/**
 * Get a dependency graph (simple: which assets reference others by name)
 * @returns {object} { nodes, edges }
 */
export function getDependencyGraph() {
  const db = loadDb();
  const nodes = db.assets.map(a => ({ id: a.path, label: path.basename(a.path), type: a.type }));
  const edges = [];
  for (const asset of db.assets) {
    if (asset.type === 'json' || asset.type === 'scene' || asset.type === 'quest') {
      try {
        const content = fs.readFileSync(asset.path, 'utf8');
        for (const other of db.assets) {
          if (other.path !== asset.path && content.includes(path.basename(other.path))) {
            edges.push({ from: asset.path, to: other.path });
          }
        }
      } catch {}
    }
  }
  return { nodes, edges };
}

/**
 * Clear the in-memory asset preview cache
 */
export function clearCache() {
  previewCache.clear();
}

/**
 * Remove orphaned asset files (files in asset folders not in assetdb)
 * @param {string[]} dirs
 * @returns {number} Number of files removed
 */
export function removeOrphanedAssets(dirs) {
  const db = loadDb();
  const known = new Set(db.assets.map(a => a.path));
  let removed = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isFile() && !known.has(filePath)) {
        fs.unlinkSync(filePath);
        removed++;
      }
    }
  }
  return removed;
}

/**
 * Analyze storage usage and largest files in asset folders
 * @param {string[]} dirs
 * @returns {object} { usage: [{type, size, count}], largest: [{name, size}] }
 */
export function analyzeStorage(dirs) {
  const usageMap = {};
  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isFile()) {
        const ext = path.extname(file).slice(1);
        const size = fs.statSync(filePath).size;
        usageMap[ext] = usageMap[ext] || { type: ext, size: 0, count: 0 };
        usageMap[ext].size += size;
        usageMap[ext].count++;
        files.push({ name: file, size });
      }
    }
  }
  const usage = Object.values(usageMap).map(u => ({ ...u, size: (u.size / (1024*1024)).toFixed(1) + 'MB' }));
  files.sort((a, b) => b.size - a.size);
  const largest = files.slice(0, 10).map(f => ({ name: f.name, size: (f.size / (1024*1024)).toFixed(1) + 'MB' }));
  return { usage, largest };
}

/**
 * Optimize storage (placeholder)
 */
export function optimizeStorage() {
  // Placeholder: could compress, deduplicate, etc.
  return true;
} 