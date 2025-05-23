// aiService.js - Unified backend for advanced AI features

import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import TTSGenerator from './ttsGenerator.js';
import TextureAI from './textureAI.js';
import { generateAndSaveNPC } from './npcgenerator.js';
import { buildQuest } from './questbuilder.js';

// Simulate async delay
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// === Helper: Get API key from options or environment ===
function getApiKey(options, envVar, name) {
    const key = options.apiKey || process.env[envVar];
    if (!key) throw new Error(`${name} API key is required.`);
    return key;
}

// === Voice AI: ElevenLabs (outputs .wem and .mp3) ===
export async function generateVoiceAdvanced(options) {
    const apiKey = getApiKey(options, 'ELEVENLABS_API_KEY', 'ElevenLabs');
    const text = options.textBatch || '';
    if (!text) throw new Error('Text is required for voice generation.');
    const voiceId = options.voiceId || 'EXAVITQu4vr4xnSDxMaL';
    const tts = new TTSGenerator({ apiKey });
    const result = await tts.generateSpeech(text, voiceId, options);
    return { success: true, message: 'Voice generated', files: result };
}

// === Image AI: Stable Diffusion (outputs .xbm and .png) ===
export async function generateImageAdvanced(options) {
    const apiKey = getApiKey(options, 'STABILITY_API_KEY', 'Stability AI');
    const prompt = options.promptBatch || '';
    if (!prompt) throw new Error('Prompt is required for image generation.');
    const textureAI = new TextureAI({ apiKey });
    const result = await textureAI.generateTexture(prompt, options);
    return { success: true, message: 'Image generated', files: result };
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