import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import followRedirects from 'follow-redirects';
import { fileURLToPath } from 'url';

const { https } = followRedirects;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// URLs for official binaries (replace with actual URLs for production use)
const TOOL_URLS = {
  'tools/vorbis-tools/oggenc.exe': 'https://github.com/xiph/vorbis-tools/releases/download/v1.4.2/oggenc.exe',
  'tools/ww2ogg/ww2ogg.exe': 'https://github.com/hcs64/ww2ogg/releases/download/v0.24/ww2ogg.exe',
  'tools/ww2ogg/packaged_codebooks.bin': 'https://github.com/hcs64/ww2ogg/releases/download/v0.24/packed_codebooks_aoTuV_603.bin',
  'tools/revorb/revorb.exe': 'https://github.com/hcs64/revorb/releases/download/v1.8.0/revorb.exe',
};

const TOOLS_DIR = path.join(__dirname, 'tools');
const CP77TOOLS_DIR = path.join(TOOLS_DIR, 'cp77tools');
const CP77TOOLS_EXE = path.join(CP77TOOLS_DIR, 'cp77tools.exe');
const CP77TOOLS_URL = 'https://github.com/rfuzzo/cp77tools/releases/latest/download/cp77tools.exe';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

export async function checkAndDownloadExternalTools() {
  for (const [toolPath, url] of Object.entries(TOOL_URLS)) {
    if (!fs.existsSync(toolPath)) {
      console.log(`[startupChecks] Downloading missing tool: ${toolPath}`);
      try {
        await downloadFile(url, toolPath);
        console.log(`[startupChecks] Downloaded: ${toolPath}`);
      } catch (err) {
        console.error(`[startupChecks] Failed to download ${toolPath}:`, err.message);
      }
    }
  }
}

export function checkAndInstallNpmDependencies() {
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('[startupChecks] node_modules not found. Running npm install...');
    const result = spawnSync('npm', ['install'], { stdio: 'inherit', shell: true });
    if (result.status !== 0) {
      throw new Error('[startupChecks] npm install failed.');
    }
    return;
  }
  // Check for missing dependencies
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  let missing = [];
  for (const dep of deps) {
    try {
      require.resolve(dep, { paths: [nodeModulesPath] });
    } catch {
      missing.push(dep);
    }
  }
  if (missing.length > 0) {
    console.log(`[startupChecks] Missing dependencies: ${missing.join(', ')}. Installing...`);
    const result = spawnSync('npm', ['install', ...missing], { stdio: 'inherit', shell: true });
    if (result.status !== 0) {
      throw new Error('[startupChecks] npm install for missing dependencies failed.');
    }
  }
}

export async function ensureCp77toolsExistsStartup() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(CP77TOOLS_EXE)) {
      resolve();
      return;
    }
    if (!fs.existsSync(CP77TOOLS_DIR)) fs.mkdirSync(CP77TOOLS_DIR, { recursive: true });
    const file = fs.createWriteStream(CP77TOOLS_EXE);
    https.get(CP77TOOLS_URL, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error('Failed to download cp77tools: ' + response.statusCode));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlinkSync(CP77TOOLS_EXE);
      reject(err);
    });
  });
} 