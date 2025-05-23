import { contextBridge, ipcRenderer } from 'electron';

// Expose protected APIs to renderer process
contextBridge.exposeInMainWorld('electron', {
  // Settings API
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value)
  },
  
  // File system API
  fs: {
    selectGameDirectory: () => ipcRenderer.invoke('dialog:selectGameDirectory'),
    importFiles: (opts) => ipcRenderer.invoke('fs:importFiles', opts),
    exportFiles: (opts) => ipcRenderer.invoke('fs:exportFiles', opts),
    writeFile: (path, data) => ipcRenderer.invoke('fs:writeFile', path, data),
    readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
  },
  
  // Project management
  project: {
    save: (projectData) => ipcRenderer.invoke('project:save', projectData),
    getRecent: () => ipcRenderer.invoke('settings:get', 'recentProjects')
  },
  
  // App info
  app: {
    getVersion: () => process.env.npm_package_version || '1.0.0'
  },

  // Advanced AI API
  ai: {
    generateVoiceAdvanced: (opts) => ipcRenderer.invoke('ai:generateVoiceAdvanced', opts),
    generateImageAdvanced: (opts) => ipcRenderer.invoke('ai:generateImageAdvanced', opts),
    generateNPCProfile: (opts) => ipcRenderer.invoke('ai:generateNPCProfile', opts),
    generateQuest: (opts) => ipcRenderer.invoke('ai:generateQuest', opts),
    expandDialogue: (opts) => ipcRenderer.invoke('ai:expandDialogue', opts),
    translateDialogue: (opts) => ipcRenderer.invoke('ai:translateDialogue', opts),
    generateSoundEffect: (opts) => ipcRenderer.invoke('ai:generateSoundEffect', opts),
    generateMusic: (opts) => ipcRenderer.invoke('ai:generateMusic', opts),
    autoTagAsset: (opts) => ipcRenderer.invoke('ai:autoTagAsset', opts),
    runSmartSearch: (opts) => ipcRenderer.invoke('ai:runSmartSearch', opts),
    upscaleAsset: (opts) => ipcRenderer.invoke('ai:upscaleAsset', opts),
    askAssistant: (opts) => ipcRenderer.invoke('ai:askAssistant', opts)
  },
  // Mesh Editor API
  meshEditor: {
    loadMesh: (filePath) => ipcRenderer.invoke('meshEditor:loadMesh', filePath),
    saveMesh: (meshJson, filePath) => ipcRenderer.invoke('meshEditor:saveMesh', meshJson, filePath),
    transformMesh: (meshJson, transform) => ipcRenderer.invoke('meshEditor:transformMesh', meshJson, transform),
    deleteMeshChild: (meshJson, childName) => ipcRenderer.invoke('meshEditor:deleteMeshChild', meshJson, childName),
    addMeshChild: (meshJson, childMeshJson) => ipcRenderer.invoke('meshEditor:addMeshChild', meshJson, childMeshJson)
  },
  // Mod Dependency Management API
  moddingDeps: {
    readManifest: (modDir) => ipcRenderer.invoke('modding:readManifest', modDir),
    writeManifest: (modDir, manifest) => ipcRenderer.invoke('modding:writeManifest', modDir, manifest),
    scanAvailableMods: (modsDir) => ipcRenderer.invoke('modding:scanAvailableMods', modsDir),
    resolveDependencies: (manifest, availableMods, modVersions) => ipcRenderer.invoke('modding:resolveDependencies', manifest, availableMods, modVersions)
  },
  // Savegame Editing API
  savegame: {
    load: (filePath) => ipcRenderer.invoke('savegame:load', filePath),
    getSummary: (save) => ipcRenderer.invoke('savegame:getSummary', save),
    edit: (save, edits) => ipcRenderer.invoke('savegame:edit', save, edits),
    save: (save, outPath) => ipcRenderer.invoke('savegame:save', save, outPath)
  },
  // Archive Management API
  archive: {
    listContents: (archivePath) => ipcRenderer.invoke('archive:listContents', archivePath),
    diff: (archiveA, archiveB) => ipcRenderer.invoke('archive:diff', archiveA, archiveB),
    verify: (archivePath) => ipcRenderer.invoke('archive:verify', archivePath)
  },
  // Plugin Management API
  modding: {
    enablePlugin: (pluginId) => ipcRenderer.invoke('modding:enablePlugin', pluginId),
    disablePlugin: (pluginId) => ipcRenderer.invoke('modding:disablePlugin', pluginId),
    importPlugin: (filePath) => ipcRenderer.invoke('modding:importPlugin', filePath)
  },
  // Community/Sharing API
  community: {
    browseMods: (apiKey, query, page) => ipcRenderer.invoke('community:browseMods', apiKey, query, page),
    downloadMod: (apiKey, modId, destDir) => ipcRenderer.invoke('community:downloadMod', apiKey, modId, destDir),
    rateMod: (apiKey, modId, rating) => ipcRenderer.invoke('community:rateMod', apiKey, modId, rating),
    commentMod: (apiKey, modId, comment) => ipcRenderer.invoke('community:commentMod', apiKey, modId, comment),
    getComments: (modId) => ipcRenderer.invoke('community:getComments', modId),
    uploadAsset: (apiKey, filePath, meta) => ipcRenderer.invoke('community:uploadAsset', apiKey, filePath, meta),
    browseAssets: (query, page) => ipcRenderer.invoke('community:browseAssets', query, page)
  },
  // Asset Management API
  asset: {
    scanAssets: (dirs) => ipcRenderer.invoke('asset:scanAssets', dirs),
    tagAsset: (assetPath, tags) => ipcRenderer.invoke('asset:tagAsset', assetPath, tags),
    searchAssets: (query) => ipcRenderer.invoke('asset:searchAssets', query),
    getAssetPreview: (assetPath) => ipcRenderer.invoke('asset:getAssetPreview', assetPath),
    batchTagAssets: (assetPaths, tags) => ipcRenderer.invoke('asset:batchTagAssets', assetPaths, tags),
    getDependencyGraph: () => ipcRenderer.invoke('asset:getDependencyGraph')
  },
  // Voice Model Manager API
  voiceModel: {
    list: () => ipcRenderer.invoke('voiceModel:list'),
    import: (model) => ipcRenderer.invoke('voiceModel:import', model),
    generate: (opts) => ipcRenderer.invoke('voiceModel:generate', opts),
    getInfo: (modelId) => ipcRenderer.invoke('voiceModel:getInfo', modelId)
  },
  pluginEngine: {
    getToolPanels: () => ipcRenderer.invoke('pluginEngine:getToolPanels'),
  },
});