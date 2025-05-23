/**
 * questBuilder.js
 * A module for converting JSON quest definitions to Cyberpunk 2077 compatible quest files
 * for use with ArchiveXL and other modding frameworks.
 */

import fs from 'fs';
import path from 'path';

/**
 * Format adapters for different output formats
 */
const formatAdapters = {
  json: {
    extension: 'json',
    serialize: (data) => JSON.stringify(data, null, 2)
  },
  xml: {
    extension: 'xml',
    serialize: (data) => {
      // Simple XML serialization
      const toXml = (obj, name) => {
        if (Array.isArray(obj)) {
          return obj.map((item, index) => toXml(item, `${name.slice(0, -1)}`)).join('');
        } else if (typeof obj === 'object' && obj !== null) {
          let xml = `<${name}>`;
          for (const [key, value] of Object.entries(obj)) {
            xml += toXml(value, key);
          }
          xml += `</${name}>`;
          return xml;
        } else {
          return `<${name}>${obj}</${name}>`;
        }
      };
      
      return toXml(data, 'root');
    }
  },
  archiveXL: {
    extension: 'xl',
    serialize: (data) => {
      // ArchiveXL specific serialization
      return JSON.stringify(data, null, 2);
    }
  }
};

/**
 * QuestBuilder class for generating Cyberpunk 2077 quest files
 */
