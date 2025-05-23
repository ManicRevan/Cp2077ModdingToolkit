import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import Store from 'electron-store';
import { fileURLToPath } from 'url';
import * as aiService from './aiService.js';
import { checkAndInstallNpmDependencies, checkAndDownloadExternalTools, ensureCp77toolsExistsStartup } from './startupChecks.js';
import * as moddingFunctions from './moddingFunctions.js';
import { QuestBuilder, buildQuest } from './questbuilder.js';
import axios from 'axios';
import FormData from 'form-data';
import { execFile } from 'child_process';
import simpleGit from 'simple-git';
import AdmZip from 'adm-zip';
import * as meshEditor from './tools/meshEditor.js';
import * as modDependencyManager from './modDependencyManager.js';
import * as savegameEditor from './savegameEditor.js';
import * as archiveTools from './archiveTools.js';
import * as communityService from './communityService.js';
import * as assetManager from './assetManager.js';
import * as voiceModelManager from './voiceModelManager.js';
import PluginEngine from './pluginEngine.js';
import * as assetMarket from './assetMarket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize persistent storage with defaults
const store = new Store({
  name: 'cp77-modding-toolkit-config',
  defaults: {
    windowState: {
      width: 1280,
      height: 800,
      x: undefined,
      y: undefined,
      isMaximized: false
    },
    gamePath: '',
    recentProjects: [],
    theme: 'dark'
  }
});

// Global window reference to prevent garbage collection
let mainWindow;
let pluginEngineInstance = null;

function createWindow() {
  const windowState = store.get('windowState');

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 900,
    minHeight: 700,
    show: false, // Don't show until ready-to-show
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#1A1A1A',
    icon: path.join(__dirname, 'assets/icons/app-icon.png')
  });

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Show window when ready to avoid flash of white
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Restore maximized state if it was maximized last session
    if (windowState.isMaximized) {
      mainWindow.maximize();
    }
  });

  // Save window position/size on close
  mainWindow.on('close', () => {
    const isMaximized = mainWindow.isMaximized();
    
    // Only update bounds if not maximized
    if (!isMaximized) {
      const bounds = mainWindow.getBounds();
      store.set('windowState', {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized: false
      });
    } else {
      // Just update the maximized state
      store.set('windowState.isMaximized', true);
    }
  });

  // Dereference when closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Application lifecycle events
