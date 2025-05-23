// savegameEditor.js
// Real Cyberpunk 2077 savegame editor using CyberCAT-SimpleGUI CLI

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

const CYBERCAT_CLI = process.env.CYBERCAT_CLI_PATH || path.join(process.cwd(), 'tools', 'CyberCAT-SimpleGUI.exe');

/**
 * Load a Cyberpunk 2077 savegame file and return its parsed data (as JSON)
 * @param {string} filePath
 * @returns {Promise<object>} Parsed savegame data
 */
export function loadSavegame(filePath) {
  return new Promise((resolve, reject) => {
    execFile(CYBERCAT_CLI, ['--cli', '--load', filePath, '--export-json', 'temp_save.json'], (err, stdout, stderr) => {
      if (err) return reject(err);
      try {
        const data = JSON.parse(fs.readFileSync('temp_save.json', 'utf8'));
        resolve(data);
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Get a summary of the savegame (player name, level, money, etc.)
 * @param {object} save
 * @returns {object}
 */
export function getSaveSummary(save) {
  // Extract key info (player, level, money, playtime, etc.)
  // This will depend on the JSON structure exported by CyberCAT-SimpleGUI
  const player = save.Player || {};
  return {
    playerName: player.Name || '',
    level: player.Level || 0,
    streetCred: player.StreetCred || 0,
    money: player.Money || 0,
    playtime: save.PlayTimeSeconds || 0,
    questStates: save.QuestStates || [],
    inventory: player.Inventory || [],
    raw: player
  };
}

/**
 * Edit a savegame in memory (stats, money, inventory, flags, etc.)
 * @param {string} filePath - Path to the original savegame
 * @param {object} edits - { level, money, streetCred, inventory, questFlags }
 * @param {string} outPath - Path to save the edited savegame
 * @returns {Promise<boolean>} Success
 */
export function editSavegame(filePath, edits, outPath) {
  return new Promise((resolve, reject) => {
    const tempJson = path.join(process.cwd(), 'output', '_temp_save_edit.json');
    const tempJsonOut = path.join(process.cwd(), 'output', '_temp_save_edit_out.json');
    // 1. Export to JSON
    execFile(CYBERCAT_CLI, ['--cli', '--load', filePath, '--export-json', tempJson], (err) => {
      if (err) return reject(new Error('Failed to export savegame to JSON: ' + err.message));
      let data;
      try {
        data = JSON.parse(fs.readFileSync(tempJson, 'utf8'));
      } catch (e) {
        return reject(new Error('Failed to parse exported savegame JSON: ' + e.message));
      }
      // 2. Apply edits
      if (edits.level !== undefined) data.Player.Level = edits.level;
      if (edits.streetCred !== undefined) data.Player.StreetCred = edits.streetCred;
      if (edits.money !== undefined) data.Player.Money = edits.money;
      if (edits.inventory !== undefined && Array.isArray(edits.inventory)) data.Player.Inventory = edits.inventory;
      if (edits.questFlags !== undefined) data.QuestStates = edits.questFlags;
      // 3. Write modified JSON
      try {
        fs.writeFileSync(tempJsonOut, JSON.stringify(data, null, 2), 'utf8');
      } catch (e) {
        return reject(new Error('Failed to write edited savegame JSON: ' + e.message));
      }
      // 4. Import JSON to new savegame
      execFile(CYBERCAT_CLI, ['--cli', '--import-json', tempJsonOut, '--save', outPath], (err2) => {
        // Clean up temp files
        try { fs.unlinkSync(tempJson); } catch {}
        try { fs.unlinkSync(tempJsonOut); } catch {}
        if (err2) return reject(new Error('Failed to import edited JSON to savegame: ' + err2.message));
        resolve(true);
      });
    });
  });
} 