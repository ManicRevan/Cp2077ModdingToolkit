// npcGenerator.js

/**
 * NPC Generator for Cyberpunk 2077
 * 
 * Creates randomized NPCs with proper appearance and entity files.
 * Can optionally add NPCs to world files via streamingsector references.
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// =============== DATA POOLS FOR RANDOMIZATION ===============

// Name pools
const firstNames = {
  male: [
    "Adam", "Viktor", "Jackie", "Dexter", "River", "Goro", "Kerry", "Jefferson", 
    "Yorinobu", "Kirk", "Mateo", "Sebastian", "Johnny", "Placide", "Arthur"
  ],
  female: [
    "Judy", "Panam", "Evelyn", "Misty", "Alt", "Rogue", "Claire", "Maiko", 
    "Rebecca", "Hanako", "Dakota", "Regina", "Meredith", "Rita", "Wakako"
  ]
};

const lastNames = [
  "Smasher", "Arasaka", "Welles", "Ward", "DeShawn", "Parker", "Takemura", 
  "Eurodyne", "Peralez", "Chen", "Rodriguez", "Bartmoss", "Silverhand", 
  "Cunningham", "Blackhand", "Stout", "Wheeler", "Jensen", "Pondsmith"
];

// Appearance options
const genderOptions = ["male", "female"];
const bodyTypes = ["average", "athletic", "heavy", "slim"];
const skinTones = ["pale", "fair", "medium", "tan", "dark", "very_dark", "synthetic"];
const hairStyles = ["punk", "corpo", "casual", "bald", "mohawk", "dreadlocks", "bob", "ponytail"];
const hairColors = ["black", "brown", "blonde", "red", "white", "gray", "blue", "green", "purple", "pink"];
const eyeColors = ["brown", "blue", "green", "gray", "amber", "cybernetic_blue", "cybernetic_red"];
const facialFeatures = ["none", "scar", "tattoo", "cybernetic_implant", "piercing", "burn_marks"];
const cybermods = ["none", "arm_replacements", "leg_replacements", "spinal_implant", "facial_implant"];

// Faction options
const factions = [
  "none", "maelstrom", "tyger_claws", "valentinos", "6th_street", "voodoo_boys", 
  "animals", "scavengers", "moxes", "arasaka", "militech", "ncpd"
];

// Equipment pools
const weapons = [
  { id: "w_handgun_constitutional_unity", name: "Unity", type: "handgun" },
  { id: "w_handgun_militech_lexington", name: "Lexington", type: "handgun" },
  { id: "w_shotgun_budget_carnage", name: "Carnage", type: "shotgun" },
  { id: "w_rifle_militech_ajax", name: "Ajax", type: "rifle" },
  { id: "w_smg_kang_tao_dian", name: "Dian", type: "smg" },
  { id: "w_melee_knife", name: "Knife", type: "melee" },
  { id: "w_melee_baseball_bat", name: "Baseball Bat", type: "melee" },
  { id: "w_melee_katana", name: "Katana", type: "melee" }
];

const clothing = {
  head: [
    { id: "c_head_baseball_cap", name: "Baseball Cap" },
    { id: "c_head_beanie", name: "Beanie" },
    { id: "c_head_corpo_visor", name: "Corpo Visor" },
    { id: "c_head_none", name: "No Headwear" }
  ],
  face: [
    { id: "c_face_glasses", name: "Glasses" },
    { id: "c_face_visor", name: "Visor" },
    { id: "c_face_respirator", name: "Respirator" },
    { id: "c_face_none", name: "No Face Accessory" }
  ],
  outer: [
    { id: "c_outer_jacket_leather", name: "Leather Jacket" },
    { id: "c_outer_corpo_suit", name: "Corpo Suit" },
    { id: "c_outer_nomad_vest", name: "Nomad Vest" },
    { id: "c_outer_none", name: "No Outer Layer" }
  ],
  inner: [
    { id: "c_inner_tshirt", name: "T-Shirt" },
    { id: "c_inner_tank_top", name: "Tank Top" },
    { id: "c_inner_formal_shirt", name: "Formal Shirt" }
  ],
  bottom: [
    { id: "c_bottom_jeans", name: "Jeans" },
    { id: "c_bottom_cargo_pants", name: "Cargo Pants" },
    { id: "c_bottom_formal_pants", name: "Formal Pants" }
  ],
  shoes: [
    { id: "c_shoes_sneakers", name: "Sneakers" },
    { id: "c_shoes_boots", name: "Boots" },
    { id: "c_shoes_formal", name: "Formal Shoes" }
  ]
};

// Behavior options
const behaviorTypes = [
  "civilian_peaceful", "civilian_scared", "criminal_aggressive", 
  "guard_patrol", "guard_stationary", "vendor_interactive", 
  "gang_member_aggressive", "corpo_employee", "police_officer"
];

const scheduleTypes = ["static", "wandering", "patrolling", "working", "sitting"];

// =============== UTILITY FUNCTIONS ===============

/**
 * Gets a random element from an array
 */
