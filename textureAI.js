/**
 * textureAI.js
 * Generate AI textures via Stable Diffusion and convert to Cyberpunk 2077 compatible .xbm format
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import sharp from 'sharp';

class TextureAI {
  constructor(options = {}) {
    this.config = {
      apiKey: options.apiKey || null,
      apiEndpoint: options.apiEndpoint || 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      outputDir: options.outputDir || path.join(process.cwd(), 'output', 'textures'),
      modBaseDir: options.modBaseDir || path.join(process.cwd(), 'mod'),
      wolvenKitPath: options.wolvenKitPath || process.env.WOLVENKIT_PATH,
      width: options.width || 4096,
      height: options.height || 4096,
      cfgScale: options.cfgScale || 7,
      steps: options.steps || 40
    };
    
    // Create necessary directories
    fs.mkdirSync(this.config.outputDir, { recursive: true });
  }

  setApiKey(apiKey) {
    this.config.apiKey = apiKey;
    return this;
  }

  /**
   * Generate a texture using Stable Diffusion
   * @param {string} prompt - The text prompt for image generation
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Paths to generated files
   */
  async generateTexture(prompt, options = {}) {
    if (!this.config.apiKey) throw new Error('Stability AI API key not set');
    if (!prompt) throw new Error('Prompt is required');

    const settings = {
      fileName: `texture_${Date.now()}`,
      textureType: 'generic', // generic, character, vehicle, weapon, etc.
      negativePrompt: 'blurry, distorted, low quality, pixelated, watermark',
      ...options
    };
    
    try {
      console.log(`Generating texture with prompt: "${prompt}"`);
      
      // Define output paths
      const pngPath = path.join(this.config.outputDir, `${settings.fileName}.png`);
      const xbmPath = path.join(this.config.outputDir, `${settings.fileName}.xbm`);
      
      // Determine the appropriate mod directory based on texture type
      const modDir = this.getModTexturePath(settings.textureType);
      fs.mkdirSync(modDir, { recursive: true });
      const modPath = path.join(modDir, `${settings.fileName}.xbm`);
      
      // Call Stability AI API
      const response = await axios({
        method: 'post',
        url: this.config.apiEndpoint,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        data: {
          text_prompts: [
            { text: prompt, weight: 1.0 },
            { text: settings.negativePrompt, weight: -1.0 }
          ],
          cfg_scale: this.config.cfgScale,
          height: this.config.height,
          width: this.config.width,
          samples: 1,
          steps: this.config.steps
        }
      });
      
      // Extract and save the generated image
      const base64Image = response.data.artifacts[0].base64;
      const imageBuffer = Buffer.from(base64Image, 'base64');
      
      // Process with sharp to ensure it's 4K
      await sharp(imageBuffer)
        .resize(4096, 4096, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(pngPath);
      
      console.log(`PNG texture saved: ${pngPath}`);
      
      // Convert PNG to XBM for Cyberpunk 2077
      await this.convertPngToXbm(pngPath, xbmPath);
      
      // Copy to mod folder
      fs.copyFileSync(xbmPath, modPath);
      console.log(`Texture exported to mod folder: ${modPath}`);
      
      // Return paths for further processing
      return {
        pngPath,
        xbmPath,
        modPath,
        textureType: settings.textureType
      };
    } catch (error) {
      console.error('Error generating texture:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Convert PNG to XBM format for Cyberpunk 2077
   * @param {string} pngPath - Path to input PNG file
   * @param {string} xbmPath - Path to output XBM file
   * @returns {Promise<string>} - Path to generated XBM file
   */
  async convertPngToXbm(pngPath, xbmPath) {
    try {
      // Check if WolvenKit path is set
      if (!this.config.wolvenKitPath) {
        throw new Error('WolvenKit path not set. Use setWolvenKitPath() or set WOLVENKIT_PATH env variable');
      }
      
      const wolvenKitCli = path.join(this.config.wolvenKitPath, 'WolvenKit.CLI.exe');
      
      if (!fs.existsSync(wolvenKitCli)) {
        throw new Error(`WolvenKit CLI not found at: ${wolvenKitCli}`);
      }
      
      console.log('Converting PNG to XBM format...');
      
      // Execute WolvenKit conversion command
      const command = `"${wolvenKitCli}" texture convert --input "${pngPath}" --output "${xbmPath}" --format xbm`;
      execSync(command, { stdio: 'inherit' });
      
      console.log(`Successfully converted to XBM: ${xbmPath}`);
      return xbmPath;
    } catch (error) {
      console.error('Error converting PNG to XBM:', error.message);
      throw error;
    }
  }

  /**
   * Determine the appropriate mod folder path based on texture type
   * @param {string} textureType - Type of texture (character, vehicle, weapon, etc.)
   * @returns {string} - Path to mod folder
   */
  getModTexturePath(textureType) {
    // Map texture types to their corresponding paths in the game structure
    const texturePathMap = {
      'character': path.join(this.config.modBaseDir, 'archive', 'pc', 'mod', 'characters', 'textures'),
      'vehicle': path.join(this.config.modBaseDir, 'archive', 'pc', 'mod', 'vehicles', 'textures'),
      'weapon': path.join(this.config.modBaseDir, 'archive', 'pc', 'mod', 'weapons', 'textures'),
      'environment': path.join(this.config.modBaseDir, 'archive', 'pc', 'mod', 'environment', 'textures'),
      'ui': path.join(this.config.modBaseDir, 'archive', 'pc', 'mod', 'gui', 'textures'),
      'generic': path.join(this.config.modBaseDir, 'archive', 'pc', 'mod', 'textures')
    };
    
    return texturePathMap[textureType] || texturePathMap.generic;
  }

  /**
   * Create a mod package with generated textures
   * @param {Array} texturePaths - Paths to generated textures
   * @param {Object} modInfo - Information about the mod
   * @returns {Promise<string>} - Path to created mod package
   */
  async createModPackage(texturePaths, modInfo = {}) {
    const defaultInfo = {
      name: 'AI Generated Textures',
      author: 'TextureAI Generator',
      description: 'Textures generated with Stable Diffusion',
      version: '1.0.0'
    };
    
    const info = { ...defaultInfo, ...modInfo };
    
    try {
      const modInfoPath = path.join(this.config.modBaseDir, 'info.json');
      
      // Create mod info file
      const modMetadata = {
        name: info.name,
        author: info.author,
        description: info.description,
        version: info.version,
        textures: texturePaths.map(p => ({
          path: path.relative(this.config.modBaseDir, p),
          type: path.basename(path.dirname(path.dirname(p)))
        }))
      };
      
      fs.writeFileSync(modInfoPath, JSON.stringify(modMetadata, null, 2));
      console.log(`Mod info file created: ${modInfoPath}`);
      
      // If WolvenKit is available, create the mod package
      if (this.config.wolvenKitPath) {
        const wolvenKitCli = path.join(this.config.wolvenKitPath, 'WolvenKit.CLI.exe');
        const outputPath = path.join(process.cwd(), 'packages');
        
        fs.mkdirSync(outputPath, { recursive: true });
        
        const safeName = info.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const packagePath = path.join(outputPath, `${safeName}_v${info.version}.zip`);
        
        console.log('Creating mod package...');
        const command = `"${wolvenKitCli}" pack --path "${this.config.modBaseDir}" --output "${packagePath}"`;
        execSync(command, { stdio: 'inherit' });
        
        console.log(`Mod package created: ${packagePath}`);
        return packagePath;
      }
      
      return modInfoPath;
    } catch (error) {
      console.error('Error creating mod package:', error.message);
      throw error;
    }
  }
}

export default TextureAI;