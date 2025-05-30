import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to WolvenKit.exe
const WOLVENKIT_EXE = path.join(__dirname, 'tools', 'WolvenKit.exe');

function runWolvenKitCLI(args, onData, onError, onClose) {
  const proc = spawn(WOLVENKIT_EXE, args, { cwd: path.dirname(WOLVENKIT_EXE) });
  proc.stdout.on('data', data => onData && onData(data.toString()));
  proc.stderr.on('data', data => onError && onError(data.toString()));
  proc.on('close', code => onClose && onClose(code));
  return proc;
}

// 1. Mesh Import/Export
export function importMesh(inputFile, outputDir, callback) {
  // Example: Import a .glb/.obj/.fbx to CP2077 .mesh
  const args = ['cli', 'import', '--input', inputFile, '--output', outputDir];
  runWolvenKitCLI(args, null, null, callback);
}

export function exportMesh(inputFile, outputDir, callback) {
  // Example: Export a .mesh to .glb/.obj/.fbx
  const args = ['cli', 'export', '--input', inputFile, '--output', outputDir];
  runWolvenKitCLI(args, null, null, callback);
}

// 2. Animation Import/Export
export function importAnimation(inputFile, outputDir, callback) {
  const args = ['cli', 'import', '--input', inputFile, '--output', outputDir];
  runWolvenKitCLI(args, null, null, callback);
}

export function exportAnimation(inputFile, outputDir, callback) {
  const args = ['cli', 'export', '--input', inputFile, '--output', outputDir];
  runWolvenKitCLI(args, null, null, callback);
}

// 3. Archive Management
export function packArchive(inputDir, outputArchive, callback) {
  const args = ['cli', 'pack', '--input', inputDir, '--output', outputArchive];
  runWolvenKitCLI(args, null, null, callback);
}

export function unpackArchive(inputArchive, outputDir, callback) {
  const args = ['cli', 'unpack', '--input', inputArchive, '--output', outputDir];
  runWolvenKitCLI(args, null, null, callback);
}

// 4. UI Modding (extract/repack UI assets)
export function extractUI(inputArchive, outputDir, callback) {
  unpackArchive(inputArchive, outputDir, callback);
}

export function repackUI(inputDir, outputArchive, callback) {
  packArchive(inputDir, outputArchive, callback);
}

// 5. Localization (extract/edit/repack loc files)
export function extractLocalization(inputArchive, outputDir, callback) {
  unpackArchive(inputArchive, outputDir, callback);
}

export function repackLocalization(inputDir, outputArchive, callback) {
  packArchive(inputDir, outputArchive, callback);
}

// 6. Savegame Editing (using CP77SaveEditor CLI if available)
export function editSavegame(inputSave, outputSave, edits, callback) {
  // Placeholder: Integrate with CP77SaveEditor CLI or similar
  // For now, just copy the file (real implementation would parse and edit)
  fs.copyFile(inputSave, outputSave, callback);
}

// 7. Plugin Management (download/install plugins)
export function installPlugin(pluginUrl, pluginsDir, callback) {
  const fileName = path.basename(pluginUrl);
  const dest = path.join(pluginsDir, fileName);
  const file = fs.createWriteStream(dest);
  https.get(pluginUrl, response => {
    response.pipe(file);
    file.on('finish', () => file.close(callback));
  }).on('error', err => {
    fs.unlink(dest, () => callback(err));
  });
}

// 8. REDscript Compilation (using WolvenKit CLI)
export function compileREDscript(scriptsDir, outputDir, callback) {
  const args = ['cli', 'compile', '--input', scriptsDir, '--output', outputDir];
  runWolvenKitCLI(args, null, null, callback);
}

// === Mesh LOD Generation ===
export function generateMeshLODs(inputFile, outputDir, lodRatios = [1.0, 0.5, 0.25], callback) {
  const blenderPath = process.env.BLENDER_PATH || 'blender';
  const scriptPath = path.join(__dirname, 'tools', 'generate_lod.py');
  fs.mkdirSync(outputDir, { recursive: true });
  const args = [
    '--background', '--python', scriptPath, '--',
    inputFile, outputDir, ...lodRatios.map(r => r.toString())
  ];
  const proc = spawn(blenderPath, args, { stdio: 'inherit' });
  proc.on('close', code => callback && callback(code));
}

