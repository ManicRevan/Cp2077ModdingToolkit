// archiveTools.js
// Real archive management for Cyberpunk 2077 and standard archives

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Optionally require node-7z for .7z/.rar support
let Seven;
try { Seven = require('node-7z'); } catch {}

const WOLVENKIT_EXE = path.join(__dirname, 'tools', 'WolvenKit.exe');
const CP77TOOLS_EXE = path.join(__dirname, 'tools', 'cp77tools', 'cp77tools.exe');

// In-memory cache for archive listings
const ARCHIVE_LIST_CACHE = new Map(); // key: archivePath, value: { mtime, entries, ts }
const ARCHIVE_LIST_TTL = 5 * 60 * 1000; // 5 minutes
function getArchiveListFromCache(archivePath) {
  const stat = fs.statSync(archivePath);
  const cached = ARCHIVE_LIST_CACHE.get(archivePath);
  if (cached && cached.mtime === stat.mtimeMs && (Date.now() - cached.ts < ARCHIVE_LIST_TTL)) {
    return cached.entries;
  }
  return null;
}
function setArchiveListInCache(archivePath, entries) {
  const stat = fs.statSync(archivePath);
  ARCHIVE_LIST_CACHE.set(archivePath, { mtime: stat.mtimeMs, entries, ts: Date.now() });
}

/**
 * List contents of an archive file (.archive, .zip, .7z, .rar)
 * @param {string} archivePath
 * @returns {object[]} Array of { path, size, type }
 */
export function listArchiveContents(archivePath) {
  const ext = path.extname(archivePath).toLowerCase();
  if (ext === '.zip' || ext === '.archive') {
    const cached = getArchiveListFromCache(archivePath);
    if (cached) return cached;
  }
  let entries;
  if (ext === '.zip') {
    const zip = new AdmZip(archivePath);
    entries = zip.getEntries().map(e => ({
      path: e.entryName,
      size: e.header.size,
      type: e.isDirectory ? 'dir' : 'file'
    }));
    setArchiveListInCache(archivePath, entries);
    return entries;
  } else if (ext === '.archive') {
    const args = ['cli', 'list', '--input', archivePath];
    const result = spawnSync(WOLVENKIT_EXE, args, { encoding: 'utf8' });
    if (result.error) throw result.error;
    entries = result.stdout.split('\n').filter(Boolean).map(line => {
      const match = line.match(/^(.*) \((\d+)\)$/);
      if (match) {
        return { path: match[1], size: parseInt(match[2], 10), type: 'file' };
      } else {
        return { path: line, size: 0, type: 'file' };
      }
    });
    setArchiveListInCache(archivePath, entries);
    return entries;
  } else if ((ext === '.7z' || ext === '.rar') && Seven) {
    // No cache for streaming types
    return new Promise((resolve, reject) => {
      const entries = [];
      const stream = Seven.list(archivePath);
      stream.on('data', entry => entries.push({
        path: entry.file,
        size: entry.size,
        type: entry.attr && entry.attr.includes('D') ? 'dir' : 'file'
      }));
      stream.on('end', () => resolve(entries));
      stream.on('error', reject);
    });
  } else {
    throw new Error('Unsupported archive type or missing dependencies');
  }
}

/**
 * Diff two archives: returns { added, removed, changed }
 * @param {string} archiveA
 * @param {string} archiveB
 * @returns {object}
 */
export async function diffArchives(archiveA, archiveB) {
  const listA = await listArchiveContents(archiveA);
  const listB = await listArchiveContents(archiveB);
  const mapA = Object.fromEntries(listA.map(f => [f.path, f]));
  const mapB = Object.fromEntries(listB.map(f => [f.path, f]));
  const added = listB.filter(f => !mapA[f.path]);
  const removed = listA.filter(f => !mapB[f.path]);
  const changed = listB.filter(f => mapA[f.path] && mapA[f.path].size !== f.size);
  return { added, removed, changed };
}

/**
 * Verify archive integrity (try to extract/list, report errors)
 * @param {string} archivePath
 * @returns {object} { valid: boolean, error?: string }
 */
export function verifyArchive(archivePath) {
  const ext = path.extname(archivePath).toLowerCase();
  try {
    if (ext === '.zip') {
      new AdmZip(archivePath).getEntries();
      return { valid: true };
    } else if (ext === '.archive') {
      // Use WolvenKit CLI to list contents
      const args = ['cli', 'list', '--input', archivePath];
      const result = spawnSync(WOLVENKIT_EXE, args, { encoding: 'utf8' });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(result.stderr);
      return { valid: true };
    } else if ((ext === '.7z' || ext === '.rar') && Seven) {
      // Use node-7z to list contents
      return new Promise((resolve, reject) => {
        const stream = Seven.list(archivePath);
        stream.on('end', () => resolve({ valid: true }));
        stream.on('error', err => resolve({ valid: false, error: err.message }));
      });
    } else {
      throw new Error('Unsupported archive type or missing dependencies');
    }
  } catch (err) {
    return { valid: false, error: err.message };
  }
} 