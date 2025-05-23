# CP77 Modding Toolkit

A comprehensive modding toolkit for Cyberpunk 2077.

## Requirements
- **Node.js** v18 or newer (https://nodejs.org/)
- **WolvenKit CLI** (for texture conversion): Download from https://github.com/WolvenKit/WolvenKit
- **ElevenLabs API Key** (for TTS): https://elevenlabs.io/

## Installation

1. **Clone the repository:**
   ```sh
   git clone <repo-url>
   cd Cp2077ModdingToolkitCompleteSource
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Set up external tools:**
   - Set the `WOLVENKIT_PATH` environment variable to your WolvenKit CLI folder.
   - Set your ElevenLabs API key in the app or as an environment variable if required.

## Usage

### Development
```sh
npm run dev
```

### Production
```sh
npm run build
```
The output will be in the `dist/` folder.

### Start Electron App
```sh
npm start
```

## Notes
- Ensure all external dependencies are installed and configured before running the app.
- For plugin support, place plugins in the `plugins/` directory.

## License
MIT

## Features
- Mesh, texture, audio, quest, scene, and NPC tools
- AI-powered texture and voice generation (Stable Diffusion, ElevenLabs)
- Scene graph editor
- Plugin support
- Project management (save/load/export)

## Setup
1. **Required folders:**
   - `assets/icons/` (add your app icon as `app-icon.png`)
   - `build/` (add installer images/icons as referenced in `electron-builder.json`)
   - `tools/` (add required audio/image conversion tools)
   - `mod/`, `output/`, `plugins/`, `templates/` (created automatically if missing)

3. **External tools required:**
   - `vorbis-tools/oggenc.exe`, `ww2ogg.exe`, `revorb.exe` for audio conversion (place in `tools/`)
   - `packaged_codebooks.bin` for ww2ogg

4. **Run the app:**
   ```sh
   npm start
   ```

5. **Build the app:**
   ```sh
   npm run build
   ```

## Notes
- Replace all placeholder icons/images in `assets/icons/` and `build/` with your own.
- See `LICENSE.txt` for license information.
- For plugin development, place plugins in the `plugins/` directory.

## Windows One-Click Install

A script `install.bat` is provided for Windows users. Double-click it to:
- Automatically install Node.js (if missing)
- Install all required dependencies
- Start the application

No need to type any commands in the console! 