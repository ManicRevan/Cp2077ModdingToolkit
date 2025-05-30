// pluginEngine.js

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import vm from 'vm';
import EventEmitter from 'events';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the current app version for plugin compatibility checks
const APP_VERSION = require('./package.json').version;

/**
 * Plugin Engine for Cyberpunk 2077 Modding Toolkit
 * Handles loading, registering, and managing plugins and tool panels
 */
class PluginEngine {
  constructor(options = {}) {
    this.plugins = new Map();
    this.toolPanels = new Map();
    this.pluginDir = options.pluginDir || path.join(process.cwd(), 'plugins');
    this.eventEmitter = options.eventEmitter || new EventEmitter();
    this.uiFramework = options.uiFramework || {};
    this.api = options.api || {};
    this.logger = options.logger || console;
    
    // Dependency resolution tracking
    this.pendingPlugins = new Map();
  }

  /**
   * Initialize the plugin engine and load plugins
   */
  async init() {
    await this.ensurePluginDirectory();
    await this.loadAllPlugins();
    return this;
  }

  /**
   * Ensure the plugin directory exists
   */
  async ensurePluginDirectory() {
    try {
      await fs.mkdir(this.pluginDir, { recursive: true });
      this.logger.info(`Plugin directory: ${this.pluginDir}`);
    } catch (error) {
      this.logger.error(`Failed to create plugin directory: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load all plugins from the plugins directory
   */
  async loadAllPlugins() {
    try {
      const files = await fs.readdir(this.pluginDir);
      
      // First discover all plugins and their dependencies
      await this.discoverPlugins(files);
      
      // Then load them in the correct dependency order
      await this.loadPluginsInOrder();
      
      this.logger.info(`Loaded ${this.plugins.size} plugins successfully`);
    } catch (error) {
      this.logger.error(`Failed to load plugins: ${error.stack}`);
    }
  }

  /**
   * Discover plugins from files without loading them
   * @param {Array} files Array of filenames to discover
   */
  async discoverPlugins(files) {
    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.yaml') || file.endsWith('.yml')) {
        const filePath = path.join(this.pluginDir, file);
        await this.discoverPlugin(filePath);
      }
    }
  }

  /**
   * Discover a single plugin and its metadata
   * @param {string} filePath Path to plugin file
   */
  async discoverPlugin(filePath) {
    const fileName = path.basename(filePath);
    
    try {
      this.logger.info(`Discovering plugin: ${fileName}`);
      
      let pluginDefinition;
      
      if (filePath.endsWith('.js')) {
        pluginDefinition = await this.parseJavaScriptPlugin(filePath);
      } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        pluginDefinition = await this.parseYamlPlugin(filePath);
      } else {
        throw new Error(`Unsupported plugin format: ${filePath}`);
      }
      
      if (!pluginDefinition.id) {
        throw new Error(`Plugin from ${filePath} does not have an ID`);
      }
      
      // --- Version compatibility checks ---
      if (pluginDefinition.appVersion) {
        if (!this.isVersionCompatible(APP_VERSION, pluginDefinition.appVersion)) {
          this.logger.error(`Plugin ${pluginDefinition.id} requires app version ${pluginDefinition.appVersion}, but current version is ${APP_VERSION}`);
          throw new Error(`Incompatible app version for plugin ${pluginDefinition.id}`);
        }
      }
      
      // --- Plugin signature/hash validation ---
      if (pluginDefinition.signature) {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const hash = crypto.createHash('sha256').update(fileContent).digest('hex');
        if (hash !== pluginDefinition.signature) {
          this.logger.warn(`Plugin ${pluginDefinition.id} signature mismatch! Expected ${pluginDefinition.signature}, got ${hash}`);
        }
      } else {
        this.logger.warn(`Plugin ${pluginDefinition.id} has no signature. Consider adding a SHA-256 signature for integrity.`);
      }
      
      // --- Permissions logging ---
      if (pluginDefinition.permissions && Array.isArray(pluginDefinition.permissions)) {
        this.logger.info(`Plugin ${pluginDefinition.id} requests permissions: ${pluginDefinition.permissions.join(', ')}`);
      }
      
      // Store for dependency resolution
      this.pendingPlugins.set(pluginDefinition.id, {
        path: filePath,
        definition: pluginDefinition,
        dependencies: pluginDefinition.dependencies ? pluginDefinition.dependencies.map(dep => typeof dep === 'string' ? dep : dep.id) : []
      });
      
      this.logger.info(`Discovered plugin: ${pluginDefinition.id}`);
    } catch (error) {
      this.logger.error(`Failed to discover plugin ${fileName}: ${error.message}`);
    }
  }

  /**
   * Parse a JavaScript plugin without executing it
   * @param {string} filePath Path to JS plugin file
   * @returns {Object} Plugin definition
   */
  async parseJavaScriptPlugin(filePath) {
    try {
      const pluginCode = await fs.readFile(filePath, 'utf8');
      
      // Extract metadata using regex
      const idMatch = pluginCode.match(/id\s*:\s*['"]([^'"]+)['"]/);
      const nameMatch = pluginCode.match(/name\s*:\s*['"]([^'"]+)['"]/);
      const versionMatch = pluginCode.match(/version\s*:\s*['"]([^'"]+)['"]/);
      const authorMatch = pluginCode.match(/author\s*:\s*['"]([^'"]+)['"]/);
      const descMatch = pluginCode.match(/description\s*:\s*['"]([^'"]+)['"]/);
      const appVerMatch = pluginCode.match(/appVersion\s*:\s*['"]([^'"]+)['"]/);
      const sigMatch = pluginCode.match(/signature\s*:\s*['"]([^'"]+)['"]/);
      
      // Extract permissions
      const permMatch = pluginCode.match(/permissions\s*:\s*\[(.*?)\]/s);
      let permissions = [];
      if (permMatch && permMatch[1]) {
        const permsContent = permMatch[1].trim();
        if (permsContent) {
          const permRegex = /['"]([^'"]+)['"]/g;
          let match;
          while ((match = permRegex.exec(permsContent)) !== null) {
            permissions.push(match[1]);
          }
        }
      }
      
      // Extract dependencies (with version)
      const depsMatch = pluginCode.match(/dependencies\s*:\s*\[(.*?)\]/s);
      let dependencies = [];
      
      if (depsMatch && depsMatch[1]) {
        const depsContent = depsMatch[1].trim();
        if (depsContent) {
          // Match objects: {id: '...', version: '...'} or strings
          const depObjRegex = /\{\s*id\s*:\s*['"]([^'"]+)['"],\s*version\s*:\s*['"]([^'"]+)['"]\s*\}/g;
          let match;
          while ((match = depObjRegex.exec(depsContent)) !== null) {
            dependencies.push({ id: match[1], version: match[2] });
          }
          // Match strings: 'id'
          const depStrRegex = /['"]([^'"]+)['"]/g;
          while ((match = depStrRegex.exec(depsContent)) !== null) {
            if (!dependencies.find(d => d.id === match[1])) dependencies.push(match[1]);
          }
        }
      }
      
      return {
        id: idMatch ? idMatch[1] : path.basename(filePath, '.js'),
        name: nameMatch ? nameMatch[1] : path.basename(filePath, '.js'),
        version: versionMatch ? versionMatch[1] : '1.0.0',
        author: authorMatch ? authorMatch[1] : 'Unknown',
        description: descMatch ? descMatch[1] : '',
        appVersion: appVerMatch ? appVerMatch[1] : undefined,
        signature: sigMatch ? sigMatch[1] : undefined,
        permissions,
        dependencies,
        _isJs: true
      };
    } catch (error) {
      this.logger.error(`Error parsing JS plugin ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse a YAML plugin
   * @param {string} filePath Path to YAML plugin file
   * @returns {Object} Plugin definition
   */
  async parseYamlPlugin(filePath) {
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      const pluginDefinition = yaml.load(fileContent);
      
      if (!this.validateYamlPlugin(pluginDefinition)) {
        throw new Error(`Invalid plugin definition in ${filePath}`);
      }
      
      // Ensure dependencies is an array
      if (!pluginDefinition.dependencies) {
        pluginDefinition.dependencies = [];
      }
      
      // --- Parse appVersion and dependency versions ---
      if (pluginDefinition.appVersion && !this.isVersionCompatible(APP_VERSION, pluginDefinition.appVersion)) {
        throw new Error(`Plugin requires app version ${pluginDefinition.appVersion}, but current version is ${APP_VERSION}`);
      }
      
      // --- Signature and permissions ---
      if (pluginDefinition.signature) {
        const hash = crypto.createHash('sha256').update(fileContent).digest('hex');
        if (hash !== pluginDefinition.signature) {
          this.logger.warn(`Plugin ${pluginDefinition.id} signature mismatch! Expected ${pluginDefinition.signature}, got ${hash}`);
        }
      } else {
        this.logger.warn(`Plugin ${pluginDefinition.id} has no signature. Consider adding a SHA-256 signature for integrity.`);
      }
      if (pluginDefinition.permissions && Array.isArray(pluginDefinition.permissions)) {
        this.logger.info(`Plugin ${pluginDefinition.id} requests permissions: ${pluginDefinition.permissions.join(', ')}`);
      }
      
      pluginDefinition._isYaml = true;
      return pluginDefinition;
    } catch (error) {
      this.logger.error(`Error parsing YAML plugin ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load plugins in dependency order
   */
  async loadPluginsInOrder() {
    const loadOrder = this.resolveDependencies();
    
    for (const pluginId of loadOrder) {
      const pluginInfo = this.pendingPlugins.get(pluginId);
      if (pluginInfo) {
        try {
          // --- Dependency version checks ---
          if (pluginInfo.definition.dependencies && Array.isArray(pluginInfo.definition.dependencies)) {
            for (const dep of pluginInfo.definition.dependencies) {
              if (typeof dep === 'object' && dep.id && dep.version) {
                const loadedDep = this.plugins.get(dep.id);
                if (!loadedDep || !this.isVersionCompatible(loadedDep.version, dep.version)) {
                  this.logger.error(`Plugin ${pluginId} requires dependency ${dep.id}@${dep.version}, but found ${loadedDep ? loadedDep.version : 'none'}`);
                  throw new Error(`Dependency version mismatch for plugin ${pluginId}`);
                }
              }
            }
          }
          await this.loadPluginFromDefinition(pluginInfo.path, pluginInfo.definition);
          this.logger.info(`Loaded plugin: ${pluginId}`);
        } catch (error) {
          this.logger.error(`Failed to load plugin ${pluginId}: ${error.message}`);
        }
      }
    }
    
    // Clear pending plugins after loading
    this.pendingPlugins.clear();
  }

  /**
   * Resolve plugin dependencies and return loading order
   * @returns {Array} Array of plugin IDs in order of loading
   */
  resolveDependencies() {
    const visited = new Set();
    const temp = new Set();
    const order = [];
    
    // Topological sort function for dependency resolution
    const visit = (pluginId) => {
      if (visited.has(pluginId)) return;
      if (temp.has(pluginId)) {
        throw new Error(`Circular dependency detected with plugin: ${pluginId}`);
      }
      
      temp.add(pluginId);
      
      const plugin = this.pendingPlugins.get(pluginId);
      if (plugin) {
        for (const depId of plugin.dependencies) {
          if (!this.pendingPlugins.has(depId)) {
            this.logger.warn(`Plugin ${pluginId} depends on missing plugin: ${depId}`);
            continue;
          }
          visit(depId);
        }
      }
      
      temp.delete(pluginId);
      visited.add(pluginId);
      order.push(pluginId);
    };
    
    // Visit all plugins
    for (const pluginId of this.pendingPlugins.keys()) {
      if (!visited.has(pluginId)) {
        visit(pluginId);
      }
    }
    
    return order;
  }

  /**
   * Load a plugin from a definition
   * @param {string} filePath Path to plugin file
   * @param {Object} definition Plugin definition
   */
  async loadPluginFromDefinition(filePath, definition) {
    if (definition._isJs) {
      await this.loadJavaScriptPlugin(filePath);
    } else if (definition._isYaml) {
      await this.loadYamlPlugin(filePath);
    } else {
      throw new Error(`Unknown plugin type for ${filePath}`);
    }
  }

  /**
   * Load a JavaScript plugin
   * @param {string} filePath Path to JS plugin file
   */
  async loadJavaScriptPlugin(filePath) {
    try {
      // Create a safe sandbox context for the plugin
      const sandbox = this.createSandbox();
      
      // Read the plugin file
      const pluginCode = await fs.readFile(filePath, 'utf8');
      
      // Create a module wrapper to allow exports
      const wrappedCode = `
        (function(exports, require, module, __filename, __dirname) {
          ${pluginCode}
        });
      `;
      
      // Compile and run the script in the sandbox
      const script = new vm.Script(wrappedCode);
      const pluginModuleFunc = script.runInNewContext(sandbox);
      
      // Create module and exports objects
      const moduleObj = { exports: {} };
      
      // Execute the module function
      pluginModuleFunc(
        moduleObj.exports, 
        this.createSafeRequire(filePath),
        moduleObj, 
        filePath, 
        path.dirname(filePath)
      );
      
      // Register the plugin
      await this.registerPlugin(filePath, moduleObj.exports);
    } catch (error) {
      this.logger.error(`Error in JS plugin ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load a YAML plugin
   * @param {string} filePath Path to YAML plugin file
   */
  async loadYamlPlugin(filePath) {
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      const pluginDefinition = yaml.load(fileContent);
      
      if (!this.validateYamlPlugin(pluginDefinition)) {
        throw new Error(`Invalid plugin definition in ${filePath}`);
      }
      
      await this.registerPlugin(filePath, pluginDefinition);
    } catch (error) {
      this.logger.error(`Error in YAML plugin ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate a YAML plugin definition
   * @param {Object} plugin Plugin definition
   * @returns {boolean} Validation result
   */
  validateYamlPlugin(plugin) {
    // Basic validation
    if (!plugin || typeof plugin !== 'object') return false;
    if (!plugin.id || typeof plugin.id !== 'string') return false;
    if (!plugin.name || typeof plugin.name !== 'string') return false;
    
    // Check dependencies if present
    if (plugin.dependencies !== undefined && !Array.isArray(plugin.dependencies)) {
      return false;
    }
    
    // Check tool panels if present
    if (plugin.toolPanels) {
      if (!Array.isArray(plugin.toolPanels)) return false;
      
      for (const panel of plugin.toolPanels) {
        if (!panel.id || typeof panel.id !== 'string') return false;
        if (!panel.name || typeof panel.name !== 'string') return false;
        if (!panel.template || typeof panel.template !== 'string') return false;
      }
    }
    
    return true;
  }

  /**
   * Create a sandboxed context for JavaScript plugins
   * @returns {Object} Sandbox object
   */
  createSandbox() {
    return {
      console: {
        log: (...args) => this.logger.info(...args),
        info: (...args) => this.logger.info(...args),
        warn: (...args) => this.logger.warn(...args),
        error: (...args) => this.logger.error(...args),
      },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Buffer,
      process: { env: process.env },
      // Add UI framework if available
      ...this.uiFramework,
      // Plugin API
      pluginApi: this.createPluginApi(),
    };
  }

  /**
   * Create a safe require function for plugins
   * @param {string} pluginPath Path to the plugin
   * @returns {Function} Safe require function
   */
  createSafeRequire(pluginPath) {
    const allowedModules = [
      'path', 'util', 'events', 'stream', 'querystring',
      'url', 'string_decoder', 'punycode', 'buffer',
      'js-yaml', 'lodash', 'axios', 'crypto-js'
    ];
    
    return (moduleName) => {
      if (allowedModules.includes(moduleName)) {
        return require(moduleName);
      } else if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
        // Relative imports within the plugin's directory
        const absolutePath = path.resolve(path.dirname(pluginPath), moduleName);
        return require(absolutePath);
      } else {
        throw new Error(`Module '${moduleName}' is not allowed to be imported.`);
      }
    };
  }

  /**
   * Create the plugin API that will be exposed to plugins
   * @returns {Object} Plugin API
   */
  createPluginApi() {
    return {
      // Tool panel management
      registerToolPanel: (plugin, toolPanel) => {
        try {
          this.logger.info(`[AUDIT] Plugin ${plugin.id} registering tool panel: ${toolPanel.id}`);
          if (!plugin || !plugin.id) {
            throw new Error('Invalid plugin reference');
          }
          
          if (!toolPanel.id || !toolPanel.name || !toolPanel.component) {
            throw new Error('Tool panel must have id, name, and component properties');
          }
          
          // Store the tool panel
          const panelId = `${plugin.id}.${toolPanel.id}`;
          this.toolPanels.set(panelId, {
            id: panelId,
            pluginId: plugin.id,
            name: toolPanel.name,
            component: toolPanel.component,
            icon: toolPanel.icon,
            description: toolPanel.description,
            order: toolPanel.order || 999,
          });
          
          // Notify the UI to update
          this.eventEmitter.emit('toolPanels.updated', Array.from(this.toolPanels.values()));
          
          return panelId;
        } catch (error) {
          this.logger.error(`Error registering tool panel: ${error.message}`);
          throw error;
        }
      },
      
      unregisterToolPanel: (panelId) => {
        try {
          this.logger.info(`[AUDIT] Unregistering tool panel: ${panelId}`);
          if (this.toolPanels.has(panelId)) {
            this.toolPanels.delete(panelId);
            this.eventEmitter.emit('toolPanels.updated', Array.from(this.toolPanels.values()));
            return true;
          }
          return false;
        } catch (error) {
          this.logger.error(`Error unregistering tool panel: ${error.message}`);
          throw error;
        }
      },
      
      // Plugin access (limited view)
      getPlugin: (pluginId) => {
        const plugin = this.getPlugin(pluginId);
        if (!plugin) return null;
        
        return {
          id: plugin.id,
          name: plugin.name,
          description: plugin.description,
          version: plugin.version,
          author: plugin.author,
        };
      },
      
      // Event system for inter-plugin communication
      on: (eventName, handler) => {
        this.logger.info(`[AUDIT] Plugin subscribing to event: ${eventName}`);
        this.eventEmitter.on(`plugin.${eventName}`, handler);
        return true;
      },
      
      emit: (eventName, data) => {
        this.logger.info(`[AUDIT] Plugin emitting event: ${eventName}`);
        this.eventEmitter.emit(`plugin.${eventName}`, data);
        return true;
      },
      
      // Expose the app's API to plugins
      ...this.api,
    };
  }

  /**
   * Register a plugin
   * @param {string} filePath Path to the plugin file
   * @param {Object} pluginDefinition Plugin definition object
   */
  async registerPlugin(filePath, pluginDefinition) {
    // Basic validation
    if (!pluginDefinition.id) {
      throw new Error(`Plugin from ${filePath} does not have an ID`);
    }
    
    if (pluginDefinition.permissions && Array.isArray(pluginDefinition.permissions)) {
      this.logger.info(`[AUDIT] Registering plugin ${pluginDefinition.id} with permissions: ${pluginDefinition.permissions.join(', ')}`);
    }
    
    // Check for duplicates
    if (this.plugins.has(pluginDefinition.id)) {
      throw new Error(`Plugin with ID ${pluginDefinition.id} is already registered`);
    }
    
    // Register the plugin
    this.plugins.set(pluginDefinition.id, {
      id: pluginDefinition.id,
      name: pluginDefinition.name || pluginDefinition.id,
      description: pluginDefinition.description || '',
      version: pluginDefinition.version || '1.0.0',
      author: pluginDefinition.author || 'Unknown',
      path: filePath,
      instance: pluginDefinition,
    });
    
    // If the plugin has a setup function, call it
    if (typeof pluginDefinition.setup === 'function') {
      try {
        await Promise.resolve(pluginDefinition.setup(this.createPluginApi()));
      } catch (error) {
        this.logger.error(`Error initializing plugin ${pluginDefinition.id}: ${error.message}`);
        throw error;
      }
    }
    
    // If the plugin has tool panels defined in YAML, register them
    if (pluginDefinition.toolPanels && Array.isArray(pluginDefinition.toolPanels)) {
      for (const panel of pluginDefinition.toolPanels) {
        if (panel.id && panel.name && panel.template) {
          try {
            // For YAML plugins, we create a simple component from the template
            const component = this.createComponentFromTemplate(panel.template);
            
            // Register the tool panel
            const toolPanel = {
              id: panel.id,
              name: panel.name,
              component,
              icon: panel.icon,
              description: panel.description,
              order: panel.order,
            };
            
            this.createPluginApi().registerToolPanel(pluginDefinition, toolPanel);
          } catch (error) {
            this.logger.error(`Error registering tool panel ${panel.id}: ${error.message}`);
          }
        }
      }
    }
    
    // Notify about new plugin
    this.eventEmitter.emit('plugins.updated', Array.from(this.plugins.values()));
  }

  /**
   * Create a UI component from a template string
   * @param {string} template Template string
   * @returns {Function} Component function
   */
  createComponentFromTemplate(template) {
    // This is a placeholder - actual implementation depends on UI framework
    return () => ({
      render: () => template,
      type: 'template',
      template,
    });
  }

  /**
   * Get all registered tool panels
   * @returns {Array} Array of tool panels
   */
  getToolPanels() {
    return Array.from(this.toolPanels.values())
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Get a specific plugin by ID
   * @param {string} pluginId Plugin ID
   * @returns {Object|null} Plugin object or null if not found
   */
  getPlugin(pluginId) {
    return this.plugins.get(pluginId) || null;
  }

  /**
   * Get all registered plugins
   * @returns {Array} Array of plugins
   */
  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  /**
   * Unload a plugin by ID
   * @param {string} pluginId Plugin ID
   * @returns {boolean} Success status
   */
  unloadPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    
    // Check for dependent plugins
    for (const [id, p] of this.plugins.entries()) {
      if (p.instance.dependencies && p.instance.dependencies.includes(pluginId)) {
        this.logger.warn(`Cannot unload plugin ${pluginId} because it is needed by: ${id}`);
        return false;
      }
    }
    
    // Call cleanup method if available
    if (typeof plugin.instance.cleanup === 'function') {
      try {
        plugin.instance.cleanup();
      } catch (error) {
        this.logger.error(`Error during plugin cleanup: ${error.message}`);
      }
    }
    
    // Remove all tool panels from this plugin
    for (const [panelId, panel] of this.toolPanels.entries()) {
      if (panel.pluginId === pluginId) {
        this.toolPanels.delete(panelId);
      }
    }
    
    // Remove the plugin
    this.plugins.delete(pluginId);
    
    // Notify the UI to update
    this.eventEmitter.emit('plugins.updated', Array.from(this.plugins.values()));
    this.eventEmitter.emit('toolPanels.updated', Array.from(this.toolPanels.values()));
    
    return true;
  }

  /**
   * Import a plugin from a file
   * @param {string} filePath Path to plugin file
   * @returns {boolean} Success status
   */
  async importPlugin(filePath) {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Copy to plugins directory
      const fileName = path.basename(filePath);
      const destPath = path.join(this.pluginDir, fileName);
      
      // Read source file and write to destination
      const content = await fs.readFile(filePath);
      await fs.writeFile(destPath, content);
      
      // Load the plugin
      await this.discoverPlugin(destPath);
      
      // Find the plugin ID we just discovered
      const newPluginIds = Array.from(this.pendingPlugins.keys())
        .filter(id => !this.plugins.has(id));
      
      if (newPluginIds.length > 0) {
        const pluginId = newPluginIds[0];
        const pluginInfo = this.pendingPlugins.get(pluginId);
        await this.loadPluginFromDefinition(pluginInfo.path, pluginInfo.definition);
        this.pendingPlugins.delete(pluginId);
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error(`Error importing plugin: ${error.message}`);
      return false;
    }
  }

  /**
   * Export a plugin to a file
   * @param {string} pluginId Plugin ID
   * @param {string} destPath Destination path
   * @returns {boolean} Success status
   */
  async exportPlugin(pluginId, destPath) {
    try {
      const plugin = this.getPlugin(pluginId);
      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }
      
      // Copy from plugins directory to destination
      const content = await fs.readFile(plugin.path);
      await fs.writeFile(destPath, content);
      
      return true;
    } catch (error) {
      this.logger.error(`Error exporting plugin: ${error.message}`);
      return false;
    }
  }

  // --- Version compatibility helper ---
  isVersionCompatible(current, required) {
    // Accepts exact, ^, ~, >=, <=, >, <, or range (basic semver)
    const semver = require('semver');
    try {
      return semver.satisfies(current, required);
    } catch {
      return current === required;
    }
  }
}

export default PluginEngine;