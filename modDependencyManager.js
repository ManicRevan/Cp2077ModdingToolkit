// modDependencyManager.js
// Handles mod manifest parsing, dependency resolution, and warnings for CP2077 Modding Toolkit

import fs from 'fs';
import path from 'path';

/**
 * Default manifest structure
 */
const defaultManifest = {
  name: '',
  id: '',
  version: '1.0.0',
  author: '',
  description: '',
  modType: 'mod',
  gameVersion: '',
  dependencies: [], // [{ id, version, required }]
  conflicts: [], // [id]
  tags: [],
  created: new Date().toISOString(),
  updated: new Date().toISOString()
};

/**
 * Read a manifest.json from a mod directory
 * @param {string} modDir
 * @returns {object|null}
 */
export function readManifest(modDir) {
  const manifestPath = path.join(modDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return data;
  } catch (err) {
    throw new Error('Failed to parse manifest.json: ' + err.message);
  }
}

/**
 * Write a manifest.json to a mod directory
 * @param {string} modDir
 * @param {object} manifest
 */
export function writeManifest(modDir, manifest) {
  const manifestPath = path.join(modDir, 'manifest.json');
  const data = { ...defaultManifest, ...manifest, updated: new Date().toISOString() };
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Resolve dependencies for a mod project
 * @param {object} manifest - The manifest object
 * @param {string[]} availableMods - Array of available mod IDs
 * @param {object} [modVersions] - Map of modId -> version
 * @returns {object[]} - Array of issues (missing/incompatible)
 */
export function resolveDependencies(manifest, availableMods, modVersions = {}) {
  const issues = [];
  if (!manifest || !manifest.dependencies) return issues;
  for (const dep of manifest.dependencies) {
    if (!availableMods.includes(dep.id)) {
      issues.push({
        type: 'missing',
        id: dep.id,
        required: dep.required !== false,
        message: `Missing dependency: ${dep.id}`
      });
    } else if (dep.version && modVersions[dep.id]) {
      // Simple semver check (>= required)
      if (!isVersionCompatible(modVersions[dep.id], dep.version)) {
        issues.push({
          type: 'incompatible',
          id: dep.id,
          required: dep.required !== false,
          foundVersion: modVersions[dep.id],
          requiredVersion: dep.version,
          message: `Dependency ${dep.id} version ${modVersions[dep.id]} does not satisfy required ${dep.version}`
        });
      }
    }
  }
  return issues;
}

/**
 * Simple semver >= check
 */
function isVersionCompatible(found, required) {
  // Only supports x.y.z >= x.y.z
  const parse = v => v.split('.').map(Number);
  const [f1, f2, f3] = parse(found);
  const [r1, r2, r3] = parse(required);
  if (f1 > r1) return true;
  if (f1 < r1) return false;
  if (f2 > r2) return true;
  if (f2 < r2) return false;
  return f3 >= r3;
}

/**
 * Scan a directory for available mods/plugins and their versions
 * @param {string} modsDir
 * @returns {object} { modIds: string[], modVersions: object }
 */
export function scanAvailableMods(modsDir) {
  const modIds = [];
  const modVersions = {};
  if (!fs.existsSync(modsDir)) return { modIds, modVersions };
  for (const entry of fs.readdirSync(modsDir)) {
    const modPath = path.join(modsDir, entry);
    if (fs.statSync(modPath).isDirectory()) {
      const manifest = readManifest(modPath);
      if (manifest && manifest.id) {
        modIds.push(manifest.id);
        modVersions[manifest.id] = manifest.version || '1.0.0';
      }
    }
  }
  return { modIds, modVersions };
}

/**
 * Utility: Create a new manifest object
 * @param {object} fields
 * @returns {object}
 */
export function createManifest(fields = {}) {
  return { ...defaultManifest, ...fields, created: new Date().toISOString(), updated: new Date().toISOString() };
} 