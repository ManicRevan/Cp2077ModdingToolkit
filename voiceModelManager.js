// voiceModelManager.js
// Manage CyberVoice/xVASynth and ElevenLabs voice models for character voice generation

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import axios from 'axios';
import FormData from 'form-data';

const MODELS_DIR = path.join(process.cwd(), 'voice_models');
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

/**
 * List all available voice models (CyberVoice/xVASynth and ElevenLabs custom)
 * @returns {Array} Array of { id, name, type, path, source }
 */
export function listVoiceModels() {
  const models = [];
  // List CyberVoice/xVASynth models (assume .pth, .onnx, or .json files)
  for (const file of fs.readdirSync(MODELS_DIR)) {
    const ext = path.extname(file).toLowerCase();
    if ([".pth", ".onnx", ".json"].includes(ext)) {
      models.push({
        id: file,
        name: path.basename(file, ext),
        type: 'cybervoice',
        path: path.join(MODELS_DIR, file),
        source: 'CyberVoice/xVASynth'
      });
    }
  }
  // List ElevenLabs custom models (store as JSON with voice_id)
  const elevenPath = path.join(MODELS_DIR, 'elevenlabs_models.json');
  if (fs.existsSync(elevenPath)) {
    const data = JSON.parse(fs.readFileSync(elevenPath, 'utf8'));
    for (const model of data.models || []) {
      models.push({ ...model, type: 'elevenlabs', source: 'ElevenLabs' });
    }
  }
  return models;
}

/**
 * Import a new voice model (CyberVoice/xVASynth .pth/.onnx/.json or ElevenLabs voice_id)
 * @param {object} model { file, name, type, voice_id }
 */
export function importVoiceModel(model) {
  if (model.type === 'cybervoice') {
    // Copy model file to MODELS_DIR
    const dest = path.join(MODELS_DIR, path.basename(model.file));
    fs.copyFileSync(model.file, dest);
    return true;
  } else if (model.type === 'elevenlabs') {
    // Add to elevenlabs_models.json
    const elevenPath = path.join(MODELS_DIR, 'elevenlabs_models.json');
    let data = { models: [] };
    if (fs.existsSync(elevenPath)) data = JSON.parse(fs.readFileSync(elevenPath, 'utf8'));
    data.models.push({ id: model.voice_id, name: model.name, voice_id: model.voice_id });
    fs.writeFileSync(elevenPath, JSON.stringify(data, null, 2));
    return true;
  }
  return false;
}

/**
 * Generate voice lines using a selected model
 * @param {object} opts { modelId, lines, outputDir, elevenApiKey }
 * @returns {Array} Array of generated file paths
 */
export async function generateVoiceWithModel(opts) {
  const { modelId, lines, outputDir, elevenApiKey } = opts;
  const model = listVoiceModels().find(m => m.id === modelId);
  if (!model) throw new Error('Model not found');
  if (model.type === 'cybervoice') {
    // Call xVASynth/CyberVoice CLI
    // Assume CLI: xvasynth_cli --model "modelPath" --input lines.txt --output outputDir
    const linesPath = path.join(outputDir, 'lines.txt');
    fs.writeFileSync(linesPath, lines.join('\n'));
    const cliPath = process.env.XVASYNTH_CLI_PATH || 'xvasynth_cli';
    execFileSync(cliPath, ['--model', model.path, '--input', linesPath, '--output', outputDir]);
    // Return generated .wav files
    return fs.readdirSync(outputDir).filter(f => f.endsWith('.wav')).map(f => path.join(outputDir, f));
  } else if (model.type === 'elevenlabs') {
    // Use ElevenLabs API
    const results = [];
    for (const line of lines) {
      const url = `${ELEVENLABS_API_BASE}/text-to-speech/${model.voice_id}`;
      const res = await axios.post(url, {
        text: line,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8 }
      }, {
        headers: { 'xi-api-key': elevenApiKey },
        responseType: 'arraybuffer'
      });
      const outFile = path.join(outputDir, `voice_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
      fs.writeFileSync(outFile, res.data);
      results.push(outFile);
    }
    return results;
  }
  throw new Error('Unknown model type');
}

/**
 * Get info about a model
 * @param {string} modelId
 */
export function getModelInfo(modelId) {
  return listVoiceModels().find(m => m.id === modelId);
} 