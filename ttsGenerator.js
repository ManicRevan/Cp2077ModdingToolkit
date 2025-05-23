/**
 * ttsGenerator.js
 * Text-to-speech generation module that converts to Cyberpunk 2077 compatible .wem format
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import { pipeline } from 'stream/promises';

class TTSGenerator {
  constructor(options = {}) {
    this.apiKey = options.apiKey || null;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.outputDir = options.outputDir || path.join(process.cwd(), 'output', 'audio');
    this.modAudioDir = options.modAudioDir || path.join(process.cwd(), 'mod', 'archive', 'pc', 'sound', 'speech');
    this.toolsDir = options.toolsDir || path.join(process.cwd(), 'tools');
    
    // Create necessary directories
    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.mkdirSync(this.modAudioDir, { recursive: true });
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
    return this;
  }

  /**
   * Fetch available voices from ElevenLabs
   * @returns {Promise<Array>} - List of available voices
   */
  async getAvailableVoices() {
    if (!this.apiKey) throw new Error('ElevenLabs API key not set');

    try {
      const response = await axios.get(`${this.baseUrl}/voices`, {
        headers: { 'xi-api-key': this.apiKey }
      });
      
      return response.data.voices;
    } catch (error) {
      console.error('Failed to fetch voices:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Generate speech from text using ElevenLabs API
   * @param {string} text - Text to convert to speech
   * @param {string} voiceId - ElevenLabs voice ID
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Paths to generated files
   */
  async generateSpeech(text, voiceId, options = {}) {
    if (!this.apiKey) throw new Error('ElevenLabs API key not set');
    if (!text || !voiceId) throw new Error('Text and voiceId are required');

    const defaultOptions = {
      model_id: 'eleven_monolingual_v1',
      stability: 0.5,
      similarity_boost: 0.75,
      fileName: `tts_${Date.now()}`
    };

    const settings = { ...defaultOptions, ...options };
    
    try {
      // Define output paths
      const wavPath = path.join(this.outputDir, `${settings.fileName}.wav`);
      const wemPath = path.join(this.outputDir, `${settings.fileName}.wem`);
      const modPath = path.join(this.modAudioDir, `${settings.fileName}.wem`);
      
      console.log(`Generating speech: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
      
      // Make ElevenLabs API request
      const response = await axios({
        method: 'post',
        url: `${this.baseUrl}/text-to-speech/${voiceId}`,
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/wav'
        },
        data: {
          text,
          model_id: settings.model_id,
          voice_settings: {
            stability: settings.stability,
            similarity_boost: settings.similarity_boost
          }
        },
        responseType: 'stream'
      });

      // Save the WAV file
      const writer = fs.createWriteStream(wavPath);
      await pipeline(response.data, writer);
      
      console.log(`WAV file saved: ${wavPath}`);
      
      // Convert WAV to WEM
      await this.convertWavToWem(wavPath, wemPath);
      
      // Copy to mod folder
      fs.copyFileSync(wemPath, modPath);
      console.log(`Audio exported to mod folder: ${modPath}`);
      
      return {
        wavPath,
        wemPath,
        modPath
      };
    } catch (error) {
      console.error('Error generating speech:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Convert WAV file to WEM format for Cyberpunk 2077
   * @param {string} wavPath - Path to input WAV file
   * @param {string} wemPath - Path to output WEM file
   * @returns {Promise<string>} - Path to generated WEM file
   */
  async convertWavToWem(wavPath, wemPath) {
    try {
      // We'll use ww2ogg and ReVorb tools for WAV -> WEM conversion
      const vorbisEncoderPath = path.join(this.toolsDir, 'vorbis-tools', 'oggenc.exe');
      const ww2oggPath = path.join(this.toolsDir, 'ww2ogg', 'ww2ogg.exe');
      const revorbPath = path.join(this.toolsDir, 'revorb', 'revorb.exe');
      
      // Check if the required tools exist
      for (const tool of [vorbisEncoderPath, ww2oggPath, revorbPath]) {
        if (!fs.existsSync(tool)) {
          throw new Error(`Required tool not found: ${tool}`);
        }
      }
      
      // Step 1: WAV to OGG
      const oggPath = wavPath.replace('.wav', '.ogg');
      console.log('Converting WAV to OGG...');
      execSync(`"${vorbisEncoderPath}" "${wavPath}" -o "${oggPath}" -q 10`, { stdio: 'ignore' });
      
      // Step 2: OGG to WEM (intermediate format)
      const tempWemPath = wavPath.replace('.wav', '_temp.wem');
      console.log('Converting OGG to WEM...');
      
      // Customize these parameters based on Cyberpunk's audio requirements
      const wemParams = {
        format: 'Vorbis',
        quality: 10,
        sampleRate: 48000,
        channels: 2
      };
      
      // Using Wwise CLI or another conversion tool (WEM is a proprietary format)
      // This is a simplified example - real implementation may require more steps
      execSync(`"${ww2oggPath}" "${oggPath}" --pcb packaged_codebooks.bin -o "${tempWemPath}"`, { stdio: 'ignore' });
      
      // Step 3: Apply ReVorb to optimize the Vorbis stream in the WEM
      console.log('Optimizing WEM file...');
      execSync(`"${revorbPath}" "${tempWemPath}" "${wemPath}"`, { stdio: 'ignore' });
      
      // Clean up temporary files
      fs.unlinkSync(oggPath);
      fs.unlinkSync(tempWemPath);
      
      console.log(`Successfully converted to WEM: ${wemPath}`);
      return wemPath;
    } catch (error) {
      console.error('Error converting WAV to WEM:', error.message);
      throw error;
    }
  }

  /**
   * Registers the generated audio with Cyberpunk 2077's soundbanks
   * @param {string} wemPath - Path to the WEM file
   * @param {Object} options - Options for sound registration
   * @returns {Promise<boolean>} - Success status
   */
  async registerAudioWithGame(wemPath, options = {}) {
    try {
      const fileName = path.basename(wemPath);
      const soundbanksDir = path.join(process.cwd(), 'mod', 'soundbanks');
      
      // Create a soundbank definition file
      // This would need to be customized based on Cyberpunk's audio system
      const soundbankDefPath = path.join(soundbanksDir, `${fileName.replace('.wem', '.json')}`);
      
      const soundbankDef = {
        id: options.id || Math.floor(Math.random() * 1000000000),
        name: options.name || fileName.replace('.wem', ''),
        path: wemPath,
        type: options.type || 'Speech',
        // Additional properties needed for Cyberpunk's audio system
      };
      
      fs.mkdirSync(soundbanksDir, { recursive: true });
      fs.writeFileSync(soundbankDefPath, JSON.stringify(soundbankDef, null, 2));
      
      console.log(`Audio registered with game: ${soundbankDefPath}`);
      return true;
    } catch (error) {
      console.error('Error registering audio with game:', error.message);
      return false;
    }
  }
}

export default TTSGenerator;