app.on('ready', async () => {
  try {
    await ensureCp77toolsExistsStartup();
    checkAndInstallNpmDependencies();
    await checkAndDownloadExternalTools();
  } catch (err) {
    console.error('[Startup] Failed to prepare environment:', err);
    app.quit();
    return;
  }
  createWindow();
  setupIPC();
  setupMeshEditorIPC();
  pluginEngineInstance = new PluginEngine({ pluginDir: path.join(__dirname, 'plugins') });
  await pluginEngineInstance.init();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Set up IPC handlers
function setupIPC() {
  // Settings management
  ipcMain.handle('settings:get', (event, key) => {
    return store.get(key);
  });

  ipcMain.handle('settings:set', (event, key, value) => {
    store.set(key, value);
    return true;
  });
  
  // File dialogs
  ipcMain.handle('dialog:selectGameDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Cyberpunk 2077 Game Directory',
      properties: ['openDirectory']
    });
    
    if (!canceled && filePaths.length > 0) {
      // Validate if this is a CP2077 directory
      const isValid = validateGameDirectory(filePaths[0]);
      if (isValid) {
        store.set('gamePath', filePaths[0]);
        return { path: filePaths[0], valid: true };
      } else {
        return { path: filePaths[0], valid: false };
      }
    }
    return null;
  });
  
  // Project management
  ipcMain.handle('project:save', (event, projectData) => {
    // Add to recent projects
    const recentProjects = store.get('recentProjects');
    const exists = recentProjects.findIndex(p => p.id === projectData.id);
    
    if (exists >= 0) {
      recentProjects[exists] = projectData;
    } else {
      recentProjects.unshift(projectData);
      // Keep only the 10 most recent projects
      if (recentProjects.length > 10) {
        recentProjects.pop();
      }
    }
    
    store.set('recentProjects', recentProjects);
    return true;
  });

  // === Advanced AI Features IPC ===
  ipcMain.handle('ai:generateVoiceAdvanced', async (event, opts) => aiService.generateVoiceAdvanced(opts));
  ipcMain.handle('ai:generateImageAdvanced', async (event, opts) => aiService.generateImageAdvanced(opts));
  ipcMain.handle('ai:generateNPCProfile', async (event, opts) => aiService.generateNPCProfile(opts));
  ipcMain.handle('ai:generateQuest', async (event, opts) => aiService.generateQuest(opts));
  ipcMain.handle('ai:expandDialogue', async (event, opts) => aiService.expandDialogue(opts));
  ipcMain.handle('ai:translateDialogue', async (event, opts) => aiService.translateDialogue(opts));
  ipcMain.handle('ai:generateSoundEffect', async (event, opts) => aiService.generateSoundEffect(opts));
  ipcMain.handle('ai:generateMusic', async (event, opts) => aiService.generateMusic(opts));
  ipcMain.handle('ai:autoTagAsset', async (event, opts) => aiService.autoTagAsset(opts));
  ipcMain.handle('ai:runSmartSearch', async (event, opts) => aiService.runSmartSearch(opts));
  ipcMain.handle('ai:upscaleAsset', async (event, opts) => aiService.upscaleAsset(opts));
  ipcMain.handle('ai:askAssistant', async (event, opts) => aiService.askAssistant(opts));
  ipcMain.handle('ai:generateQuestNodeGraph', async (event, opts) => {
    function robustParseGraph(text) {
      // Remove markdown code block wrappers if present
      let cleaned = text.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '').trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '').trim();
      if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '').trim();
      // Try direct parse
      try {
        return JSON.parse(cleaned);
      } catch {}
      // Try to extract first {...} JSON object
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch {}
      }
      // Try to extract first [ ... ] array (for legacy responses)
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try { return JSON.parse(arrMatch[0]); } catch {}
      }
      throw new Error('Could not parse a valid quest node graph JSON from OpenAI response.');
    }
    try {
      const prompt = opts.prompt || '';
      // Get OpenAI API key from settings or env
      const storeApiKey = store.get('openaiApiKey') || process.env.OPENAI_API_KEY;
      const apiKey = opts.apiKey || storeApiKey;
      if (!apiKey) {
        throw new Error('No OpenAI API key set. Please add your key in settings.');
      }
      // Advanced prompt engineering: few-shot example and strict instructions
      const systemPrompt = `You are an expert Cyberpunk 2077 modder. Generate a quest node graph for a visual node editor. 
ALWAYS output ONLY a JSON object with two arrays: nodes (with type, name, desc, props) and connections (with source, target, label). No explanation, no extra text, no markdown. 
Example:
{"nodes":[{"type":"start","name":"Start","desc":"Quest begins","props":{}},{"type":"objective","name":"Meet the Fixer","desc":"Go to the Afterlife","props":{"objectiveText":"Go to the Afterlife"}},{"type":"decision","name":"Choose Approach","desc":"Decide how to handle the job","props":{}},{"type":"action","name":"Stealth Route","desc":"Sneak in","props":{}},{"type":"action","name":"Guns Blazing","desc":"Fight your way in","props":{}},{"type":"end","name":"Quest Complete","desc":"You finished the job","props":{}}],"connections":[{"source":"quest-node-1","target":"quest-node-2","label":""},{"source":"quest-node-2","target":"quest-node-3","label":""},{"source":"quest-node-3","target":"quest-node-4","label":"choice: stealth"},{"source":"quest-node-3","target":"quest-node-5","label":"choice: combat"},{"source":"quest-node-4","target":"quest-node-6","label":""},{"source":"quest-node-5","target":"quest-node-6","label":""}]}`;
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ];
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages,
        max_tokens: 800
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      let graph;
      try {
        // Robustly parse the response as JSON
        const text = response.data.choices[0].message.content;
        graph = robustParseGraph(text);
      } catch (err) {
        throw new Error('OpenAI did not return valid quest node graph JSON. ' + err.message);
      }
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.connections)) {
        throw new Error('OpenAI response missing nodes or connections.');
      }
      return { success: true, graph };
    } catch (err) {
      // Fallback to static example
      const graph = {
        nodes: [
          { type: 'start', name: 'Start', desc: 'Quest begins', props: {} },
          { type: 'objective', name: 'Meet the Fixer', desc: 'Go to the Afterlife', props: { objectiveText: 'Go to the Afterlife' } },
          { type: 'decision', name: 'Choose Approach', desc: 'Decide how to handle the job', props: {} },
          { type: 'action', name: 'Stealth Route', desc: 'Sneak in', props: {} },
          { type: 'action', name: 'Guns Blazing', desc: 'Fight your way in', props: {} },
          { type: 'end', name: 'Quest Complete', desc: 'You finished the job', props: {} }
        ],
        connections: [
          { source: 'quest-node-1', target: 'quest-node-2', label: '' },
          { source: 'quest-node-2', target: 'quest-node-3', label: '' },
          { source: 'quest-node-3', target: 'quest-node-4', label: 'choice: stealth' },
          { source: 'quest-node-3', target: 'quest-node-5', label: 'choice: combat' },
          { source: 'quest-node-4', target: 'quest-node-6', label: '' },
          { source: 'quest-node-5', target: 'quest-node-6', label: '' }
        ]
      };
      return { success: false, error: err.message, graph };
    }
  });

  // === Modding Functions IPC ===
  ipcMain.handle('modding:importMesh', async (event, inputFile, outputDir) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.importMesh(inputFile, outputDir, code => {
        resolve(code === 0);
      });
    });
  });
  ipcMain.handle('modding:exportMesh', async (event, inputFile, outputDir) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.exportMesh(inputFile, outputDir, code => {
        resolve(code === 0);
      });
    });
  });
  ipcMain.handle('modding:importAnimation', async (event, inputFile, outputDir) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.importAnimation(inputFile, outputDir, code => {
        resolve(code === 0);
      });
    });
  });
  ipcMain.handle('modding:exportAnimation', async (event, inputFile, outputDir) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.exportAnimation(inputFile, outputDir, code => {
        resolve(code === 0);
      });
    });
  });
  ipcMain.handle('modding:packArchive', async (event, inputDir, outputArchive) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.packArchive(inputDir, outputArchive, code => {
        resolve(code === 0);
      });
    });
  });
  ipcMain.handle('modding:unpackArchive', async (event, inputArchive, outputDir) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.unpackArchive(inputArchive, outputDir, code => {
        resolve(code === 0);
      });
    });
  });
  ipcMain.handle('modding:extractUI', async (event, inputArchive, outputDir) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.extractUI(inputArchive, outputDir, code => {
        resolve(code === 0);
      });
    });
  });
  ipcMain.handle('modding:repackUI', async (event, inputDir, outputArchive) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.repackUI(inputDir, outputArchive, code => {
        resolve(code === 0);
      });
    });
  });
  ipcMain.handle('modding:extractLocalization', async (event, inputArchive, outputDir) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.extractLocalization(inputArchive, outputDir, code => {
        resolve(code === 0);
      });
    });
  });
  ipcMain.handle('modding:repackLocalization', async (event, inputDir, outputArchive) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.repackLocalization(inputDir, outputArchive, code => {
        resolve(code === 0);
      });
    });
  });
  ipcMain.handle('modding:editSavegame', async (event, inputSave, outputSave, edits) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.editSavegame(inputSave, outputSave, edits, err => {
        resolve(!err);
      });
    });
  });
  ipcMain.handle('modding:installPlugin', async (event, pluginUrl, pluginsDir) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.installPlugin(pluginUrl, pluginsDir, err => {
        resolve(!err);
      });
    });
  });
  ipcMain.handle('modding:compileREDscript', async (event, scriptsDir, outputDir) => {
    return new Promise((resolve, reject) => {
      moddingFunctions.compileREDscript(scriptsDir, outputDir, code => {
        resolve(code === 0);
      });
    });
  });

  // === Batch Modding Functions IPC ===
  ipcMain.handle('modding:batchImportMesh', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchImportMesh(files, 'mod/meshes', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchExportMesh', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchExportMesh(files, 'output/meshes', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchConvertMesh', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchConvertMesh(files, 'output/meshes', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchImportTexture', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchImportTexture(files, 'mod/textures', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchExportTexture', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchExportTexture(files, 'output/textures', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchConvertTexture', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchConvertTexture(files, 'output/textures', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchImportAudio', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchImportAudio(files, 'mod/audio', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchExportAudio', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchExportAudio(files, 'output/audio', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchConvertAudio', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchConvertAudio(files, 'output/audio', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchImportQuest', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchImportQuest(files, 'mod/quests', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchExportQuest', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchExportQuest(files, 'output/quests', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchConvertQuest', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchConvertQuest(files, 'output/quests', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchImportScene', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchImportScene(files, 'mod/scenes', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchExportScene', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchExportScene(files, 'output/scenes', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchConvertScene', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchConvertScene(files, 'output/scenes', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchImportNPC', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchImportNPC(files, 'mod/npcs', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchExportNPC', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchExportNPC(files, 'output/npcs', (result) => resolve(result));
    });
  });
  ipcMain.handle('modding:batchConvertNPC', async (event, files) => {
    return new Promise((resolve) => {
      moddingFunctions.batchConvertNPC(files, 'output/npcs', (result) => resolve(result));
    });
  });
  // === Global Batch Automation ===
  ipcMain.handle('modding:batchImportAll', async (event, files) => {
    // Dispatch to all batch importers based on file type
    // For simplicity, call all batch importers
    let results = [];
    await new Promise((resolve) => {
      moddingFunctions.batchImportMesh(files, 'mod/meshes', (r) => { results.push(r); });
      moddingFunctions.batchImportTexture(files, 'mod/textures', (r) => { results.push(r); });
      moddingFunctions.batchImportAudio(files, 'mod/audio', (r) => { results.push(r); });
      moddingFunctions.batchImportQuest(files, 'mod/quests', (r) => { results.push(r); });
      moddingFunctions.batchImportScene(files, 'mod/scenes', (r) => { results.push(r); });
      moddingFunctions.batchImportNPC(files, 'mod/npcs', (r) => { results.push(r); });
      resolve();
    });
    return results.every(Boolean);
  });
  ipcMain.handle('modding:batchExportAll', async (event, files) => {
    let results = [];
    await new Promise((resolve) => {
      moddingFunctions.batchExportMesh(files, 'output/meshes', (r) => { results.push(r); });
      moddingFunctions.batchExportTexture(files, 'output/textures', (r) => { results.push(r); });
      moddingFunctions.batchExportAudio(files, 'output/audio', (r) => { results.push(r); });
      moddingFunctions.batchExportQuest(files, 'output/quests', (r) => { results.push(r); });
      moddingFunctions.batchExportScene(files, 'output/scenes', (r) => { results.push(r); });
      moddingFunctions.batchExportNPC(files, 'output/npcs', (r) => { results.push(r); });
      resolve();
    });
    return results.every(Boolean);
  });
  ipcMain.handle('modding:batchConvertAll', async (event, files) => {
    let results = [];
    await new Promise((resolve) => {
      moddingFunctions.batchConvertMesh(files, 'output/meshes', (r) => { results.push(r); });
      moddingFunctions.batchConvertTexture(files, 'output/textures', (r) => { results.push(r); });
      moddingFunctions.batchConvertAudio(files, 'output/audio', (r) => { results.push(r); });
      moddingFunctions.batchConvertQuest(files, 'output/quests', (r) => { results.push(r); });
      moddingFunctions.batchConvertScene(files, 'output/scenes', (r) => { results.push(r); });
      moddingFunctions.batchConvertNPC(files, 'output/npcs', (r) => { results.push(r); });
      resolve();
    });
    return results.every(Boolean);
  });

  // === Plugin Management IPC (extended for enable/disable/import) ===
  const pluginsDir = path.join(__dirname, 'plugins');
  const getPluginList = () => {
    if (!fs.existsSync(pluginsDir)) return [];
    return fs.readdirSync(pluginsDir).filter(f => fs.statSync(path.join(pluginsDir, f)).isDirectory()).map(id => {
      const metaPath = path.join(pluginsDir, id, 'plugin.json');
      let meta = { id, name: id, version: '', description: '', author: '', path: path.join(pluginsDir, id) };
      if (fs.existsSync(metaPath)) {
        try { Object.assign(meta, JSON.parse(fs.readFileSync(metaPath, 'utf8'))); } catch {}
      }
      return meta;
    });
  };
  ipcMain.handle('modding:listPlugins', async () => getPluginList());
  ipcMain.handle('modding:getPluginDetails', async (event, pluginId) => {
    const pluginPath = path.join(pluginsDir, pluginId);
    const metaPath = path.join(pluginPath, 'plugin.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        meta.id = pluginId;
        meta.path = pluginPath;
        return meta;
      } catch (e) {}
    }
    return { id: pluginId, name: pluginId, path: pluginPath };
  });
  ipcMain.handle('modding:updatePlugin', async (event, pluginId) => {
    // For now, just re-download plugin.json if a URL is present
    const pluginPath = path.join(pluginsDir, pluginId);
    const metaPath = path.join(pluginPath, 'plugin.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta.updateUrl) {
          const https = require('https');
          const file = fs.createWriteStream(metaPath);
          return new Promise(resolve => {
            https.get(meta.updateUrl, response => {
              response.pipe(file);
              file.on('finish', () => file.close(() => resolve(true)));
            }).on('error', () => resolve(false));
          });
        }
      } catch {}
    }
    return false;
  });
  ipcMain.handle('modding:removePlugin', async (event, pluginId) => {
    const pluginPath = path.join(pluginsDir, pluginId);
    try {
      fs.rmSync(pluginPath, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('modding:enablePlugin', async (event, pluginId) => {
    try {
      // Enable plugin (could be a flag in plugin.json or a state file)
      const pluginPath = path.join(pluginsDir, pluginId, 'plugin.json');
      if (fs.existsSync(pluginPath)) {
        const meta = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
        meta.enabled = true;
        fs.writeFileSync(pluginPath, JSON.stringify(meta, null, 2));
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  });
  ipcMain.handle('modding:disablePlugin', async (event, pluginId) => {
    try {
      // Disable plugin (could be a flag in plugin.json or a state file)
      const pluginPath = path.join(pluginsDir, pluginId, 'plugin.json');
      if (fs.existsSync(pluginPath)) {
        const meta = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
        meta.enabled = false;
        fs.writeFileSync(pluginPath, JSON.stringify(meta, null, 2));
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  });
  ipcMain.handle('modding:importPlugin', async (event, filePath) => {
    try {
      // Import plugin file to plugins directory
      const fileName = path.basename(filePath);
      const destPath = path.join(pluginsDir, fileName);
      fs.copyFileSync(filePath, destPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('modding:saveScriptFile', async (event, filePath, content) => {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    } catch (err) {
      return false;
    }
  });
  ipcMain.handle('modding:compileScriptFile', async (event, filePath) => {
    try {
      const compiledOutputDir = path.dirname(filePath) + '/compiled';
      fs.mkdirSync(compiledOutputDir, { recursive: true });
      return await new Promise((resolve) => {
        moddingFunctions.compileREDscript(path.dirname(filePath), compiledOutputDir, code => {
          resolve({ success: code === 0, error: code === 0 ? null : 'Compilation error (code ' + code + ')'});
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // === RHT Hot Reload Integration ===
  const getHotFolder = () => {
    // Default RHT hot folder path (user may need to configure)
    // Example: C:/Games/Cyberpunk 2077/archive/pc/hot
    const gamePath = store.get('gamePath') || '';
    if (!gamePath) return null;
    return path.join(gamePath, 'archive', 'pc', 'hot');
  };
  ipcMain.handle('modding:checkRHTStatus', async () => {
    const hotFolder = getHotFolder();
    if (!hotFolder) return { installed: false, error: 'Game path not set' };
    return { installed: fs.existsSync(hotFolder), path: hotFolder };
  });
  ipcMain.handle('modding:sendToHotReload', async (event, filePath) => {
    const hotFolder = getHotFolder();
    if (!hotFolder) return { success: false, error: 'Game path or hot folder not set' };
    try {
      fs.mkdirSync(hotFolder, { recursive: true });
      const dest = path.join(hotFolder, path.basename(filePath));
      fs.copyFileSync(filePath, dest);
      return { success: true, dest };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('modding:openHotFolder', async () => {
    const hotFolder = getHotFolder();
    if (hotFolder && fs.existsSync(hotFolder)) {
      require('child_process').exec(`start "" "${hotFolder}"`);
    }
    return true;
  });

  // === Quest Node Graph Export IPC ===
  ipcMain.handle('modding:exportQuestFromNodeGraph', async (event, questData) => {
    try {
      const outputPath = path.join(__dirname, 'mod', 'quests');
      const ok = buildQuest(questData, outputPath, 'archiveXL');
      return { success: !!ok };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // === AI-powered Asset Enhancement IPC ===
  const modOutputDir = path.join(__dirname, 'mod', 'output');

  // Image upscaling with Real-ESRGAN (local binary or API)
  ipcMain.handle('ai:upscaleImage', async (event, opts) => {
    try {
      const file = opts.file?.path || opts.file;
      if (!file) throw new Error('No file provided');
      const outFile = path.join(modOutputDir, 'upscaled_' + path.basename(file));
      // Try local Real-ESRGAN first
      const realEsrganPath = path.join(__dirname, 'tools', 'realesrgan-ncnn-vulkan.exe');
      if (fs.existsSync(realEsrganPath)) {
        await new Promise((resolve, reject) => {
          execFile(realEsrganPath, ['-i', file, '-o', outFile, '-n', 'realesrgan-x4plus'], (err) => {
            if (err) reject(err); else resolve();
          });
        });
        return { success: true, file: outFile };
      } else {
        // Fallback: use Replicate API (requires API key)
        const apiKey = process.env.REPLICATE_API_TOKEN;
        if (!apiKey) throw new Error('Real-ESRGAN not found and no Replicate API key set.');
        const form = new FormData();
        form.append('version', '9288c0e0b8e6e7e0e7e0e7e0e7e0e7e0e7e0e7e0e7e0e7e0e7e0e7e0e7e0e7e0');
        form.append('input', fs.createReadStream(file));
        const res = await axios.post('https://api.replicate.com/v1/predictions', form, {
          headers: { ...form.getHeaders(), Authorization: `Token ${apiKey}` }
        });
        // Poll for result
        let outputUrl = null;
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const poll = await axios.get(res.data.urls.get, { headers: { Authorization: `Token ${apiKey}` } });
          if (poll.data.status === 'succeeded') {
            outputUrl = poll.data.output[0];
            break;
          } else if (poll.data.status === 'failed') {
            throw new Error('Upscaling failed via API');
          }
        }
        if (!outputUrl) throw new Error('Upscaling timed out');
        const imgRes = await axios.get(outputUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(outFile, imgRes.data);
        return { success: true, file: outFile };
      }
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // Voice cloning with ElevenLabs API
  ipcMain.handle('ai:voiceClone', async (event, opts) => {
    try {
      const apiKey = opts.apiKey || process.env.ELEVENLABS_API_KEY;
      if (!apiKey) throw new Error('No ElevenLabs API key provided');
      const text = opts.textBatch;
      const sample = opts.voiceCloneFile?.path || opts.voiceCloneFile;
      if (!text) throw new Error('No text provided');
      // Upload voice sample to ElevenLabs (if provided)
      let voiceId = 'EXAVITQu4vr4xnSDxMaL'; // Default voice
      if (sample) {
        const form = new FormData();
        form.append('name', 'ClonedVoice');
        form.append('files', fs.createReadStream(sample));
        const res = await axios.post('https://api.elevenlabs.io/v1/voices/add', form, {
          headers: { ...form.getHeaders(), 'xi-api-key': apiKey }
        });
        voiceId = res.data.voice_id;
      }
      // Generate speech
      const outFile = path.join(modOutputDir, 'voice_' + Date.now() + '.mp3');
      const ttsRes = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8 }
      }, {
        headers: { 'xi-api-key': apiKey },
        responseType: 'arraybuffer'
      });
      fs.writeFileSync(outFile, ttsRes.data);
      return { success: true, file: outFile };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // Animation retargeting using Blender CLI (requires Blender and retarget script)
  ipcMain.handle('ai:retargetAnimation', async (event, opts) => {
    try {
      const src = opts.source?.path || opts.source;
      const tgt = opts.target?.path || opts.target;
      if (!src || !tgt) throw new Error('Source and target animation files required');
      const blenderPath = process.env.BLENDER_PATH || 'blender';
      const scriptPath = path.join(__dirname, 'tools', 'retarget_anim.py');
      const outFile = path.join(modOutputDir, 'retargeted_' + path.basename(src));
      if (!fs.existsSync(scriptPath)) throw new Error('Retarget script not found');
      await new Promise((resolve, reject) => {
        execFile(blenderPath, ['--background', '--python', scriptPath, '--', src, tgt, outFile], (err) => {
          if (err) reject(err); else resolve();
        });
      });
      return { success: true, file: outFile };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // === Procedural Content Generation IPC ===
  ipcMain.handle('ai:generateCityBlock', async (event, opts) => {
    try {
      const prompt = opts.prompt || '';
      const apiKey = store.get('openaiApiKey') || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('No OpenAI API key set.');
      const systemPrompt = `You are a Cyberpunk 2077 modder. Generate a city block layout as a JSON object. Output ONLY JSON, no explanation. Example format: {"name":"Block A","size":"large","features":["alley","market","neon signs"],"buildings":[{"type":"shop","position":[1,2]},{"type":"apartment","position":[3,4]}]}`;
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ];
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages,
        max_tokens: 800
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      let data;
      try {
        let text = response.data.choices[0].message.content.trim();
        if (text.startsWith('```json')) text = text.replace(/^```json/, '').trim();
        if (text.startsWith('```')) text = text.replace(/^```/, '').trim();
        if (text.endsWith('```')) text = text.replace(/```$/, '').trim();
        data = JSON.parse(text);
      } catch (err) {
        throw new Error('OpenAI did not return valid city block JSON.');
      }
      const outFile = path.join(__dirname, 'mod', 'output', `cityblock_${Date.now()}.json`);
      fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
      return { success: true, file: outFile };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('ai:generateNPCCrowd', async (event, opts) => {
    try {
      const prompt = opts.prompt || '';
      const apiKey = store.get('openaiApiKey') || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('No OpenAI API key set.');
      const systemPrompt = `You are a Cyberpunk 2077 modder. Generate an NPC crowd definition as a JSON array. Output ONLY JSON, no explanation. Example format: [{"type":"vendor","behavior":"selling","position":[1,2]},{"type":"street kid","behavior":"loitering","position":[3,4]}]`;
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ];
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages,
        max_tokens: 800
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      let data;
      try {
        let text = response.data.choices[0].message.content.trim();
        if (text.startsWith('```json')) text = text.replace(/^```json/, '').trim();
        if (text.startsWith('```')) text = text.replace(/^```/, '').trim();
        if (text.endsWith('```')) text = text.replace(/```$/, '').trim();
        data = JSON.parse(text);
      } catch (err) {
        throw new Error('OpenAI did not return valid NPC crowd JSON.');
      }
      const outFile = path.join(__dirname, 'mod', 'output', `npccrowd_${Date.now()}.json`);
      fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
      return { success: true, file: outFile };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // === Publish/Versioning IPC ===
  const modDir = path.join(__dirname, 'mod');
  const publishOutputDir = path.join(__dirname, 'output');

  // NexusMods/ModDB publishing
  ipcMain.handle('modding:publishMod', async (event, opts) => {
    try {
      const { apiKey, title, desc, version, changelog, deps } = opts;
      // Archive the mod folder
      const archivePath = path.join(publishOutputDir, `${title.replace(/\s+/g, '_')}_v${version}.zip`);
      const zip = new AdmZip();
      zip.addLocalFolder(modDir);
      zip.writeZip(archivePath);
      // NexusMods API
      if (apiKey.startsWith('NEXUS-')) {
        // Upload to NexusMods
        const apiUrl = 'https://api.nexusmods.com/v1/games/cyberpunk2077/mods.json';
        const form = new FormData();
        form.append('name', title);
        form.append('version', version);
        form.append('summary', desc);
        form.append('description', desc);
        form.append('changelog', changelog);
        form.append('category_id', '1');
        form.append('dependencies', deps);
        form.append('file', fs.createReadStream(archivePath));
        const res = await axios.post(apiUrl, form, {
          headers: { ...form.getHeaders(), apikey: apiKey }
        });
        if (res.status === 201 || res.status === 200) {
          return { success: true };
        } else {
          throw new Error('NexusMods upload failed: ' + res.statusText);
        }
      } else if (apiKey.startsWith('MODDB-')) {
        // Upload to ModDB
        const apiUrl = 'https://api.moddb.com/v1/games/cyberpunk2077/mods';
        const form = new FormData();
        form.append('name', title);
        form.append('description', desc);
        form.append('changelog', changelog);
        form.append('version', version);
        form.append('dependencies', deps);
        form.append('file', fs.createReadStream(archivePath));
        const res = await axios.post(apiUrl, form, {
          headers: { ...form.getHeaders(), apikey: apiKey }
        });
        if (res.status === 201 || res.status === 200) {
          return { success: true };
        } else {
          throw new Error('ModDB upload failed: ' + res.statusText);
        }
      } else {
        throw new Error('Unknown API key type. Use NexusMods or ModDB API key.');
      }
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // Git integration using simple-git
  const git = simpleGit({ baseDir: modDir });
  ipcMain.handle('modding:gitInit', async () => {
    try {
      await git.init();
      await git.add('.');
      await git.commit('Initial commit');
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });
  ipcMain.handle('modding:gitCommit', async (event, opts) => {
    try {
      await git.add('.');
      await git.commit(opts.message || 'Update');
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });
  ipcMain.handle('modding:gitPush', async () => {
    try {
      await git.push();
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });
  ipcMain.handle('modding:gitLog', async () => {
    try {
      const log = await git.log();
      const logStr = log.all.map(entry => `${entry.hash.substr(0,7)} ${entry.date} ${entry.message}`).join('\n');
      return { success: true, log: logStr };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('modding:generateMeshLODs', async (event, inputFile, outputDir, lodRatios) => {
    return new Promise((resolve) => {
      const outDir = outputDir || path.join(__dirname, 'output', 'meshes', 'LODs');
      moddingFunctions.generateMeshLODs(inputFile, outDir, lodRatios || [1.0, 0.5, 0.25], code => {
        resolve(code === 0);
      });
    });
  });
  ipcMain.handle('modding:batchGenerateMeshLODs', async (event, files, outputDir, lodRatios) => {
    return new Promise((resolve) => {
      const outDir = outputDir || path.join(__dirname, 'output', 'meshes', 'LODs');
      moddingFunctions.batchGenerateMeshLODs(files, outDir, lodRatios || [1.0, 0.5, 0.25], result => {
        resolve(result);
      });
    });
  });

  ipcMain.handle('modding:analyzeAsset', async (event, assetPath) => {
    return new Promise((resolve) => {
      moddingFunctions.analyzeAsset(assetPath, report => resolve(report));
    });
  });
  ipcMain.handle('modding:analyzeMod', async (event, modDir) => {
    return new Promise((resolve) => {
      moddingFunctions.analyzeMod(modDir, report => resolve(report));
    });
  });

  // === Asset Market IPC ===
  ipcMain.handle('assetMarket:searchAssets', async (event, query, page, perPage) => {
    return await assetMarket.searchAssets(query, page, perPage);
  });
  ipcMain.handle('assetMarket:getAssetDetails', async (event, uid) => {
    return await assetMarket.getAssetDetails(uid);
  });
  ipcMain.handle('assetMarket:downloadAsset', async (event, uid, destDir) => {
    return await assetMarket.downloadAsset(uid, destDir);
  });

  // === UI/HUD Asset Extraction and Repacking IPC ===
  ipcMain.handle('modding:extractUIAssets', async (event, inputArchive, outputDir) => {
    return new Promise((resolve) => {
      moddingFunctions.extractUIAssets(inputArchive, outputDir, code => {
        resolve(code === 0);
      });
    });
  });
  ipcMain.handle('modding:repackUIAssets', async (event, inputDir, outputArchive) => {
    return new Promise((resolve) => {
      moddingFunctions.repackUIAssets(inputDir, outputArchive, code => {
        resolve(code === 0);
      });
    });
  });

  // === Mod Dependency Management IPC ===
  ipcMain.handle('modding:readManifest', async (event, modDir) => {
    try {
      return modDependencyManager.readManifest(modDir);
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle('modding:writeManifest', async (event, modDir, manifest) => {
    try {
      modDependencyManager.writeManifest(modDir, manifest);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('modding:scanAvailableMods', async (event, modsDir) => {
    try {
      return modDependencyManager.scanAvailableMods(modsDir);
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle('modding:resolveDependencies', async (event, manifest, availableMods, modVersions) => {
    try {
      return modDependencyManager.resolveDependencies(manifest, availableMods, modVersions);
    } catch (err) {
      return { error: err.message };
    }
  });

  // === Savegame Editing IPC ===
  ipcMain.handle('savegame:load', async (event, filePath) => {
    try {
      const save = await savegameEditor.loadSavegame(filePath);
      return { success: true, save };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('savegame:getSummary', async (event, save) => {
    try {
      return { success: true, summary: savegameEditor.getSaveSummary(save) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('savegame:edit', async (event, save, edits) => {
    try {
      const edited = savegameEditor.editSavegame(save, edits);
      return { success: true, save: edited };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('savegame:save', async (event, save, outPath) => {
    try {
      await savegameEditor.saveSavegame(save, outPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // === Archive Management IPC ===
  ipcMain.handle('archive:listContents', async (event, archivePath) => {
    try {
      const result = await archiveTools.listArchiveContents(archivePath);
      return { success: true, contents: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('archive:diff', async (event, archiveA, archiveB) => {
    try {
      const result = await archiveTools.diffArchives(archiveA, archiveB);
      return { success: true, diff: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('archive:verify', async (event, archivePath) => {
    try {
      const result = await archiveTools.verifyArchive(archivePath);
      return { success: true, verify: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // === Community/Sharing IPC ===
  ipcMain.handle('community:browseMods', async (event, apiKey, query, page) => {
    try {
      const mods = await communityService.browseMods(apiKey, query, page);
      return { success: true, mods };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('community:downloadMod', async (event, apiKey, modId, destDir) => {
    try {
      const file = await communityService.downloadMod(apiKey, modId, destDir);
      return { success: true, file };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('community:rateMod', async (event, apiKey, modId, rating) => {
    try {
      await communityService.rateMod(apiKey, modId, rating);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('community:commentMod', async (event, apiKey, modId, comment) => {
    try {
      await communityService.commentMod(apiKey, modId, comment);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('community:getComments', async (event, modId) => {
    try {
      const comments = await communityService.getComments(modId);
      return { success: true, comments };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('community:uploadAsset', async (event, apiKey, filePath, meta) => {
    try {
      const asset = await communityService.uploadAsset(apiKey, filePath, meta);
      return { success: true, asset };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('community:browseAssets', async (event, query, page) => {
    try {
      const assets = await communityService.browseAssets(query, page);
      return { success: true, assets };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // === Asset Management IPC ===
  ipcMain.handle('asset:scanAssets', async (event, dirs) => {
    try {
      const assets = assetManager.scanAssets(dirs);
      return { success: true, assets };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('asset:tagAsset', async (event, assetPath, tags) => {
    try {
      const ok = assetManager.tagAsset(assetPath, tags);
      return { success: ok };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('asset:searchAssets', async (event, query) => {
    try {
      const assets = assetManager.searchAssets(query);
      return { success: true, assets };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('asset:getAssetPreview', async (event, assetPath) => {
    try {
      const preview = assetManager.getAssetPreview(assetPath);
      return { success: true, preview };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('asset:batchTagAssets', async (event, assetPaths, tags) => {
    try {
      const ok = assetManager.batchTagAssets(assetPaths, tags);
      return { success: ok };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('asset:getDependencyGraph', async () => {
    try {
      const graph = assetManager.getDependencyGraph();
      return { success: true, graph };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // === Voice Model Manager IPC ===
  ipcMain.handle('voiceModel:list', async () => {
    try {
      return { success: true, models: voiceModelManager.listVoiceModels() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('voiceModel:import', async (event, model) => {
    try {
      const ok = voiceModelManager.importVoiceModel(model);
      return { success: ok };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('voiceModel:generate', async (event, opts) => {
    try {
      const files = await voiceModelManager.generateVoiceWithModel(opts);
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('voiceModel:getInfo', async (event, modelId) => {
    try {
      return { success: true, model: voiceModelManager.getModelInfo(modelId) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // File system import/export/write/read
  ipcMain.handle('fs:importFiles', async (event, opts) => {
    try {
      const { type, paths } = opts;
      if (!type || !Array.isArray(paths) || !paths.length) return { success: false, error: 'Invalid arguments' };
      const typeDirMap = {
        mesh: 'mod/meshes',
        texture: 'mod/textures',
        audio: 'mod/audio',
        quest: 'mod/quests',
        scene: 'mod/scenes',
        npc: 'mod/npcs',
      };
      const destDir = path.join(process.cwd(), typeDirMap[type] || 'mod/other');
      fs.mkdirSync(destDir, { recursive: true });
      const destPaths = [];
      for (const src of paths) {
        const dest = path.join(destDir, path.basename(src));
        fs.copyFileSync(src, dest);
        destPaths.push(dest);
      }
      return { success: true, count: destPaths.length, type, destPaths };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('fs:exportFiles', async (event, opts) => {
    try {
      const { type, paths, destDir } = opts;
      if (!Array.isArray(paths) || !paths.length || !destDir) return { success: false, error: 'Invalid arguments' };
      fs.mkdirSync(destDir, { recursive: true });
      const destPaths = [];
      for (const src of paths) {
        const dest = path.join(destDir, path.basename(src));
        fs.copyFileSync(src, dest);
        destPaths.push(dest);
      }
      return { success: true, count: destPaths.length, type, destPaths };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('fs:writeFile', async (event, filePath, data) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(data));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('fs:readFile', async (event, filePath) => {
    try {
      const data = fs.readFileSync(filePath);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // === Plugin Engine IPC ===
  ipcMain.handle('pluginEngine:getToolPanels', async () => {
    try {
      if (!pluginEngineInstance) return { success: false, error: 'Plugin engine not initialized' };
      const panels = pluginEngineInstance.getToolPanels();
      return { success: true, panels };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

function setupMeshEditorIPC() {
  ipcMain.handle('meshEditor:loadMesh', async (event, filePath) => {
    try {
      const mesh = await meshEditor.loadMesh(filePath);
      // For IPC, serialize mesh to JSON (geometry, materials, etc.)
      return { success: true, mesh: mesh.toJSON ? mesh.toJSON() : mesh };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('meshEditor:saveMesh', async (event, meshJson, filePath) => {
    try {
      // Reconstruct mesh from JSON
      const loader = new THREE.ObjectLoader();
      const mesh = loader.parse(meshJson);
      await meshEditor.saveMesh(mesh, filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('meshEditor:transformMesh', async (event, meshJson, transform) => {
    try {
      const loader = new THREE.ObjectLoader();
      const mesh = loader.parse(meshJson);
      const transformed = meshEditor.transformMesh(mesh, transform);
      return { success: true, mesh: transformed.toJSON() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('meshEditor:deleteMeshChild', async (event, meshJson, childName) => {
    try {
      const loader = new THREE.ObjectLoader();
      const mesh = loader.parse(meshJson);
      const edited = meshEditor.deleteMeshChild(mesh, childName);
      return { success: true, mesh: edited.toJSON() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('meshEditor:addMeshChild', async (event, meshJson, childMeshJson) => {
    try {
      const loader = new THREE.ObjectLoader();
      const mesh = loader.parse(meshJson);
      const childMesh = loader.parse(childMeshJson);
      const edited = meshEditor.addMeshChild(mesh, childMesh);
      return { success: true, mesh: edited.toJSON() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

// Validate if path is a Cyberpunk 2077 installation
function validateGameDirectory(path) {
  // Check for critical files that should be in a CP2077 installation
  const requiredFiles = [
    'bin/x64/Cyberpunk2077.exe',
    'archive/pc/content/base_game.archive'
  ];
  
  try {
    return requiredFiles.every(file => 
      fs.existsSync(path + '/' + file.replace(/\//g, path.sep))
    );
  } catch (error) {
    console.error('Error validating game directory:', error);
    return false;
  }
}