function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Gets a random integer between min and max (inclusive)
 */
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Ensures a directory exists, creating it if necessary
 */
function ensureDirectoryExists(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

/**
 * Generates a unique ID for NPCs
 */
function generateUniqueID() {
  return uuidv4().replace(/-/g, '');
}

// =============== CORE FUNCTIONS ===============

/**
 * Generates random NPC data with appearance, equipment, and behavior
 */
function generateRandomNPC(options = {}) {
  // Set defaults or use provided options
  const gender = options.gender || getRandomElement(genderOptions);
  const faction = options.faction || getRandomElement(factions);
  
  // Generate a random name
  const firstName = options.firstName || getRandomElement(firstNames[gender]);
  const lastName = options.lastName || getRandomElement(lastNames);
  const name = `${firstName} ${lastName}`;
  
  // Generate appearance attributes
  const appearance = {
    gender,
    bodyType: options.bodyType || getRandomElement(bodyTypes),
    skinTone: options.skinTone || getRandomElement(skinTones),
    hairStyle: options.hairStyle || getRandomElement(hairStyles),
    hairColor: options.hairColor || getRandomElement(hairColors),
    eyeColor: options.eyeColor || getRandomElement(eyeColors),
    facialFeature: options.facialFeature || getRandomElement(facialFeatures),
    cybermod: options.cybermod || getRandomElement(cybermods)
  };
  
  // Generate equipment
  const selectedWeapon = options.weapon || getRandomElement(weapons);
  
  const equipment = {
    weapon: selectedWeapon,
    head: options.head || getRandomElement(clothing.head),
    face: options.face || getRandomElement(clothing.face),
    outer: options.outer || getRandomElement(clothing.outer),
    inner: options.inner || getRandomElement(clothing.inner),
    bottom: options.bottom || getRandomElement(clothing.bottom),
    shoes: options.shoes || getRandomElement(clothing.shoes)
  };
  
  // Generate behavior
  const behavior = {
    type: options.behaviorType || getRandomElement(behaviorTypes),
    schedule: options.scheduleType || getRandomElement(scheduleTypes),
    aggression: options.aggression || getRandomInt(0, 100),
    fear: options.fear || getRandomInt(0, 100),
    confidence: options.confidence || getRandomInt(0, 100)
  };
  
  // Compile NPC data
  const npcID = options.id || generateUniqueID();
  
  return {
    id: npcID,
    name,
    gender,
    faction,
    appearance,
    equipment,
    behavior
  };
}

/**
 * Creates an appearance file (.app) for an NPC
 */
function createAppearanceFile(npcData, outputPath) {
  if (!npcData || !outputPath) {
    throw new Error('NPC data and output path are required');
  }
  
  // Create the .app file structure
  const appData = {
    header: {
      version: 1.0,
      type: "appearance",
      id: npcData.id,
      created: new Date().toISOString()
    },
    data: {
      name: npcData.name,
      gender: npcData.appearance.gender,
      body: {
        type: npcData.appearance.bodyType,
        skinTone: npcData.appearance.skinTone
      },
      head: {
        hairStyle: npcData.appearance.hairStyle,
        hairColor: npcData.appearance.hairColor,
        eyeColor: npcData.appearance.eyeColor,
        facialFeature: npcData.appearance.facialFeature
      },
      cyberware: {
        type: npcData.appearance.cybermod
      }
    }
  };
  
  try {
    // Ensure the output directory exists
    const outputDir = path.dirname(outputPath);
    ensureDirectoryExists(outputDir);
    
    // Write the file
    fs.writeFileSync(outputPath, JSON.stringify(appData, null, 2));
    
    return outputPath;
  } catch (error) {
    throw new Error(`Failed to create appearance file: ${error.message}`);
  }
}

/**
 * Creates an entity file (.ent) for an NPC
 */
function createEntityFile(npcData, outputPath, appFilePath) {
  if (!npcData || !outputPath) {
    throw new Error('NPC data and output path are required');
  }
  
  try {
    // Create relative path for appearance reference
    const relativeAppPath = appFilePath ? path.relative(path.dirname(outputPath), appFilePath) : `${npcData.id}.app`;
    
    // Create the .ent file structure
    const entData = {
      header: {
        version: 1.0,
        type: "entity",
        id: npcData.id,
        created: new Date().toISOString()
      },
      data: {
        name: npcData.name,
        appearanceResource: relativeAppPath,
        faction: npcData.faction,
        equipment: {
          weapon: npcData.equipment.weapon.id,
          clothing: {
            head: npcData.equipment.head.id,
            face: npcData.equipment.face.id,
            outer: npcData.equipment.outer.id,
            inner: npcData.equipment.inner.id,
            bottom: npcData.equipment.bottom.id,
            shoes: npcData.equipment.shoes.id
          }
        },
        behavior: {
          type: npcData.behavior.type,
          schedule: npcData.behavior.schedule,
          attributes: {
            aggression: npcData.behavior.aggression,
            fear: npcData.behavior.fear,
            confidence: npcData.behavior.confidence
          }
        }
      }
    };
    
    // Ensure the output directory exists
    const outputDir = path.dirname(outputPath);
    ensureDirectoryExists(outputDir);
    
    // Write the file
    fs.writeFileSync(outputPath, JSON.stringify(entData, null, 2));
    
    return outputPath;
  } catch (error) {
    throw new Error(`Failed to create entity file: ${error.message}`);
  }
}

/**
 * Adds an NPC to a world file via streaming sector references
 */
function addNPCToWorld(npcData, worldFilePath, position = { x: 0, y: 0, z: 0 }, rotation = { yaw: 0, pitch: 0, roll: 0 }) {
  if (!npcData || !worldFilePath) {
    throw new Error('NPC data and world file path are required');
  }
  
  if (!fs.existsSync(worldFilePath)) {
    throw new Error(`World file does not exist: ${worldFilePath}`);
  }
  
  try {
    // Read the existing world file
    const worldData = JSON.parse(fs.readFileSync(worldFilePath, 'utf8'));
    
    // Create a new streaming sector reference for the NPC
    const npcReference = {
      id: `${npcData.id}_ref`,
      entityID: npcData.id,
      entityPath: `${npcData.id}.ent`,
      position,
      rotation,
      scale: { x: 1, y: 1, z: 1 },
      persistent: true,
      spawned: true
    };
    
    // Check if streamingsectors exists, if not create it
    if (!worldData.streamingsectors) {
      worldData.streamingsectors = [];
    }
    
    // Find the appropriate sector or create a new one
    let sectorFound = false;
    const sectorSize = 100; // Standard sector size
    const sectorX = Math.floor(position.x / sectorSize);
    const sectorY = Math.floor(position.y / sectorSize);
    const sectorKey = `sector_${sectorX}_${sectorY}`;
    
    for (const sector of worldData.streamingsectors) {
      if (sector.key === sectorKey) {
        // Add the NPC to the existing sector
        if (!sector.entities) {
          sector.entities = [];
        }
        sector.entities.push(npcReference);
        sectorFound = true;
        break;
      }
    }
    
    // If sector not found, create a new one
    if (!sectorFound) {
      const newSector = {
        key: sectorKey,
        bounds: {
          min: { x: sectorX * sectorSize, y: sectorY * sectorSize, z: -1000 },
          max: { x: (sectorX + 1) * sectorSize, y: (sectorY + 1) * sectorSize, z: 1000 }
        },
        entities: [npcReference]
      };
      worldData.streamingsectors.push(newSector);
    }
    
    // Write the updated world file
    fs.writeFileSync(worldFilePath, JSON.stringify(worldData, null, 2));
    
    return {
      worldFilePath,
      sectorKey,
      npcReferenceID: npcReference.id
    };
  } catch (error) {
    throw new Error(`Failed to add NPC to world file: ${error.message}`);
  }
}

/**
 * Generates and saves a complete NPC with appearance and entity files
 */
function generateAndSaveNPC(options = {}, outputDirectory = './output', addToWorldFile = null) {
  try {
    // Generate random NPC data
    const npcData = generateRandomNPC(options);
    
    // Set up file paths
    const basePath = path.join(outputDirectory, npcData.id);
    const appFilePath = `${basePath}.app`;
    const entFilePath = `${basePath}.ent`;
    
    // Create the files
    createAppearanceFile(npcData, appFilePath);
    createEntityFile(npcData, entFilePath, appFilePath);
    
    let worldReference = null;
    
    // Optionally add to world file
    if (addToWorldFile && addToWorldFile.path) {
      const position = addToWorldFile.position || { x: 0, y: 0, z: 0 };
      const rotation = addToWorldFile.rotation || { yaw: 0, pitch: 0, roll: 0 };
      
      worldReference = addNPCToWorld(npcData, addToWorldFile.path, position, rotation);
    }
    
    return {
      npcData,
      files: {
        appearance: appFilePath,
        entity: entFilePath
      },
      worldReference
    };
  } catch (error) {
    throw new Error(`Failed to generate and save NPC: ${error.message}`);
  }
}

/**
 * Generates a batch of NPCs with optional common parameters
 */
function generateNPCBatch(count, commonOptions = {}, outputDirectory = './output', worldFile = null) {
  if (typeof count !== 'number' || count <= 0) {
    throw new Error('Count must be a positive number');
  }
  
  const results = [];
  
  for (let i = 0; i < count; i++) {
    try {
      const npc = generateAndSaveNPC(commonOptions, outputDirectory, worldFile);
      results.push(npc);
    } catch (error) {
      console.error(`Error generating NPC ${i+1}: ${error.message}`);
    }
  }
  
  return results;
}

export { generateRandomNPC, createAppearanceFile, createEntityFile, addNPCToWorld, generateAndSaveNPC, generateNPCBatch };
export const data = {
  firstNames,
  lastNames,
  genderOptions,
  bodyTypes,
  skinTones,
  hairStyles,
  hairColors,
  eyeColors,
  facialFeatures,
  cybermods,
  factions,
  weapons,
  clothing,
  behaviorTypes,
  scheduleTypes
};