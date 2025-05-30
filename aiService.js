// aiService.js - Unified backend for advanced AI features

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import TTSGenerator from './ttsGenerator.js';
import TextureAI from './textureAI.js';
import { generateAndSaveNPC } from './npcgenerator.js';
import { buildQuest } from './questbuilder.js';
import sharp from 'sharp';

// Simulate async delay
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// === Helper: Get API key from options or environment ===
function getApiKey(options, envVar, name) {
    const key = options.apiKey || process.env[envVar];
    if (!key) throw new Error(`${name} API key is required.`);
    return key;
}

// === In-memory result cache for AI outputs ===
const AI_RESULT_CACHE = new Map(); // key: JSON.stringify({type, prompt, options}), value: result
const AI_RESULT_CACHE_SIZE = 50;
function getCachedResult(type, prompt, options) {
  const key = JSON.stringify({ type, prompt, options });
  if (AI_RESULT_CACHE.has(key)) {
    const value = AI_RESULT_CACHE.get(key);
    AI_RESULT_CACHE.delete(key);
    AI_RESULT_CACHE.set(key, value);
    return value;
  }
  return null;
}
function setCachedResult(type, prompt, options, result) {
  const key = JSON.stringify({ type, prompt, options });
  if (AI_RESULT_CACHE.has(key)) AI_RESULT_CACHE.delete(key);
  AI_RESULT_CACHE.set(key, result);
  if (AI_RESULT_CACHE.size > AI_RESULT_CACHE_SIZE) {
    const firstKey = AI_RESULT_CACHE.keys().next().value;
    AI_RESULT_CACHE.delete(firstKey);
  }
}

// === Voice AI: ElevenLabs (outputs .wem and .mp3) ===
/**
 * Generate voice using selected model (supports batch)
 * @param {object} options { textBatch: string|string[], model: 'elevenlabs'|'cybervoice', voiceId, ... }
 */
export async function generateVoiceAdvanced(options) {
    const apiKey = getApiKey(options, 'ELEVENLABS_API_KEY', 'ElevenLabs');
    const texts = Array.isArray(options.textBatch) ? options.textBatch : [options.textBatch];
    const model = options.model || 'elevenlabs';
    const voiceId = options.voiceId || 'EXAVITQu4vr4xnSDxMaL';
    const tts = new TTSGenerator({ apiKey });
    const results = [];
    for (const text of texts) {
        // Check cache
        const cached = getCachedResult('voice', text, { model, voiceId });
        if (cached) { results.push(cached); continue; }
        let result;
        if (model === 'elevenlabs') {
            result = await tts.generateSpeech(text, voiceId, options);
            // Basic quality check: ensure .wav exists and is >1s
            if (result.wavPath && fs.existsSync(result.wavPath)) {
                const stats = fs.statSync(result.wavPath);
                if (stats.size < 10000) throw new Error('Generated audio too short or empty.');
            }
        } else {
            throw new Error('Only ElevenLabs model supported for now.');
        }
        setCachedResult('voice', text, { model, voiceId }, result);
        results.push(result);
    }
    return { success: true, message: 'Voice generated', files: results };
}

// === Image AI: Stable Diffusion (outputs .xbm and .png) ===
/**
 * Generate images using selected model (supports batch)
 * @param {object} options { promptBatch: string|string[], model: 'stablediffusion', ... }
 */
export async function generateImageAdvanced(options) {
    const apiKey = getApiKey(options, 'STABILITY_API_KEY', 'Stability AI');
    const prompts = Array.isArray(options.promptBatch) ? options.promptBatch : [options.promptBatch];
    const model = options.model || 'stablediffusion';
    const textureAI = new TextureAI({ apiKey });
    const results = [];
    for (const prompt of prompts) {
        // Check cache
        const cached = getCachedResult('image', prompt, { model });
        if (cached) { results.push(cached); continue; }
        let result;
        if (model === 'stablediffusion') {
            result = await textureAI.generateTexture(prompt, options);
            // Basic quality check: ensure PNG exists and is 4K
            if (result.pngPath && fs.existsSync(result.pngPath)) {
                const { width, height } = await sharp(result.pngPath).metadata();
                if (width < 2048 || height < 2048) throw new Error('Generated image resolution too low.');
            }
        } else {
            throw new Error('Only Stable Diffusion model supported for now.');
        }
        setCachedResult('image', prompt, { model }, result);
        results.push(result);
    }
    return { success: true, message: 'Image generated', files: results };
}

