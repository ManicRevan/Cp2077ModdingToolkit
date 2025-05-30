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

## Centralized Error Handling

The toolkit implements a centralized error handling system:
- **Backend (Electron Main Process):**
  - All uncaught exceptions and unhandled promise rejections are logged and sent to the renderer process.
  - Errors are surfaced in the UI as modals and toasts for user feedback.
- **Frontend (Renderer Process):**
  - Listens for global error events and displays them to the user.
  - All async UI actions should use try/catch and call `showError(message)` on failure.
- **Plugin Developers:**
  - Use try/catch in plugin code and log errors using the provided logger.
  - Errors thrown in plugins will be caught and surfaced in the UI if unhandled.

**Best Practices:**
- Always handle errors gracefully and provide meaningful messages.
- Use the logger for backend errors and `showError` for UI errors.
- For critical errors, ensure the user is notified and the app remains stable.

## Performance: Caching & Lazy Loading

The toolkit implements several caching and lazy loading features for optimal performance:

- **Asset Preview LRU Cache:**
  - In-memory cache for asset previews (images, scripts) with a maximum of 50 items.
  - Reduces repeated disk reads and speeds up UI rendering.
  - Automatically evicts least recently used items when full.
- **Debounced Asset DB Writes:**
  - Tagging and batch tagging operations debounce writes to the asset database, reducing disk I/O and improving responsiveness.
- **Archive Listing Cache:**
  - In-memory cache for archive file listings (.zip, .archive) with a 5-minute time-to-live (TTL).
  - Cache is invalidated if the archive file is modified.
  - Greatly improves repeated archive browsing performance.

**Best Practices:**
- For very large assets, consider using streaming APIs or chunked processing (future work).
- Monitor memory usage if working with extremely large numbers of assets or archives.
- Caches are automatically managed and require no manual intervention.

## Mod Management: Backups, Restore, and Validation

- **Automated Mod Backups:**
  - Every time a mod project is saved, a timestamped zip backup is created in the mod's `backups/` folder.
  - The system keeps the last 10 backups automatically.
- **Restore from Backup:**
  - You can list and restore any backup from the `backups/` folder via the UI or IPC.
- **Mod Validation:**
  - The toolkit can validate a mod directory for required files, manifest correctness, and structure.
  - Validation checks for the presence and correctness of `manifest.json`, required fields, and at least one data file.

**Best Practices:**
- Regularly save your mod project to ensure backups are created.
- Use the validation tool before sharing or publishing mods.
- Restore from backup if you encounter corruption or accidental changes.
- Use version control (Git) for advanced history and rollback.

## AI Features: Model Selection, Batch Processing, Caching, and Quality Checks

- **Model Selection:**
  - All AI features (voice, image, TTS) support model selection via the `model` or `modelId` option.
  - Example: `{ model: 'elevenlabs' }` for voice, `{ model: 'stablediffusion' }` for image.
- **Batch Processing:**
  - You can pass an array of prompts or texts to batch-generate images or audio.
  - Example: `{ promptBatch: ["prompt1", "prompt2"] }` or `{ textBatch: ["line1", "line2"] }`.
- **Result Caching:**
  - AI results are cached in memory (up to 50 recent results) to avoid redundant API calls for repeated prompts.
  - Cache is keyed by prompt and model options.
- **Quality Checks:**
  - Generated images are checked for minimum resolution (e.g., 2048x2048).
  - Generated audio is checked for minimum file size/duration.
  - Errors are thrown if outputs do not meet quality standards.

**Best Practices:**
- Use batch APIs for efficiency when generating multiple assets.
- Select the appropriate model for your use case.
- If you get repeated results, clear the cache or change your prompt/options.
- Review generated assets for quality before publishing.

## Plugin System: Version Compatibility & Dependency Management

- **App Version Compatibility:**
  - Plugins can specify an `appVersion` field (e.g., `appVersion: ">=1.2.0"`) to declare which app versions they are compatible with.
  - The toolkit will block or warn about plugins that require an incompatible app version.