export function batchGenerateMeshLODs(files, outputDir, lodRatios = [1.0, 0.5, 0.25], cb) {
  let completed = 0;
  files.forEach(file => {
    generateMeshLODs(file, outputDir, lodRatios, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}

// === Batch Processing and Conversion ===

export function batchImportMesh(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    importMesh(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchExportMesh(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    exportMesh(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchConvertMesh(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    convertMesh(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
// Repeat for texture, audio, quest, scene, NPC
export function batchImportTexture(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    importTexture(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchExportTexture(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    exportTexture(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchConvertTexture(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    convertTexture(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchImportAudio(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    importAudio(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchExportAudio(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    exportAudio(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchConvertAudio(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    convertAudio(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchImportQuest(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    importQuest(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchExportQuest(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    exportQuest(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchConvertQuest(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    convertQuest(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchImportScene(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    importScene(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchExportScene(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    exportScene(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchConvertScene(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    convertScene(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchImportNPC(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    importNPC(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchExportNPC(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    exportNPC(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}
export function batchConvertNPC(files, outputDir, cb) {
  let completed = 0;
  files.forEach(file => {
    convertNPC(file, outputDir, () => {
      completed++;
      if (completed === files.length) cb(true);
    });
  });
}

// === Performance & Compatibility Analysis ===
export function analyzeAsset(assetPath, callback) {
  const report = {
    path: assetPath,
    type: null,
    size: 0,
    issues: [],
    warnings: [],
    suggestions: [],
    details: {}
  };
  try {
    if (!fs.existsSync(assetPath)) {
      report.issues.push('File does not exist.');
      return callback(report);
    }
    const stat = fs.statSync(assetPath);
    report.size = stat.size;
    const ext = path.extname(assetPath).toLowerCase();
    report.type = ext;
    // Mesh analysis
    if ([".obj", ".fbx", ".glb", ".mesh"].includes(ext)) {
      // Check size
      if (stat.size > 50 * 1024 * 1024) report.warnings.push('Mesh file is very large (>50MB).');
      // TODO: Parse mesh for polycount, materials, etc. (could use external tool or library)
      report.suggestions.push('Consider reducing polycount for better performance.');
    }
    // Texture analysis
    if ([".png", ".jpg", ".jpeg", ".dds", ".tga", ".xbm"].includes(ext)) {
      if (stat.size > 20 * 1024 * 1024) report.warnings.push('Texture file is very large (>20MB).');
      // TODO: Parse image for resolution (could use sharp or similar)
      report.suggestions.push('Consider reducing texture resolution for better performance.');
    }
    // Script analysis
    if ([".reds", ".lua", ".js"].includes(ext)) {
      // TODO: Parse script for complexity, errors, or deprecated APIs
      report.suggestions.push('Review script for performance and compatibility.');
    }
    // Archive analysis
    if ([".archive", ".zip", ".rar", ".7z"].includes(ext)) {
      // TODO: Check archive integrity, list contents
      report.suggestions.push('Check archive for missing or corrupt files.');
    }
    // General
    if (stat.size === 0) report.issues.push('File is empty.');
    callback(report);
  } catch (err) {
    report.issues.push('Error analyzing asset: ' + err.message);
    callback(report);
  }
}

export function analyzeMod(modDir, callback) {
  const report = {
    path: modDir,
    assets: [],
    issues: [],
    warnings: [],
    suggestions: [],
    summary: ''
  };
  try {
    if (!fs.existsSync(modDir) || !fs.statSync(modDir).isDirectory()) {
      report.issues.push('Mod directory does not exist.');
      return callback(report);
    }
    const files = [];
    function walk(dir) {
      fs.readdirSync(dir).forEach(f => {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) walk(full);
        else files.push(full);
      });
    }
    walk(modDir);
    let completed = 0;
    files.forEach(file => {
      analyzeAsset(file, assetReport => {
        report.assets.push(assetReport);
        if (assetReport.issues.length) report.issues.push(...assetReport.issues.map(i => `${file}: ${i}`));
        if (assetReport.warnings.length) report.warnings.push(...assetReport.warnings.map(w => `${file}: ${w}`));
        if (assetReport.suggestions.length) report.suggestions.push(...assetReport.suggestions.map(s => `${file}: ${s}`));
        completed++;
        if (completed === files.length) {
          report.summary = `${files.length} files analyzed. ${report.issues.length} issues, ${report.warnings.length} warnings.`;
          callback(report);
        }
      });
    });
    if (files.length === 0) {
      report.summary = 'No files found in mod directory.';
      callback(report);
    }
  } catch (err) {
    report.issues.push('Error analyzing mod: ' + err.message);
    callback(report);
  }
}

// === UI/HUD Asset Extraction and Repacking ===
export function extractUIAssets(inputArchive, outputDir, callback) {
  // Use WolvenKit CLI to extract only UI/HUD assets (filter by path/pattern)
  // Example: --filter "ui/|hud/|atlas/|svg/"
  const args = ['cli', 'unpack', '--input', inputArchive, '--output', outputDir, '--filter', 'ui/|hud/|atlas/|svg/'];
  runWolvenKitCLI(args, null, null, callback);
}

export function repackUIAssets(inputDir, outputArchive, callback) {
  // Use WolvenKit CLI to pack the directory into an archive
  const args = ['cli', 'pack', '--input', inputDir, '--output', outputArchive];
  runWolvenKitCLI(args, null, null, callback);
}

/**
 * Validate a mod directory for required files, manifest correctness, and structure
 * @param {string} modDir
 * @returns {object} { errors: string[], warnings: string[], manifest: object|null }
 */
export function validateMod(modDir) {
  const report = { errors: [], warnings: [], manifest: null };
  if (!fs.existsSync(modDir) || !fs.statSync(modDir).isDirectory()) {
    report.errors.push('Mod directory does not exist or is not a directory.');
    return report;
  }
  // Check for manifest.json
  const manifestPath = path.join(modDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    report.errors.push('Missing manifest.json');
    return report;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    report.manifest = manifest;
    // Basic manifest checks
    if (!manifest.id) report.errors.push('Manifest missing id');
    if (!manifest.name) report.errors.push('Manifest missing name');
    if (!manifest.version) report.warnings.push('Manifest missing version');
    if (!manifest.author) report.warnings.push('Manifest missing author');
    // Check for dependencies/conflicts
    if (manifest.dependencies && !Array.isArray(manifest.dependencies)) report.errors.push('Manifest dependencies should be an array');
    if (manifest.conflicts && !Array.isArray(manifest.conflicts)) report.errors.push('Manifest conflicts should be an array');
  } catch (err) {
    report.errors.push('Failed to parse manifest.json: ' + err.message);
    return report;
  }
  // Check for at least one data file (not manifest, not backup)
  const files = fs.readdirSync(modDir).filter(f => !f.startsWith('manifest') && !f.startsWith('backups'));
  if (!files.length) report.errors.push('No data files found in mod directory.');
  return report;
} 