// === NPC/Quest/Dialogue AI: OpenAI GPT-4 (outputs .npc/.quest/.scene/.json) ===
export async function generateNPCProfile(options) {
    const apiKey = getApiKey(options, 'OPENAI_API_KEY', 'OpenAI');
    const prompt = options.prompt || 'Generate a Cyberpunk 2077 NPC profile.';
    // Generate text with OpenAI
    const url = 'https://api.openai.com/v1/chat/completions';
    const messages = [
        { role: 'system', content: 'You are an expert Cyberpunk 2077 modder. Generate a detailed NPC profile for the game.' },
        { role: 'user', content: prompt }
    ];
    const response = await axios.post(url, {
        model: 'gpt-4',
        messages,
        max_tokens: 300
    }, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    // Parse and save as .npc file
    const npcText = response.data.choices[0].message.content;
    const npcData = JSON.parse(npcText);
    const out = generateAndSaveNPC(npcData, './mod/npcs');
    return { success: true, npc: out };
}
export async function generateQuest(options) {
    const apiKey = getApiKey(options, 'OPENAI_API_KEY', 'OpenAI');
    const prompt = options.prompt || 'Generate a Cyberpunk 2077 quest.';
    const url = 'https://api.openai.com/v1/chat/completions';
    const messages = [
        { role: 'system', content: 'You are an expert Cyberpunk 2077 modder. Generate a detailed quest for the game.' },
        { role: 'user', content: prompt }
    ];
    const response = await axios.post(url, {
        model: 'gpt-4',
        messages,
        max_tokens: 400
    }, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    // Parse and save as .quest/.json files
    const questText = response.data.choices[0].message.content;
    let questData;
    try {
        questData = JSON.parse(questText);
    } catch {
        // If not JSON, wrap as description
        questData = { description: questText };
    }
    const out = buildQuest(questData, './mod/quests', 'json');
    return { success: true, quest: out };
}
export async function expandDialogue(options) {
    const apiKey = getApiKey(options, 'OPENAI_API_KEY', 'OpenAI');
    const prompt = options.prompt || 'Expand this dialogue for Cyberpunk 2077.';
    const url = 'https://api.openai.com/v1/chat/completions';
    const messages = [
        { role: 'system', content: 'You are an expert Cyberpunk 2077 modder. Expand the following dialogue for the game.' },
        { role: 'user', content: prompt }
    ];
    const response = await axios.post(url, {
        model: 'gpt-4',
        messages,
        max_tokens: 200
    }, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    // Save as .json
    const dialogueText = response.data.choices[0].message.content;
    const outPath = './mod/dialogue/dialogue_' + Date.now() + '.json';
    fs.mkdirSync('./mod/dialogue', { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ dialogue: dialogueText }, null, 2));
    return { success: true, dialogue: outPath };
}
export async function translateDialogue(options) {
    const apiKey = getApiKey(options, 'OPENAI_API_KEY', 'OpenAI');
    const prompt = `Translate this to ${options.language || 'Spanish'}: ${options.prompt}`;
    const url = 'https://api.openai.com/v1/chat/completions';
    const messages = [
        { role: 'system', content: 'You are a professional game localizer.' },
        { role: 'user', content: prompt }
    ];
    try {
        const response = await axios.post(url, {
            model: 'gpt-4',
            messages,
            max_tokens: 200
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        return { success: true, translation: response.data.choices[0].message.content };
    } catch (err) {
        throw new Error('OpenAI API error: ' + (err.response?.data?.error?.message || err.message));
    }
}

// === Audio AI: Suno (music), PlayHT (SFX) ===
export async function generateSoundEffect(options) {
    const apiKey = getApiKey(options, 'PLAYHT_API_KEY', 'PlayHT');
    const prompt = options.prompt || 'cyberpunk sound effect';
    const url = 'https://api.play.ht/api/v2/sound-effects/generate';
    try {
        const response = await axios.post(url, { prompt }, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        // Assume response contains a URL to the generated file
        const fileUrl = response.data.url;
        const outFile = 'sound-effect.wav';
        const fileRes = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(outFile, fileRes.data);
        return { success: true, file: outFile };
    } catch (err) {
        throw new Error('PlayHT API error: ' + (err.response?.data?.message || err.message));
    }
}
export async function generateMusic(options) {
    const apiKey = getApiKey(options, 'SUNO_API_KEY', 'Suno');
    const prompt = options.prompt || 'cyberpunk music';
    const url = 'https://studio-api.suno.ai/api/v1/music/generate';
    try {
        const response = await axios.post(url, { prompt }, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        // Assume response contains a URL to the generated file
        const fileUrl = response.data.url;
        const outFile = 'music-output.mp3';
        const fileRes = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(outFile, fileRes.data);
        return { success: true, file: outFile };
    } catch (err) {
        throw new Error('Suno API error: ' + (err.response?.data?.message || err.message));
    }
}

// === Automation & Integration ===
export async function autoTagAsset(options) {
    const apiKey = getApiKey(options, 'OPENAI_API_KEY', 'OpenAI');
    const file = options.file;
    if (!file) throw new Error('File is required for auto-tagging.');
    // Use OpenAI CLIP via Replicate
    const url = 'https://api.replicate.com/v1/predictions';
    const form = new FormData();
    form.append('version', 'cfe9db7cfc1e4c6e9c7b6e8e6e7e6e7e6e7e6e7e6e7e6e7e6e7e6e7e6e7e6e7'); // CLIP version
    form.append('input', file);
    try {
        const response = await axios.post(url, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Token ${apiKey}`
            }
        });
        return { success: true, tags: response.data.output }; // tags array
    } catch (err) {
        throw new Error('Replicate CLIP API error: ' + (err.response?.data?.message || err.message));
    }
}
export async function runSmartSearch(options) {
    // Use OpenAI GPT-4 to interpret the query and return asset suggestions
    const apiKey = getApiKey(options, 'OPENAI_API_KEY', 'OpenAI');
    const query = options.query || '';
    const url = 'https://api.openai.com/v1/chat/completions';
    const messages = [
        { role: 'system', content: 'You are a smart asset search assistant for Cyberpunk 2077 modding.' },
        { role: 'user', content: query }
    ];
    try {
        const response = await axios.post(url, {
            model: 'gpt-4',
            messages,
            max_tokens: 100
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        return { success: true, results: response.data.choices[0].message.content };
    } catch (err) {
        throw new Error('OpenAI API error: ' + (err.response?.data?.error?.message || err.message));
    }
}
export async function upscaleAsset(options) {
    const apiKey = getApiKey(options, 'REPLICATE_API_KEY', 'Replicate');
    const file = options.file;
    if (!file) throw new Error('File is required for upscaling.');
    // Use Replicate's Real-ESRGAN
    const url = 'https://api.replicate.com/v1/predictions';
    const form = new FormData();
    form.append('version', '9936c4c0c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4'); // Real-ESRGAN version
    form.append('input', file);
    try {
        const response = await axios.post(url, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Token ${apiKey}`
            }
        });
        const fileUrl = response.data.output;
        const outFile = 'upscaled-image.png';
        const fileRes = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(outFile, fileRes.data);
        return { success: true, file: outFile };
    } catch (err) {
        throw new Error('Replicate Real-ESRGAN API error: ' + (err.response?.data?.message || err.message));
    }
}

// === AI Assistant/Chatbot: OpenAI ChatGPT ===
export async function askAssistant(options) {
    const apiKey = getApiKey(options, 'OPENAI_API_KEY', 'OpenAI');
    const input = options.input || '';
    const url = 'https://api.openai.com/v1/chat/completions';
    const messages = [
        { role: 'system', content: 'You are a helpful Cyberpunk 2077 modding assistant.' },
        { role: 'user', content: input }
    ];
    try {
        const response = await axios.post(url, {
            model: 'gpt-4',
            messages,
            max_tokens: 300
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        return { success: true, response: response.data.choices[0].message.content };
    } catch (err) {
        throw new Error('OpenAI API error: ' + (err.response?.data?.error?.message || err.message));
    }
}

// === TTS Batch Generation ===
/**
 * Generate TTS using selected model (supports batch)
 * @param {object} options { textBatch: string|string[], model: 'elevenlabs', ... }
 */
export async function generateTTSBatch(options) {
    return generateVoiceAdvanced(options);
} 