- **Dependency Versioning:**
  - Plugins can specify dependencies as an array of IDs or objects with version constraints:
    - Example: `dependencies: [ { id: 'otherPlugin', version: '^2.0.0' }, 'simpleDep' ]`
  - The toolkit enforces that required dependencies are present and match the specified version constraints.
- **Best Practices:**
  - Always specify your plugin's compatible app version and dependency versions for reliability.
  - Update your plugin's version and constraints when making breaking changes.
  - Users should check plugin compatibility before installing or updating plugins.

## Plugin System: Security, Validation & Audit Logging

- **Signature/Hash Validation:**
  - Plugins can specify a `signature` field (SHA-256 hash of the plugin file) for integrity verification.
  - The toolkit will warn if the signature is missing or does not match the file contents.
- **Permissions Declaration:**
  - Plugins can declare a `permissions` array (e.g., `permissions: ['file', 'network']`) to request access to sensitive features.
  - All requested permissions are logged for user review.
- **Audit Logging:**
  - All major plugin actions (registration, tool panel creation, event subscription/emission) are logged for auditability.
- **Best Practices:**
  - Always add a signature to your plugin before distribution. Use `sha256sum` or similar tools to generate the hash.
  - Declare only the permissions your plugin needs.
  - Users should review logs for suspicious plugin activity and avoid plugins with excessive or unnecessary permissions.

## Plugin Marketplace

- **Browse & Search:**
  - The toolkit can fetch and display a list of available plugins from the official plugin marketplace.
  - Users can view plugin details, ratings, and permissions before installing.
- **Install Plugins:**
  - Download and install plugins directly from the marketplace with one click.
  - All plugins are validated for version compatibility, signature, and permissions before installation.
- **Rate & Report:**
  - Users can rate plugins (1-5 stars) and report issues (abuse, malware, etc.) directly from the UI.
- **Upload Support:**
  - Plugin upload for authors is planned for a future release.
- **Best Practices:**
  - Only install plugins from trusted sources or the official marketplace.
  - Review plugin permissions and ratings before installing.
  - Report any suspicious or malicious plugins to help protect the community.

## Community Features: User Profile & Plugin Collections

- **User Profile:**
  - Access your profile and preferences from the sidebar.
  - Edit your username, email, and preferences (e.g., theme, notifications) in the profile modal.
  - Profile data is stored locally for privacy.
- **Plugin Collections:**
  - Organize plugins into collections (favorites, custom groups) for quick access.
  - Create, rename, and delete collections from the sidebar.
  - Add or remove plugins to/from collections via the plugin manager or collections modal.
  - Collections are stored locally and can be used to quickly enable/disable groups of plugins.

**Best Practices:**
- Use collections to group plugins by project, type, or personal favorites.
- Keep your profile up to date for personalized features in future releases.

## Data Management & Cleanup

The toolkit provides a dedicated **Data Management** section in the sidebar for advanced storage and maintenance tasks. These tools help keep your modding environment clean, efficient, and organized.

### Features

- **Clear Cache**
  - Instantly clears the in-memory asset preview cache.
  - Useful for freeing up memory or resolving preview glitches.

- **Remove Orphaned Files**
  - Scans asset directories and deletes files not tracked in the asset database.
  - Helps reclaim disk space and keep your asset folders tidy.

- **Analyze Storage**
  - Provides a detailed breakdown of storage usage by asset type (e.g., meshes, textures, audio).
  - Lists the largest files in your asset directories.
  - Results are displayed in a modal for easy review.

- **Optimize Storage**
  - Runs backend optimizations to reduce disk usage (e.g., deduplication, compression).
  - Currently a placeholder for future enhancements.

### How to Use

1. Open the application and locate the **Data Management** section in the left sidebar (look for the database icon).
2. Click any of the four buttons to perform the corresponding action.
3. User feedback is provided via toast notifications and, for storage analysis, a modal dialog.

### Accessibility & Error Handling

- All actions are accessible via keyboard and provide ARIA live region updates for screen readers.
- Modals and buttons are fully keyboard navigable.
- Any errors are shown as toast notifications and in the ARIA live region.

--- 