class QuestBuilder {
  /**
   * Create a new QuestBuilder
   * @param {Object} questData - The quest definition data
   * @param {string} outputPath - Path to write output files
   * @param {string} format - Output format (json, xml, archiveXL)
   */
  constructor(questData, outputPath = './output', format = 'archiveXL') {
    this.questData = questData;
    this.outputPath = outputPath;
    this.format = format;
    
    // Select the appropriate format adapter
    if (!formatAdapters[format]) {
      console.warn(`Format "${format}" not recognized. Using archiveXL format as default.`);
      this.format = 'archiveXL';
    }
    this.adapter = formatAdapters[this.format];
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputPath)) {
      try {
        fs.mkdirSync(this.outputPath, { recursive: true });
      } catch (error) {
        throw new Error(`Failed to create output directory: ${error.message}`);
      }
    }
  }
  
  /**
   * Validate the input JSON structure
   * @returns {boolean} - Whether the input is valid
   */
  validateInput() {
    // Check for required fields
    const requiredFields = ['id', 'title', 'stages'];
    for (const field of requiredFields) {
      if (!this.questData[field]) {
        console.error(`Missing required field: ${field}`);
        return false;
      }
    }
    
    // Validate stages
    if (!Array.isArray(this.questData.stages) || this.questData.stages.length === 0) {
      console.error('Stages must be a non-empty array');
      return false;
    }
    
    // Check that each stage has an id and name
    for (const [index, stage] of this.questData.stages.entries()) {
      if (!stage.id) {
        console.error(`Stage at index ${index} is missing an id`);
        return false;
      }
      if (!stage.name) {
        console.error(`Stage ${stage.id} is missing a name`);
        return false;
      }
      if (!Array.isArray(stage.objectives) || stage.objectives.length === 0) {
        console.error(`Stage ${stage.id} must have at least one objective`);
        return false;
      }
    }
    
    // Validate scenes if present
    if (this.questData.scenes) {
      if (!Array.isArray(this.questData.scenes)) {
        console.error('Scenes must be an array');
        return false;
      }
      
      // Check each scene for required properties
      for (const [index, scene] of this.questData.scenes.entries()) {
        if (!scene.id) {
          console.error(`Scene at index ${index} is missing an id`);
          return false;
        }
        if (!scene.location) {
          console.error(`Scene ${scene.id} is missing a location`);
          return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * Generate all quest files
   * @returns {boolean} - Whether generation was successful
   */
  generateFiles() {
    if (!this.validateInput()) {
      return false;
    }
    
    try {
      this.generateQuestFile();
      this.generateQuestPhaseFiles();
      
      if (this.questData.scenes && this.questData.scenes.length > 0) {
        this.generateSceneFiles();
      }
      
      if (this.questData.journal) {
        this.generateJournalFile();
      }
      
      return true;
    } catch (error) {
      console.error('Error generating files:', error);
      return false;
    }
  }
  
  /**
   * Generate the main quest file (.quest)
   */
  generateQuestFile() {
    const questId = this.questData.id;
    const questContent = {
      quest: {
        id: questId,
        title: this.questData.title,
        description: this.questData.description || '',
        type: this.questData.type || 'SideQuest',
        areaId: this.questData.areaId || 'watson',
        difficulty: this.questData.difficulty || 'Normal',
        rewardItems: this.questData.rewardItems || [],
        rewardXP: this.questData.rewardXP || 500,
        phases: this.questData.stages.map(stage => ({
          id: stage.id,
          name: stage.name,
          file: `${stage.id}.questphase.${this.adapter.extension}`
        })),
        journalEntry: this.questData.journal ? `${questId}.journal.${this.adapter.extension}` : null,
        firstPhase: this.questData.firstPhase || this.questData.stages[0].id,
        isHiddenInJournal: this.questData.isHiddenInJournal || false,
        tags: this.questData.tags || [],
        requiredLevel: this.questData.requiredLevel || 1
      }
    };
    
    this.writeFile(`${questId}.quest.${this.adapter.extension}`, this.adapter.serialize(questContent));
  }
  
  /**
   * Generate quest phase files (.questphase)
   */
  generateQuestPhaseFiles() {
    for (const stage of this.questData.stages) {
      const phaseContent = {
        questphase: {
          id: stage.id,
          name: stage.name,
          description: stage.description || '',
          objectives: {
            objective: stage.objectives.map(obj => ({
              id: obj.id,
              description: obj.description,
              isOptional: obj.isOptional || false,
              isInitiallyHidden: obj.isInitiallyHidden || false,
              completionTriggers: obj.completionTriggers || [],
              failureTriggers: obj.failureTriggers || [],
              // Handle branching based on objective completion
              onComplete: obj.branch ? {
                branch: obj.branch,
                nextPhase: obj.nextPhase || null
              } : null
            }))
          },
          events: {
            event: (stage.events || []).map(event => ({
              type: event.type,
              sceneId: event.sceneId,
              trigger: event.trigger,
              locationId: event.locationId,
              conditions: event.conditions || [],
              delay: event.delay || 0,
              actorId: event.actorId || null,
              animation: event.animation || null
            }))
          },
          // Support for branching based on choices
          branches: {
            branch: (stage.branches || []).map(branch => ({
              id: branch.id,
              condition: branch.condition,
              nextPhase: branch.nextPhase
            }))
          },
          // Default next phase if no branching occurs
          nextPhase: stage.nextPhase || null,
          // Journal update when entering this phase
          journalUpdate: stage.journalUpdate || false
        }
      };
      
      this.writeFile(`${stage.id}.questphase.${this.adapter.extension}`, this.adapter.serialize(phaseContent));
    }
  }
  
  /**
   * Generate scene files for cutscenes (.scene)
   */
  generateSceneFiles() {
    if (!this.questData.scenes) return;
    
    for (const scene of this.questData.scenes) {
      const sceneContent = {
        scene: {
          id: scene.id,
          location: scene.location,
          // Actor positioning and animations
          actors: {
            actor: (scene.actors || []).map(actor => ({
              id: actor.id,
              position: actor.position || { x: 0, y: 0, z: 0 },
              rotation: actor.rotation || { pitch: 0, yaw: 0, roll: 0 },
              animation: actor.animation || 'idle',
              outfit: actor.outfit || 'default',
              facialExpression: actor.facialExpression || 'neutral'
            }))
          },
          // Camera setup for cinematic sequences
          cameraNodes: {
            cameraNode: (scene.cameraNodes || []).map(node => ({
              id: node.id,
              position: node.position,
              rotation: node.rotation,
              duration: node.duration,
              transition: node.transition || 'cut',
              fieldOfView: node.fieldOfView || 60,
              depthOfField: node.depthOfField || {
                enabled: false,
                focusDistance: 3,
                aperture: 2.8,
                bokehShape: 'circle'
              }
            }))
          },
          // Sequential dialogue and choices
          dialogue: {
            dialogueItem: (scene.dialogue || []).map(dialogue => {
              if (dialogue.choices) {
                return {
                  type: 'choice',
                  actorId: dialogue.actorId,
                  cameraNodeId: dialogue.cameraNodeId,
                  choices: {
                    choice: dialogue.choices.map(choice => ({
                      text: choice.text,
                      responseId: choice.responseId,
                      conditions: choice.conditions || [],
                      effects: choice.effects || []
                    }))
                  }
                };
              } else {
                return {
                  type: 'line',
                  actorId: dialogue.actorId,
                  line: dialogue.line,
                  animation: dialogue.animation || 'talk',
                  cameraNodeId: dialogue.cameraNodeId,
                  duration: dialogue.duration || 'auto',
                  lipSync: dialogue.lipSync !== false
                };
              }
            })
          },
          // Responses to player choices
          responses: {
            response: Object.entries(scene.responses || {}).map(([id, resp]) => ({
              id,
              actorId: resp.actorId,
              line: resp.line,
              animation: resp.animation || 'talk',
              cameraNodeId: resp.cameraNodeId,
              nextDialogueId: resp.nextDialogueId || null,
              effects: resp.effects || []
            }))
          },
          // Environmental effects during cutscene
          effects: {
            effect: (scene.effects || []).map(effect => ({
              type: effect.type,
              target: effect.target,
              parameters: effect.parameters || {},
              startTime: effect.startTime || 0,
              duration: effect.duration || 1
            }))
          },
          // Audio cues
          audio: {
            cue: (scene.audio || []).map(audio => ({
              type: audio.type,
              source: audio.source,
              volume: audio.volume || 1.0,
              startTime: audio.startTime || 0,
              loop: audio.loop || false
            }))
          }
        }
      };
      
      this.writeFile(`${scene.id}.scene.${this.adapter.extension}`, this.adapter.serialize(sceneContent));
    }
  }
  
  /**
   * Generate journal entries file (.journal)
   */
  generateJournalFile() {
    if (!this.questData.journal) return;
    
    const journalContent = {
      journal: {
        title: this.questData.journal.title || this.questData.title,
        entries: {
          entry: (this.questData.journal.entries || []).map(entry => ({
            stageId: entry.stageId,
            title: entry.title,
            content: entry.content,
            timestamp: entry.timestamp || new Date().toISOString(),
            image: entry.image || null,
            isTracked: entry.isTracked || false
          }))
        },
        // Optional codex entries that get unlocked during the quest
        codexEntries: {
          codexEntry: (this.questData.journal.codexEntries || []).map(entry => ({
            id: entry.id,
            title: entry.title,
            content: entry.content,
            category: entry.category || 'General',
            unlockCondition: entry.unlockCondition || 'automatic'
          }))
        }
      }
    };
    
    this.writeFile(`${this.questData.id}.journal.${this.adapter.extension}`, this.adapter.serialize(journalContent));
  }
  
  /**
   * Helper method to write a file
   * @param {string} fileName - Name of the file
   * @param {string} content - Content to write
   */
  writeFile(fileName, content) {
    try {
      const filePath = path.join(this.outputPath, fileName);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Generated: ${filePath}`);
    } catch (error) {
      throw new Error(`Failed to write file ${fileName}: ${error.message}`);
    }
  }
}

/**
 * Build quest files from a JSON quest definition
 * @param {Object|string} input - Quest data object or path to JSON file
 * @param {string} outputPath - Path to output directory
 * @param {string} format - Output format (json, xml, archiveXL)
 * @returns {boolean} - Whether generation was successful
 */
function buildQuest(input, outputPath = './output', format = 'archiveXL') {
  let questData;
  
  if (typeof input === 'string') {
    // Input is a file path
    try {
      const fileContent = fs.readFileSync(input, 'utf8');
      questData = JSON.parse(fileContent);
    } catch (error) {
      console.error('Error reading input file:', error.message);
      return false;
    }
  } else if (typeof input === 'object' && input !== null) {
    // Input is an object
    questData = input;
  } else {
    console.error('Invalid input type. Expected object or string (file path)');
    return false;
  }
  
  try {
    const builder = new QuestBuilder(questData, outputPath, format);
    return builder.generateFiles();
  } catch (error) {
    console.error('Quest generation failed:', error.message);
    return false;
  }
}

// Example quest definition to demonstrate usage
const exampleQuest = {
  id: "night_city_mystery",
  title: "The Night City Mystery",
  description: "Investigate strange occurrences in Night City",
  stages: [
    {
      id: "stage_start",
      name: "Investigation Begins",
      description: "Begin the investigation at the abandoned warehouse",
      objectives: [
        {
          id: "obj_reach_warehouse",
          description: "Go to the abandoned warehouse"
        }
      ],
      events: [
        {
          type: "dialogue",
          sceneId: "scene_warehouse_entrance",
          trigger: "locationEnter",
          locationId: "warehouse_entrance"
        }
      ]
    },
    {
      id: "stage_choice",
      name: "Making a Decision",
      description: "Decide how to proceed with the investigation",
      objectives: [
        {
          id: "obj_choice_a",
          description: "Confront directly",
          isOptional: true,
          branch: "confrontation"
        },
        {
          id: "obj_choice_b",
          description: "Investigate stealthily",
          isOptional: true,
          branch: "stealth"
        }
      ]
    },
    {
      id: "stage_confrontation",
      name: "Direct Confrontation",
      description: "Consequences of confronting directly",
      objectives: [
        {
          id: "obj_confront",
          description: "Defeat the enemies"
        }
      ]
    },
    {
      id: "stage_stealth",
      name: "Stealth Approach",
      description: "Consequences of sneaking in",
      objectives: [
        {
          id: "obj_sneak",
          description: "Find evidence without being detected"
        }
      ]
    }
  ],
  scenes: [
    {
      id: "scene_warehouse_entrance",
      location: "warehouse_entrance",
      actors: [
        {
          id: "player",
          position: { x: 0, y: 0, z: 0 },
          rotation: { pitch: 0, yaw: 0, roll: 0 }
        },
        {
          id: "johnny",
          position: { x: 1, y: 0, z: 0 },
          rotation: { pitch: 0, yaw: 180, roll: 0 },
          animation: "johnny_lean"
        }
      ],
      cameraNodes: [
        {
          id: "cam_player",
          position: { x: -1, y: 0.5, z: 1.6 },
          rotation: { pitch: 0, yaw: 0, roll: 0 },
          duration: 3
        },
        {
          id: "cam_johnny",
          position: { x: 0, y: 0.5, z: 1.6 },
          rotation: { pitch: 0, yaw: 180, roll: 0 },
          duration: 3,
          transition: "smooth"
        }
      ],
      dialogue: [
        {
          actorId: "johnny",
          line: "This place gives me the creeps. Watch your back.",
          animation: "johnny_concerned",
          cameraNodeId: "cam_johnny"
        },
        {
          actorId: "player",
          choices: [
            {
              text: "Let's be careful here.",
              responseId: "careful_response"
            },
            {
              text: "Nothing I can't handle.",
              responseId: "confident_response"
            }
          ],
          cameraNodeId: "cam_player"
        }
      ],
      responses: {
        "careful_response": {
          actorId: "johnny",
          line: "For once we agree on something.",
          animation: "johnny_nod",
          cameraNodeId: "cam_johnny"
        },
        "confident_response": {
          actorId: "johnny",
          line: "Your funeral, samurai.",
          animation: "johnny_smirk",
          cameraNodeId: "cam_johnny"
        }
      }
    }
  ],
  journal: {
    title: "The Night City Mystery",
    entries: [
      {
        stageId: "stage_start",
        title: "Strange Signal",
        content: "I picked up a strange signal originating from an abandoned warehouse in Watson. Worth checking out."
      },
      {
        stageId: "stage_choice",
        title: "The Warehouse",
        content: "The warehouse seems to be a front for some shady operation. I need to decide how to proceed."
      },
      {
        stageId: "stage_confrontation",
        title: "Direct Approach",
        content: "I decided to confront whoever was inside the warehouse directly."
      },
      {
        stageId: "stage_stealth",
        title: "Sneaking In",
        content: "I decided to take a stealthy approach and gather intelligence without being detected."
      }
    ]
  }
};

export { QuestBuilder, buildQuest, exampleQuest };