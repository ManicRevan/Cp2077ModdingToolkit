// Renderer process for Cyberpunk 2077 Modding Toolkit
// All Electron/Node access must go through window.electron (preload.js)

// Global state
const app = {
    projectLoaded: false,
    projectName: '',
    selectedNode: null,
    jsPlumb: null,
    sceneNodes: [],
    isDragging: false
};

// === Visual Scripting / Quest Node Editor Logic ===

// Quest Node Editor state
const questNodeEditor = {
    jsPlumb: null,
    nodes: [],
    connections: [],
    selectedNode: null,
    nodeIdCounter: 1
};

function setupQuestNodeEditor() {
    // Tab switching logic
    const mainTab = document.getElementById('mainWorkspaceTab');
    const vsTab = document.getElementById('visualScriptingTab');
    const mainCanvas = document.getElementById('sceneGraphCanvas');
    const questCanvas = document.getElementById('questNodeEditorCanvas');
    const nodeControls = document.getElementById('nodeEditorControls');

    mainTab.addEventListener('click', () => {
        mainTab.classList.add('active');
        vsTab.classList.remove('active');
        mainCanvas.style.display = '';
        questCanvas.style.display = 'none';
        nodeControls.style.display = 'none';
    });
    vsTab.addEventListener('click', () => {
        mainTab.classList.remove('active');
        vsTab.classList.add('active');
        mainCanvas.style.display = 'none';
        questCanvas.style.display = '';
        nodeControls.style.display = '';
        if (!questNodeEditor.jsPlumb) initQuestJsPlumb();
    });

    // Node editor controls
    document.getElementById('addQuestNode').addEventListener('click', showQuestNodeModal);
    document.getElementById('saveNodeGraph').addEventListener('click', saveQuestNodeGraph);
    document.getElementById('loadNodeGraph').addEventListener('click', loadQuestNodeGraph);
    document.getElementById('exportNodeGraph').addEventListener('click', exportQuestNodeGraph);
    document.getElementById('clearNodeGraph').addEventListener('click', clearQuestNodeGraph);

    // Add AI Generate button
    if (nodeControls && !document.getElementById('aiGenerateQuestGraph')) {
        const aiBtn = document.createElement('button');
        aiBtn.id = 'aiGenerateQuestGraph';
        aiBtn.className = 'btn btn-sm btn-outline-warning';
        aiBtn.innerHTML = '<i class="fas fa-robot"></i> AI Generate Quest Graph';
        aiBtn.setAttribute('aria-label', 'AI Generate Quest Graph');
        nodeControls.appendChild(aiBtn);
        aiBtn.addEventListener('click', showAIGenerateQuestModal);
    }
}

function initQuestJsPlumb() {
    questNodeEditor.jsPlumb = jsPlumb.getInstance({
        Endpoint: ["Dot", { radius: 3 }],
        Connector: ["Bezier", { curviness: 50 }],
        HoverPaintStyle: { stroke: "#ff00ff", strokeWidth: 2 },
        ConnectionOverlays: [
            ["Arrow", { location: 1, width: 10, length: 10 }],
            ["Label", { label: "", id: "connLabel", cssClass: "conn-label" }]
        ],
        DragOptions: { cursor: "pointer", zIndex: 2000 },
        Container: "questNodeEditorCanvas"
    });
    questNodeEditor.jsPlumb.bind("connection", function(info) {
        // Prompt for label
        setTimeout(() => {
            const label = prompt('Label this connection (e.g., on complete, on fail, on choice X):', '');
            if (label) {
                info.connection.getOverlay('connLabel').setLabel(label);
            }
            questNodeEditor.connections.push({
                source: info.sourceId,
                target: info.targetId,
                label: label || ''
            });
        }, 10);
        logToConsole(`Connected ${info.sourceId} to ${info.targetId} (Quest Node Editor)`);
    });
}

function showQuestNodeModal(editNode) {
    // Create and show a modal for node creation (reuse or create if not exists)
    let modal = document.getElementById('questNodeModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'questNodeModal';
        modal.tabIndex = -1;
        modal.setAttribute('aria-labelledby', 'questNodeModalLabel');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content bg-dark text-light">
                <div class="modal-header">
                    <h5 class="modal-title" id="questNodeModalLabel">${editNode ? 'Edit' : 'Create'} Quest Node</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div class="form-group mb-3">
                        <label for="questNodeType">Node Type</label>
                        <select class="form-select bg-dark text-light border-secondary" id="questNodeType">
                            <option value="start">Start</option>
                            <option value="end">End</option>
                            <option value="action">Action</option>
                            <option value="dialogue">Dialogue</option>
                            <option value="decision">Decision</option>
                            <option value="objective">Objective</option>
                            <option value="trigger">Trigger</option>
                            <option value="condition">Condition</option>
                            <option value="script">Script</option>
                            <option value="animation">Animation</option>
                            <option value="camera">Camera</option>
                            <option value="audio">Audio</option>
                            <option value="fx">Visual Effect</option>
                        </select>
                    </div>
                    <div class="form-group mb-3">
                        <label for="questNodeName">Node Name</label>
                        <input type="text" class="form-control bg-dark text-light border-secondary" id="questNodeName" placeholder="Enter name for this node">
                    </div>
                    <div class="form-group mb-3">
                        <label for="questNodeDesc">Description (optional)</label>
                        <textarea class="form-control bg-dark text-light border-secondary" id="questNodeDesc" rows="2"></textarea>
                    </div>
                    <div class="form-group mb-3">
                        <label for="questNodeProps">Properties <span id="questNodePropsTip" class="text-info small"></span></label>
                        <textarea class="form-control bg-dark text-light border-secondary" id="questNodeProps" rows="2" placeholder='{"objectiveText":"Find the relic"}'></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" id="confirmCreateQuestNode">${editNode ? 'Save' : 'Create'}</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }
    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    // Property template/tooltips by type
    const propTemplates = {
        start: { tip: 'No properties needed. This is the entry point.' },
        end: { tip: 'No properties needed. This is the quest end.' },
        action: { tip: 'e.g. {"actionType":"spawnEnemy","target":"npc_rogue"}' },
        dialogue: { tip: 'e.g. {"text":"What do you want?","choices":[{"text":"Nothing","next":"end"}]}' },
        decision: { tip: 'e.g. {"condition":"playerHasItem","item":"relic"}' },
        objective: { tip: 'e.g. {"objectiveText":"Find the relic","isOptional":false}' },
        trigger: { tip: 'e.g. {"triggerType":"enterArea","areaId":"warehouse_01"}' },
        condition: { tip: 'e.g. {"script":"player.level > 10"}' },
        script: { tip: 'e.g. {"script":"SetQuestFlag(\"met_rogue\")"}' },
        animation: { tip: 'e.g. {"anim":"npc_wave"}' },
        camera: { tip: 'e.g. {"cameraType":"cinematic","duration":3}' },
        audio: { tip: 'e.g. {"sound":"sfx_alarm"}' },
        fx: { tip: 'e.g. {"effect":"explosion","location":"player"}' }
    };
    const typeSelect = modal.querySelector('#questNodeType');
    const propsTip = modal.querySelector('#questNodePropsTip');
    function updatePropsTip() {
        const t = typeSelect.value;
        propsTip.textContent = propTemplates[t] ? propTemplates[t].tip : '';
        modal.querySelector('#questNodeProps').placeholder = propTemplates[t] && propTemplates[t].tip.includes('e.g.') ? propTemplates[t].tip.replace('e.g. ','') : '';
    }
    typeSelect.addEventListener('change', updatePropsTip);
    updatePropsTip();
    // If editing, prefill fields
    if (editNode) {
        typeSelect.value = editNode.type;
        modal.querySelector('#questNodeName').value = editNode.name;
        modal.querySelector('#questNodeDesc').value = editNode.desc;
        modal.querySelector('#questNodeProps').value = JSON.stringify(editNode.props || {}, null, 2);
    } else {
        modal.querySelector('#questNodeName').value = '';
        modal.querySelector('#questNodeDesc').value = '';
        modal.querySelector('#questNodeProps').value = '';
    }
    // Confirm handler
    modal.querySelector('#confirmCreateQuestNode').onclick = () => {
        const type = typeSelect.value;
        const name = modal.querySelector('#questNodeName').value;
        const desc = modal.querySelector('#questNodeDesc').value;
        let props = {};
        try {
            props = JSON.parse(modal.querySelector('#questNodeProps').value || '{}');
        } catch {
            showError('Invalid JSON in properties.');
            return;
        }
        if (!name) {
            showError('Node name is required.');
            return;
        }
        if (editNode) {
            editNode.type = type;
            editNode.name = name;
            editNode.desc = desc;
            editNode.props = props;
            const el = document.getElementById(editNode.id);
            if (el) {
                el.querySelector('.node-header').innerHTML = `${name} <span class="badge bg-secondary">${type}</span>`;
                el.querySelector('.node-content').textContent = desc || '';
            }
            logToConsole(`Edited quest node: ${name} (${type})`);
        } else {
            createQuestNode({ type, name, desc, props });
        }
        const bsModal = bootstrap.Modal.getInstance(modal);
        bsModal.hide();
    };
}

function createQuestNode({ type, name, desc, props }) {
    // Generate unique node ID
    const nodeId = `quest-node-${questNodeEditor.nodeIdCounter++}`;
    // Create node element
    const nodeElement = document.createElement('div');
    nodeElement.id = nodeId;
    nodeElement.className = `scene-node node-type-${type}`;
    nodeElement.style.borderColor = getNodeColor(type);
    nodeElement.style.backgroundColor = getNodeColor(type) + '22';
    nodeElement.innerHTML = `
        <div class="node-header"><i class="fas ${getNodeIcon(type)} me-1"></i> ${name} <span class="badge bg-secondary">${type}</span></div>
        <div class="node-content">${desc || ''}</div>
    `;
    // Set initial position
    const canvas = document.getElementById('questNodeEditorCanvas');
    const x = 50 + Math.floor(Math.random() * (canvas.offsetWidth - 200));
    const y = 50 + Math.floor(Math.random() * (canvas.offsetHeight - 200));
    nodeElement.style.left = `${x}px`;
    nodeElement.style.top = `${y}px`;
    nodeElement.setAttribute('tabindex', '0');
    nodeElement.setAttribute('aria-label', `${type} node: ${name}`);
    // Add to DOM
    canvas.appendChild(nodeElement);
    // Make draggable
    questNodeEditor.jsPlumb.draggable(nodeId, {
        grid: [10, 10],
        stop: function(event) {
            // Update node position in state
            const node = questNodeEditor.nodes.find(n => n.id === nodeId);
            if (node) {
                node.x = parseInt(event.pos[0]);
                node.y = parseInt(event.pos[1]);
            }
        }
    });
    // Add endpoints
    questNodeEditor.jsPlumb.addEndpoint(nodeId, {
        anchor: "Top",
        isTarget: true,
        maxConnections: -1,
        endpoint: "Dot",
        paintStyle: { fill: "#FFFFFF", radius: 5 }
    });
    questNodeEditor.jsPlumb.addEndpoint(nodeId, {
        anchor: "Bottom",
        isSource: true,
        maxConnections: -1,
        endpoint: "Dot",
        paintStyle: { fill: "#FFFFFF", radius: 5 },
        connector: ["Bezier"]
    });
    // Click to select/edit
    nodeElement.addEventListener('click', (e) => {
        e.stopPropagation();
        selectQuestNode(nodeId);
    });
    nodeElement.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        editQuestNode(nodeId);
    });
    // Tooltip
    nodeElement.title = `${type.charAt(0).toUpperCase() + type.slice(1)} node\n${desc || ''}`;
    // Add to state
    questNodeEditor.nodes.push({
        id: nodeId,
        type,
        name,
        desc,
        props,
        x,
        y
    });
    // Hide placeholder
    const placeholder = canvas.querySelector('.scene-graph-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    // Log
    logToConsole(`Created quest node: ${name} (${type})`);
    selectQuestNode(nodeId);
}

function selectQuestNode(nodeId) {
    // Deselect previous
    questNodeEditor.nodes.forEach(n => {
        const el = document.getElementById(n.id);
        if (el) el.classList.remove('node-selected');
    });
    // Select new
    const nodeElement = document.getElementById(nodeId);
    nodeElement.classList.add('node-selected');
    questNodeEditor.selectedNode = nodeId;
    // Log
    const node = questNodeEditor.nodes.find(n => n.id === nodeId);
    logToConsole(`Selected quest node: ${node.name}`);
}

function editQuestNode(nodeId) {
    const node = questNodeEditor.nodes.find(n => n.id === nodeId);
    if (!node) return;
    // Show modal pre-filled
    showQuestNodeModal(node);
}

function saveQuestNodeGraph() {
    // Save nodes and connections to file
    const data = {
        nodes: questNodeEditor.nodes,
        connections: questNodeEditor.connections
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quest-node-graph.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
    showToast('Quest node graph saved.', 'success');
}

function loadQuestNodeGraph() {
    // Load nodes and connections from file
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
        if (input.files.length > 0) {
            const file = input.files[0];
            const text = await file.text();
            try {
                const data = JSON.parse(text);
                clearQuestNodeGraph();
                // Restore nodes
                (data.nodes || []).forEach(n => createQuestNode(n));
                // Restore connections
                setTimeout(() => {
                    (data.connections || []).forEach(c => {
                        questNodeEditor.jsPlumb.connect({
                            source: c.source,
                            target: c.target
                        });
                        questNodeEditor.connections.push({ source: c.source, target: c.target, label: c.label || '' });
                    });
                }, 200);
                showToast('Quest node graph loaded.', 'success');
            } catch {
                showError('Failed to load quest node graph.');
            }
        }
        document.body.removeChild(input);
    });
    input.click();
}

async function exportQuestNodeGraph() {
    // Validate graph
    const validation = validateQuestGraph();
    if (!validation.valid) {
        showError('Quest graph invalid: ' + validation.error);
        return;
    }
    // Convert node graph to questData format
    const questData = convertNodeGraphToQuestData();
    // Send to backend for export
    try {
        showLoading();
        const result = await window.electron.invoke('modding:exportQuestFromNodeGraph', questData);
        hideLoading();
        if (result && result.success) {
            showToast('Quest exported to game-ready format!', 'success');
        } else {
            showError('Quest export failed: ' + (result && result.error ? result.error : 'Unknown error'));
        }
    } catch (err) {
        hideLoading();
        showError('Quest export failed: ' + (err.message || err));
    }
}

// Converts the current node graph to questData format for questBuilder.js
function convertNodeGraphToQuestData() {
    // This is a basic mapping. Advanced mapping can be added for more features.
    // Find Start node
    const startNode = questNodeEditor.nodes.find(n => n.type === 'start');
    // Use node names for quest id/title for now
    const questId = startNode ? (startNode.name || 'custom_quest').replace(/\s+/g, '_').toLowerCase() : 'custom_quest';
    const questTitle = startNode ? startNode.name : 'Custom Quest';
    // Map nodes to stages
    const stages = questNodeEditor.nodes.filter(n => n.type !== 'start' && n.type !== 'end').map(n => ({
        id: n.id,
        name: n.name,
        description: n.desc,
        objectives: [
            {
                id: n.id + '_obj',
                description: n.props && n.props.objectiveText ? n.props.objectiveText : n.desc || n.name,
                isOptional: n.props && n.props.isOptional || false,
                isInitiallyHidden: n.props && n.props.isInitiallyHidden || false,
                completionTriggers: n.props && n.props.completionTriggers || [],
                failureTriggers: n.props && n.props.failureTriggers || [],
                // Branching/nextPhase logic can be improved
                branch: undefined,
                nextPhase: undefined
            }
        ],
        events: n.props && n.props.events || [],
        branches: [],
        nextPhase: undefined,
        journalUpdate: n.props && n.props.journalUpdate || false
    }));
    // Map connections to nextPhase/branching
    questNodeEditor.connections.forEach(conn => {
        const from = stages.find(s => s.id === conn.source);
        const to = stages.find(s => s.id === conn.target);
        if (from && to) {
            // Use connection label for branching if present
            if (conn.label && conn.label.toLowerCase().includes('choice')) {
                from.branches = from.branches || [];
                from.branches.push({
                    id: conn.label,
                    condition: conn.label,
                    nextPhase: to.id
                });
            } else {
                from.nextPhase = to.id;
            }
        }
    });
    // Add End node as a stage if present
    const endNode = questNodeEditor.nodes.find(n => n.type === 'end');
    if (endNode) {
        stages.push({
            id: endNode.id,
            name: endNode.name,
            description: endNode.desc,
            objectives: [{
                id: endNode.id + '_obj',
                description: endNode.desc || endNode.name
            }],
            events: [],
            branches: [],
            nextPhase: null,
            journalUpdate: false
        });
    }
    // Compose questData
    return {
        id: questId,
        title: questTitle,
        description: startNode ? startNode.desc : '',
        stages: stages
    };
}

function clearQuestNodeGraph() {
    // Remove all nodes and connections
    const canvas = document.getElementById('questNodeEditorCanvas');
    questNodeEditor.nodes.forEach(n => {
        const el = document.getElementById(n.id);
        if (el) canvas.removeChild(el);
    });
    if (questNodeEditor.jsPlumb) questNodeEditor.jsPlumb.deleteEveryConnection();
    questNodeEditor.nodes = [];
    questNodeEditor.connections = [];
    questNodeEditor.selectedNode = null;
    // Show placeholder
    const placeholder = canvas.querySelector('.scene-graph-placeholder');
    if (placeholder) placeholder.style.display = '';
    showToast('Quest node graph cleared.', 'info');
}

// Initialize quest node editor after DOMContentLoaded

document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    setupQuestNodeEditor();
    // ... existing code ...
    document.getElementById('exportNodeGraph').addEventListener('click', exportQuestNodeGraph);
    // ... existing code ...
    setupDragToCreateConnections();
    setupMinimap();
    setupUndoRedo();
    // ... existing code ...
    setupEventListeners();
    // Mesh LOD generation controls
    let selectedMeshFile = null;
    let selectedMeshFiles = [];
    document.getElementById('generateMeshLOD').addEventListener('click', () => {
        // Prompt user to select a mesh file
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.mesh,.obj,.fbx,.glb';
        input.onchange = (e) => {
            if (e.target.files.length > 0) {
                selectedMeshFile = e.target.files[0].path;
                showLODSettingsModal('single');
            }
        };
        input.click();
    });
    document.getElementById('batchGenerateMeshLOD').addEventListener('click', () => {
        // Prompt user to select multiple mesh files
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.mesh,.obj,.fbx,.glb';
        input.multiple = true;
        input.onchange = (e) => {
            if (e.target.files.length > 0) {
                selectedMeshFiles = Array.from(e.target.files).map(f => f.path);
                showLODSettingsModal('batch');
            }
        };
        input.click();
    });
    function showLODSettingsModal(mode) {
        document.getElementById('lodRatiosInput').value = '1.0,0.5,0.25';
        document.getElementById('lodOutputDirInput').value = '';
        document.getElementById('lodSettingsModal').setAttribute('data-mode', mode);
        const modal = new bootstrap.Modal(document.getElementById('lodSettingsModal'));
        modal.show();
    }
    document.getElementById('confirmGenerateLOD').addEventListener('click', async () => {
        const ratiosStr = document.getElementById('lodRatiosInput').value;
        const outputDir = document.getElementById('lodOutputDirInput').value;
        const ratios = ratiosStr.split(',').map(r => parseFloat(r.trim())).filter(r => !isNaN(r) && r > 0 && r <= 1);
        if (ratios.length === 0) {
            showError('Please enter valid LOD ratios (e.g. 1.0,0.5,0.25)');
            return;
        }
        const mode = document.getElementById('lodSettingsModal').getAttribute('data-mode');
        const modal = bootstrap.Modal.getInstance(document.getElementById('lodSettingsModal'));
        modal.hide();
        showLoading();
        setProgress(10);
        try {
            let result;
            if (mode === 'single' && selectedMeshFile) {
                logToConsole('Generating LODs for mesh: ' + selectedMeshFile);
                result = await window.electron.invoke('modding:generateMeshLODs', selectedMeshFile, outputDir, ratios);
            } else if (mode === 'batch' && selectedMeshFiles.length > 0) {
                logToConsole('Batch generating LODs for meshes: ' + selectedMeshFiles.join(', '));
                result = await window.electron.invoke('modding:batchGenerateMeshLODs', selectedMeshFiles, outputDir, ratios);
            } else {
                showError('No mesh file(s) selected.');
                return;
            }
            setProgress(100);
            if (result) {
                showToast('LOD generation complete!', 'success');
            } else {
                showError('LOD generation failed.');
            }
        } catch (err) {
            showError('LOD generation error: ' + (err.message || err));
        } finally {
            hideLoading();
            setProgress(null);
            selectedMeshFile = null;
            selectedMeshFiles = [];
        }
    });
    // ... existing code ...
});
// ... existing code ...

// Initialize the application
function initializeApp() {
    // Initialize Bootstrap components
    initializeTooltips();
    
    // Set initial status
    updateStatus('Ready');
}

// Set up all event listeners
function setupEventListeners() {
    // Project management
    document.getElementById('saveProject').addEventListener('click', () => {
        if (window.electron && window.electron.project && window.electron.project.save) {
            window.electron.project.save({ name: app.projectName || null });
        }
        logToConsole('Saving project...');
    });
    
    document.getElementById('loadProject').addEventListener('click', () => {
        if (window.electron && window.electron.project && window.electron.project.load) {
            window.electron.project.load();
        }
        logToConsole('Opening project browser...');
    });
    
    document.getElementById('exportMod').addEventListener('click', () => {
        if (!app.projectLoaded) {
            logToConsole('No project loaded. Please create or load a project first.', 'warning');
            return;
        }
        if (window.electron && window.electron.project && window.electron.project.exportMod) {
            window.electron.project.exportMod({ name: app.projectName });
        }
        logToConsole('Preparing to export mod...');
    });

    // Asset type buttons
    setupAssetTypeListeners('mesh');
    setupAssetTypeListeners('texture');
    setupAssetTypeListeners('audio');
    setupAssetTypeListeners('quest');
    setupAssetTypeListeners('scene');
    setupAssetTypeListeners('npc');
    
    // AI generation
    document.getElementById('generateVoice').addEventListener('click', handleGenerateVoice);
    document.getElementById('generateImage').addEventListener('click', handleGenerateImage);
    
    // Scene graph controls
    document.getElementById('addNode').addEventListener('click', showCreateNodeModal);
    document.getElementById('deleteNode').addEventListener('click', deleteSelectedNode);
    document.getElementById('connectNodes').addEventListener('click', enableConnectionMode);
    document.getElementById('confirmCreateNode').addEventListener('click', createNewNode);
    
    // Preview controls
    document.getElementById('playPreview').addEventListener('click', () => {
        if (window.electron && window.electron.preview && window.electron.preview.play) {
            window.electron.preview.play();
        }
        logToConsole('Playing scene preview');
    });
    
    document.getElementById('pausePreview').addEventListener('click', () => {
        if (window.electron && window.electron.preview && window.electron.preview.pause) {
            window.electron.preview.pause();
        }
        logToConsole('Paused scene preview');
    });
    
    document.getElementById('stopPreview').addEventListener('click', () => {
        if (window.electron && window.electron.preview && window.electron.preview.stop) {
            window.electron.preview.stop();
        }
        logToConsole('Stopped scene preview');
    });
    
    // Console controls
    document.getElementById('clearConsole').addEventListener('click', clearConsole);
    document.getElementById('toggleConsole').addEventListener('click', toggleConsole);

    // Theme toggle logic
    document.getElementById('themeToggle').addEventListener('click', () => {
        const current = localStorage.getItem('theme') || 'dark';
        setTheme(current === 'dark' ? 'light' : 'dark');
    });

    // Loading spinner overlay
    document.getElementById('loadingOverlay').classList.add('d-none');
    document.getElementById('exportLog').addEventListener('click', exportLog);

    // Settings modal logic
    document.getElementById('settingsModal').addEventListener('show.bs.modal', showSettingsModal);
    document.getElementById('saveSettings').addEventListener('click', saveSettings);

    // Inline validation for node creation
    const nodeNameInput = document.getElementById('nodeName');
    if (nodeNameInput) {
        nodeNameInput.addEventListener('input', function() {
            if (this.value) {
                this.classList.remove('is-invalid');
            }
        });
    }

    // === Advanced AI Features Event Listeners and Stubs ===

    // Voice AI
    document.getElementById('voiceScriptFile').addEventListener('change', onVoiceScriptFileChange);
    document.getElementById('voiceCloneFile').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            showToast('Voice sample selected: ' + e.target.files[0].name, 'info');
        }
    });
    document.getElementById('generateVoiceAdvanced').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = {
                apiKey: document.getElementById('voiceApiKey').value,
                textBatch: document.getElementById('voiceTextBatch').value,
                voiceCloneFile: document.getElementById('voiceCloneFile').files[0],
                emotion: document.getElementById('voiceEmotionSlider').value,
                phoneme: document.getElementById('voicePhoneme').value,
                noise: document.getElementById('voiceNoise').value
            };
            logToConsole('AI: Voice Cloning...', 'info');
            const result = await window.electron.ai.generateVoiceAdvanced(opts);
            setProgress(100);
            if (result.success && result.files) {
                showVoiceResultModal(result.files);
            } else {
                showError(result.message || 'Voice generation failed');
            }
        } catch (err) {
            showError('Voice generation failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });

    // Image AI
    document.getElementById('imagePromptFile').addEventListener('change', onImagePromptFileChange);
    document.getElementById('imageUpload').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            showToast('Image selected for inpainting: ' + e.target.files[0].name, 'info');
        }
    });
    document.getElementById('generateImageAdvanced').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = {
                apiKey: document.getElementById('imageApiKey').value,
                promptBatch: document.getElementById('imagePromptBatch').value,
                imageUpload: document.getElementById('imageUpload').files[0],
                style: document.getElementById('imageStyle').value,
                template: document.getElementById('promptTemplate').value,
                negativePrompts: document.getElementById('negativePromptLibrary').value
            };
            logToConsole('Advanced Image AI: Generating image...', 'info');
            const result = await window.electron.ai.generateImageAdvanced(opts);
            setProgress(100);
            if (result.success && result.files) {
                showImageResultModal(result.files);
            } else {
                showError(result.message || 'Image generation failed');
            }
        } catch (err) {
            showError('Advanced image generation failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });

    // NPC/Quest/Dialogue AI
    document.getElementById('generateNPCProfile').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = { prompt: document.getElementById('npcPrompt').value };
            logToConsole('AI: generateNPCProfile...', 'info');
            const result = await window.electron.ai.generateNPCProfile(opts);
            setProgress(100);
            if (result.success && result.npc) {
                showNPCResultModal(result.npc);
            } else {
                showError(result.message || 'NPC profile generation failed');
            }
        } catch (err) {
            showError('generateNPCProfile failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });
    document.getElementById('generateQuest').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = { prompt: document.getElementById('questPrompt').value };
            logToConsole('AI: generateQuest...', 'info');
            const result = await window.electron.ai.generateQuest(opts);
            setProgress(100);
            if (result.success && result.quest) {
                showQuestResultModal(result.quest);
            } else {
                showError(result.message || 'Quest generation failed');
            }
        } catch (err) {
            showError('generateQuest failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });
    document.getElementById('expandDialogue').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = { prompt: document.getElementById('dialoguePrompt').value };
            logToConsole('AI: expandDialogue...', 'info');
            const result = await window.electron.ai.expandDialogue(opts);
            setProgress(100);
            if (result.success && result.dialogue) {
                showDialogueResultModal(result.dialogue);
            } else {
                showError(result.message || 'Dialogue expansion failed');
            }
        } catch (err) {
            showError('expandDialogue failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });
    document.getElementById('translateDialogue').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = {
                prompt: document.getElementById('localizationPrompt').value,
                language: document.getElementById('localizationLanguage').value
            };
            logToConsole('AI: translateDialogue...', 'info');
            const result = await window.electron.ai.translateDialogue(opts);
            setProgress(100);
            if (result.success && result.translation) {
                showTranslationResultModal(result.translation);
            } else {
                showError(result.message || 'Dialogue translation failed');
            }
        } catch (err) {
            showError('translateDialogue failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });

    // Audio AI
    document.getElementById('generateSoundEffect').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = { prompt: document.getElementById('soundEffectPrompt').value };
            logToConsole('Audio AI: generateSoundEffect...', 'info');
            const result = await window.electron.ai.generateSoundEffect(opts);
            setProgress(100);
            if (result.success && result.file) {
                showAudioResultModal(result.file, 'Sound Effect');
            } else {
                showError(result.message || 'Sound effect generation failed');
            }
        } catch (err) {
            showError('generateSoundEffect failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });
    document.getElementById('generateMusic').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = { prompt: document.getElementById('musicPrompt').value };
            logToConsole('Audio AI: generateMusic...', 'info');
            const result = await window.electron.ai.generateMusic(opts);
            setProgress(100);
            if (result.success && result.file) {
                showAudioResultModal(result.file, 'Music');
            } else {
                showError(result.message || 'Music generation failed');
            }
        } catch (err) {
            showError('generateMusic failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });

    // Automation & Integration
    document.getElementById('autoTagAsset').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = {
                file: document.getElementById('autoTagFile').files[0],
                prompt: document.getElementById('autoTagPrompt').value
            };
            logToConsole('Automation: autoTagAsset...', 'info');
            const result = await window.electron.ai.autoTagAsset(opts);
            setProgress(100);
            if (result.success && result.tags) {
                showTagsResultModal(result.tags);
            } else {
                showError(result.message || 'Auto-tagging failed');
            }
        } catch (err) {
            showError('autoTagAsset failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });
    document.getElementById('runSmartSearch').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = { query: document.getElementById('smartSearch').value };
            logToConsole('Automation: runSmartSearch...', 'info');
            const result = await window.electron.ai.runSmartSearch(opts);
            setProgress(100);
            if (result.success && result.results) {
                showSmartSearchResultModal(result.results);
            } else {
                showError(result.message || 'Smart search failed');
            }
        } catch (err) {
            showError('runSmartSearch failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });
    document.getElementById('upscaleAsset').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = { file: document.getElementById('upscaleFile').files[0] };
            logToConsole('Automation: upscaleAsset...', 'info');
            const result = await window.electron.ai.upscaleAsset(opts);
            setProgress(100);
            if (result.success && result.file) {
                showImageResultModal({ pngPath: result.file });
            } else {
                showError(result.message || 'Upscaling failed');
            }
        } catch (err) {
            showError('upscaleAsset failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });
    document.getElementById('autoTagFile').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            showToast('Asset selected for auto-tagging: ' + e.target.files[0].name, 'info');
        }
    });
    document.getElementById('upscaleFile').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            showToast('Image selected for upscaling: ' + e.target.files[0].name, 'info');
        }
    });

    // AI Assistant/Chatbot
    document.getElementById('askAssistant').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = {
                apiKey: document.getElementById('assistantApiKey').value,
                input: document.getElementById('assistantInput').value
            };
            logToConsole('AI Assistant: Asking question...', 'info');
            const result = await window.electron.ai.askAssistant(opts);
            setProgress(100);
            if (result.success && result.response) {
                showAssistantResultModal(result.response);
            } else {
                showError(result.message || 'AI assistant failed');
            }
        } catch (err) {
            showError('AI assistant failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });

    // Ensure consistent loading/progress indication
    // (Already handled: showLoading/hideLoading/setProgress in all modding event listeners)

    // Ensure accessibility improvements for drop zones and file inputs
    // (Already added ARIA labels above)

    // Visually clarify drop zones
    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.addEventListener('focus', () => zone.classList.add('active'));
        zone.addEventListener('blur', () => zone.classList.remove('active'));
        zone.setAttribute('tabindex', '0');
    });
}

// Setup listeners for each asset type
function setupAssetTypeListeners(type) {
    document.getElementById(`import${type.charAt(0).toUpperCase() + type.slice(1)}`).addEventListener('click', () => {
        document.getElementById(`${type}FileInput`).click();
    });
    
    document.getElementById(`${type}FileInput`).addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            logToConsole(`Importing ${files.length} ${type} file(s): ${files.map(f => f.name).join(', ')}`);
            
            // Send files to main process via preload
            if (window.electron && window.electron.fs && window.electron.fs.importFiles) {
                window.electron.fs.importFiles({
                    type: type,
                    paths: files.map(f => f.path)
                });
            }
        }
    });
    
    if (document.getElementById(`create${type.charAt(0).toUpperCase() + type.slice(1)}`)) {
        document.getElementById(`create${type.charAt(0).toUpperCase() + type.slice(1)}`).addEventListener('click', () => {
            if (window.electron && window.electron.fs && window.electron.fs[`create${type.charAt(0).toUpperCase() + type.slice(1)}`]) {
                window.electron.fs[`create${type.charAt(0).toUpperCase() + type.slice(1)}`]();
            }
            logToConsole(`Creating new ${type}...`);
        });
    }
}

// Set up drag and drop functionality
function setupDragAndDrop() {
    const dropZones = document.querySelectorAll('.drop-zone');
    
    dropZones.forEach(zone => {
        // Get the asset type from zone id
        const type = zone.id.replace('DropZone', '').toLowerCase();
        
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('active');
        });
        
        zone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('active');
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('active');
            
            if (e.dataTransfer.files.length > 0) {
                const files = Array.from(e.dataTransfer.files);
                logToConsole(`Dropped ${files.length} ${type} file(s): ${files.map(f => f.name).join(', ')}`);
                
                // Send files to main process via preload
                if (window.electron && window.electron.fs && window.electron.fs.importFiles) {
                    window.electron.fs.importFiles({
                        type: type,
                        paths: files.map(f => f.path)
                    });
                }
            }
        });
        
        zone.addEventListener('click', () => {
            // Trigger file input when clicking on drop zone
            document.getElementById(`${type}FileInput`).click();
        });
    });
}

// Initialize the scene graph editor
function initSceneGraph() {
    // Initialize jsPlumb (for node connections)
    app.jsPlumb = jsPlumb.getInstance({
        Endpoint: ["Dot", { radius: 3 }],
        Connector: ["Bezier", { curviness: 50 }],
        HoverPaintStyle: { stroke: "#00ffff", strokeWidth: 2 },
        ConnectionOverlays: [
            ["Arrow", { location: 1, width: 10, length: 10 }]
        ],
        DragOptions: { cursor: "pointer", zIndex: 2000 },
        Container: "sceneGraphCanvas"
    });
    
    app.jsPlumb.bind("connection", function(info) {
        logToConsole(`Connected ${info.sourceId} to ${info.targetId}`);
        
        // Send connection info to main process
        if (window.electron && window.electron.scene && window.electron.scene.connectNodes) {
            window.electron.scene.connectNodes({
                sourceId: info.sourceId,
                targetId: info.targetId
            });
        }
    });
}

// Show the create node modal
function showCreateNodeModal() {
    // Reset form fields
    document.getElementById('nodeName').value = '';
    document.getElementById('nodeDesc').value = '';
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('createNodeModal'));
    modal.show();
}

// Create a new node in the scene graph
function createNewNode() {
    const nodeType = document.getElementById('nodeType').value;
    const nodeName = document.getElementById('nodeName').value;
    const nodeDesc = document.getElementById('nodeDesc').value;
    
    if (!nodeName) {
        logToConsole('Node name is required', 'error');
        return;
    }
    
    // Generate a unique node ID
    const nodeId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Create node element
    const nodeElement = document.createElement('div');
    nodeElement.id = nodeId;
    nodeElement.className = `scene-node node-type-${nodeType}`;
    nodeElement.innerHTML = `
        <div class="node-header">${nodeName}</div>
        <div class="node-content">${nodeDesc || ''}</div>
    `;
    
    // Set initial position in the canvas
    const canvas = document.getElementById('sceneGraphCanvas');
    const x = 50 + Math.floor(Math.random() * (canvas.offsetWidth - 200));
    const y = 50 + Math.floor(Math.random() * (canvas.offsetHeight - 200));
    
    nodeElement.style.left = `${x}px`;
    nodeElement.style.top = `${y}px`;
    
    // Add to DOM
    canvas.appendChild(nodeElement);
    
    // Make it draggable with jsPlumb
    app.jsPlumb.draggable(nodeId, {
        grid: [10, 10],
        stop: function(event) {
            // Update node position in backend when drag ends
            const position = {
                id: nodeId,
                left: parseInt(event.pos[0]),
                top: parseInt(event.pos[1])
            };
            if (window.electron && window.electron.scene && window.electron.scene.updateNodePosition) {
                window.electron.scene.updateNodePosition(position);
            }
        }
    });
    
    // Add endpoints for connections
    app.jsPlumb.addEndpoint(nodeId, {
        anchor: "Top",
        isTarget: true,
        maxConnections: -1,
        endpoint: "Dot",
        paintStyle: { fill: "#FFFFFF", radius: 5 }
    });
    
    app.jsPlumb.addEndpoint(nodeId, {
        anchor: "Bottom",
        isSource: true,
        maxConnections: -1,
        endpoint: "Dot",
        paintStyle: { fill: "#FFFFFF", radius: 5 },
        connector: ["Bezier"]
    });
    
    // Add click handler to select node
    nodeElement.addEventListener('click', (e) => {
        e.stopPropagation();
        selectNode(nodeId);
    });
    
    // Add the node to our state
    app.sceneNodes.push({
        id: nodeId,
        type: nodeType,
        name: nodeName,
        description: nodeDesc,
        x: x,
        y: y
    });
    
    // Send node data to main process
    if (window.electron && window.electron.scene && window.electron.scene.addNode) {
        window.electron.scene.addNode({
            id: nodeId,
            type: nodeType,
            name: nodeName,
            description: nodeDesc,
            x: x,
            y: y
        });
    }
    
    // Hide the placeholder if it's visible
    const placeholder = document.querySelector('.scene-graph-placeholder');
    if (placeholder) {
        placeholder.style.display = 'none';
    }
    
    // Close the modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('createNodeModal'));
    modal.hide();
    
    // Log
    logToConsole(`Created new ${nodeType} node: ${nodeName}`);
    
    // Select the new node
    selectNode(nodeId);
}

// Select a node in the scene graph
function selectNode(nodeId) {
    // Deselect previously selected node
    if (app.selectedNode) {
        document.getElementById(app.selectedNode).classList.remove('node-selected');
    }
    
    // Select new node
    const nodeElement = document.getElementById(nodeId);
    nodeElement.classList.add('node-selected');
    app.selectedNode = nodeId;
    
    // Get node data
    const nodeData = app.sceneNodes.find(n => n.id === nodeId);
    
    // Update selection in main process
    ipcRenderer.send('scene-select-node', { id: nodeId });
    
    logToConsole(`Selected node: ${nodeData.name}`);
}

// Delete the selected node
function deleteSelectedNode() {
    if (!app.selectedNode) {
        logToConsole('No node selected for deletion', 'warning');
        return;
    }
    
    // Get node data before deletion
    const nodeData = app.sceneNodes.find(n => n.id === app.selectedNode);
    
    // Remove all connections
    app.jsPlumb.deleteConnectionsForElement(app.selectedNode);
    
    // Remove the node element
    document.getElementById(app.selectedNode).remove();
    
    // Remove from state
    app.sceneNodes = app.sceneNodes.filter(n => n.id !== app.selectedNode);
    
    // Send delete command to main process
    ipcRenderer.send('scene-delete-node', { id: app.selectedNode });
    
    // Clear selection
    app.selectedNode = null;
    
    // Show placeholder if no nodes left
    if (app.sceneNodes.length === 0) {
        const placeholder = document.querySelector('.scene-graph-placeholder');
        if (placeholder) {
            placeholder.style.display = 'block';
        }
    }
    
    logToConsole(`Deleted node: ${nodeData.name}`);
}

// Enable node connection mode
function enableConnectionMode() {
    logToConsole('Connection mode active. Drag from one node to another to create connections.');
    updateStatus('Connection Mode: Drag from output (bottom) to input (top) of another node');
}

// Handle voice generation with ElevenLabs
async function handleGenerateVoice() {
    try {
        showLoading();
        setProgress(10);
        const apiKey = document.getElementById('elevenLabsApiKey').value;
        const text = document.getElementById('voiceText').value;
        const voice = document.getElementById('voiceSelect').value;
        if (!apiKey) {
            logToConsole('ElevenLabs API key is required', 'error');
            hideLoading(); setProgress(null); return;
        }
        if (!text) {
            logToConsole('Text is required to generate voice', 'warning');
            hideLoading(); setProgress(null); return;
        }
        logToConsole('Generating voice with ElevenLabs...');
        updateStatus('Generating voice...');
        setProgress(40);
        // Simulate async work
        await new Promise(r => setTimeout(r, 1000));
        setProgress(80);
        // Replace with actual IPC call
        ipcRenderer.send('generate-voice', { apiKey, text, voice });
        setProgress(100);
        setTimeout(() => setProgress(null), 500);
    } catch (err) {
        showError('Failed to generate voice: ' + (err.message || err));
        setProgress(null);
    } finally {
        hideLoading();
    }
}

// Handle image generation with Stable Diffusion
async function handleGenerateImage() {
    try {
        showLoading();
        setProgress(10);
        const apiKey = document.getElementById('stableDiffusionApiKey').value;
        const prompt = document.getElementById('imagePrompt').value;
        const negativePrompt = document.getElementById('negativePrompt').value;
        const width = parseInt(document.getElementById('imageWidth').value) || 512;
        const height = parseInt(document.getElementById('imageHeight').value) || 512;
        if (!apiKey) {
            logToConsole('Stable Diffusion API key is required', 'error');
            hideLoading(); setProgress(null); return;
        }
        if (!prompt) {
            logToConsole('Image prompt is required', 'warning');
            hideLoading(); setProgress(null); return;
        }
        logToConsole('Generating image with Stable Diffusion...');
        updateStatus('Generating image...');
        setProgress(40);
        // Simulate async work
        await new Promise(r => setTimeout(r, 1000));
        setProgress(80);
        // Replace with actual IPC call
        ipcRenderer.send('generate-image', { apiKey, prompt, negativePrompt, width, height });
        setProgress(100);
        setTimeout(() => setProgress(null), 500);
    } catch (err) {
        showError('Failed to generate image: ' + (err.message || err));
        setProgress(null);
    } finally {
        hideLoading();
    }
}

// Initialize Bootstrap tooltips
function initializeTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

// Log message to console area
function logToConsole(message, type = 'info') {
    const consoleLog = document.getElementById('consoleLog');
    const logItem = document.createElement('div');
    logItem.className = `log-message log-${type}`;
    
    // Add timestamp
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    logItem.textContent = `[${timestamp}] ${message}`;
    consoleLog.appendChild(logItem);
    
    // Scroll to bottom
    consoleLog.scrollTop = consoleLog.scrollHeight;

    if (type === 'error' || type === 'warning') {
        showToast(message, type);
    }
}

// Clear console log
function clearConsole() {
    document.getElementById('consoleLog').innerHTML = '';
    logToConsole('Console cleared');
}

// Toggle console visibility
function toggleConsole() {
    const consoleContainer = document.querySelector('.console-container');
    const button = document.getElementById('toggleConsole');
    
    if (consoleContainer.style.height === '25px') {
        consoleContainer.style.height = 'var(--console-height)';
        button.innerHTML = '<i class="fas fa-chevron-up"></i>';
    } else {
        consoleContainer.style.height = '25px';
        button.innerHTML = '<i class="fas fa-chevron-down"></i>';
    }
}

// Update status message
function updateStatus(message) {
    document.getElementById('statusMessage').textContent = message;
}

// Toast notification function
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toastId = `toast-${Date.now()}`;
    let bgClass = 'bg-info';
    if (type === 'success') bgClass = 'bg-success';
    if (type === 'error') bgClass = 'bg-danger';
    if (type === 'warning') bgClass = 'bg-warning text-dark';
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white ${bgClass}`;
    toast.id = toastId;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    toastContainer.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { delay: 5000 });
    bsToast.show();
    toast.addEventListener('hidden.bs.toast', () => toast.remove());
}

// Error modal function
function showError(message) {
    document.getElementById('errorModalBody').textContent = message;
    const errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
    errorModal.show();
    logToConsole(message, 'error');
    showToast(message, 'error');
}

// Theme toggle logic
function setTheme(theme) {
    if (theme === 'light') {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
        document.getElementById('themeToggle').innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.body.classList.remove('light-mode');
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
        document.getElementById('themeToggle').innerHTML = '<i class="fas fa-moon"></i>';
    }
}

// Loading spinner overlay
function showLoading() {
    document.getElementById('loadingOverlay').classList.remove('d-none');
}
function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('d-none');
}

// Progress bar
function setProgress(percent) {
    const progressBar = document.getElementById('progressBar');
    const bar = progressBar.querySelector('.progress-bar');
    if (percent === null) {
        progressBar.classList.add('d-none');
        bar.style.width = '0%';
    } else {
        progressBar.classList.remove('d-none');
        bar.style.width = percent + '%';
    }
}

// Export log to file
function exportLog() {
    const log = Array.from(document.querySelectorAll('.log-message')).map(e => e.textContent).join('\n');
    const blob = new Blob([log], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cp77-modding-toolkit-log.txt';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// Settings modal logic
function showSettingsModal() {
    // Load current settings (example: theme, API key, output dir)
    document.getElementById('settingTheme').value = localStorage.getItem('theme') || 'dark';
    document.getElementById('settingApiKey').value = localStorage.getItem('defaultApiKey') || '';
    document.getElementById('settingOutputDir').value = localStorage.getItem('defaultOutputDir') || '';
    const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
    modal.show();
    loadDependenciesUI();
}

function saveSettings() {
    const form = document.getElementById('settingsForm');
    let valid = true;
    // Validate API key
    const apiKey = document.getElementById('settingApiKey');
    if (!apiKey.value) {
        apiKey.classList.add('is-invalid');
        valid = false;
    } else {
        apiKey.classList.remove('is-invalid');
    }
    // Validate output dir
    const outputDir = document.getElementById('settingOutputDir');
    if (!outputDir.value) {
        outputDir.classList.add('is-invalid');
        valid = false;
    } else {
        outputDir.classList.remove('is-invalid');
    }
    if (!valid) return;
    // Save settings
    localStorage.setItem('theme', document.getElementById('settingTheme').value);
    localStorage.setItem('defaultApiKey', apiKey.value);
    localStorage.setItem('defaultOutputDir', outputDir.value);
    setTheme(document.getElementById('settingTheme').value);
    const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
    modal.hide();
    showToast('Settings saved', 'success');
    // Save manifest with updated dependencies
    window.electron.moddingDeps.writeManifest(currentModDir, currentManifest);
}

// Show settings modal on some trigger (e.g., F10 key)
document.addEventListener('keydown', (e) => {
    if (e.key === 'F10') {
        showSettingsModal();
    }
});

// ----- IPC Event Handlers -----

// Listen for project loaded event
if (window.electron && window.electron.project) {
    window.electron.project.onProjectLoaded = (data) => {
        app.projectLoaded = true;
        app.projectName = data.name;
        document.getElementById('projectStatus').textContent = `Project: ${data.name}`;
        logToConsole(`Project loaded: ${data.name}`, 'success');
        updateStatus('Project loaded successfully');
    };
}

// Listen for voice generation result
if (window.electron && window.electron.ai) {
    window.electron.ai.onVoiceGenerated = (data) => {
        logToConsole(`Voice generated successfully: ${data.filename}`, 'success');
        updateStatus('Voice generation complete');
    };
}

// Listen for image generation result
if (window.electron && window.electron.ai) {
    window.electron.ai.onImageGenerated = (data) => {
        logToConsole(`Image generated successfully: ${data.filename}`, 'success');
        updateStatus('Image generation complete');
    };
}

// Listen for file import status
if (window.electron && window.electron.fs) {
    window.electron.fs.onFilesImported = (data) => {
        logToConsole(`Imported ${data.count} ${data.type} files successfully`, 'success');
        updateStatus('Files imported successfully');
    };
}

// Listen for error messages
if (window.electron && window.electron.app) {
    window.electron.app.onError = (data) => {
        logToConsole(`Error: ${data.message}`, 'error');
        updateStatus('Error occurred');
    };
}

// Listen for memory updates
if (window.electron && window.electron.app) {
    window.electron.app.onMemoryUsage = (data) => {
        document.getElementById('memoryUsage').textContent = `Memory: ${data.memory} MB`;
    };
}

// Helper functions for file/folder selection
async function selectFile(title, accept) {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        if (accept) input.accept = accept;
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', () => {
            resolve(input.files[0]?.path || null);
            document.body.removeChild(input);
        });
        input.click();
    });
}

async function selectDirectory(title) {
    return new Promise(resolve => {
        if (window.electron && window.electron.dialog && window.electron.dialog.selectDirectory) {
            window.electron.dialog.selectDirectory(title).then(resolve);
        } else {
            // Fallback: use file input with directory
            const input = document.createElement('input');
            input.type = 'file';
            input.webkitdirectory = true;
            input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', () => {
                const files = Array.from(input.files);
                if (files.length > 0) {
                    const dir = files[0].path.substring(0, files[0].path.lastIndexOf('/'));
                    resolve(dir);
                } else {
                    resolve(null);
                }
                document.body.removeChild(input);
            });
            input.click();
        }
    });
}

async function selectSaveFile(title, defaultExt) {
    // This would ideally use Electron's dialog, but fallback to file input for now
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        if (defaultExt) input.accept = defaultExt;
        input.nwsaveas = true;
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', () => {
            resolve(input.files[0]?.path || null);
            document.body.removeChild(input);
        });
        input.click();
    });
}

async function selectMultipleFiles(title, accept) {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        if (accept && Array.isArray(accept)) {
            input.accept = accept.join(',');
        }
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', () => {
            resolve(Array.from(input.files));
            document.body.removeChild(input);
        });
        input.click();
    });
}

async function refreshPluginList() {
    try {
        const plugins = await window.electron.invoke('modding:listPlugins');
        const pluginList = document.getElementById('pluginList');
        pluginList.innerHTML = '';
        if (!plugins || plugins.length === 0) {
            pluginList.innerHTML = '<div class="text-muted">No plugins installed.</div>';
            return;
        }
        plugins.forEach(plugin => {
            const item = document.createElement('div');
            item.className = 'plugin-item d-flex align-items-center justify-content-between mb-2 p-2 bg-secondary rounded';
            item.innerHTML = `
                <span class="plugin-name" style="cursor:pointer;" data-plugin-id="${plugin.id}">${plugin.name}</span>
                <div>
                    <button class="btn btn-sm btn-outline-info me-1" data-action="details" data-plugin-id="${plugin.id}"><i class="fas fa-info-circle"></i></button>
                    <button class="btn btn-sm btn-outline-warning me-1" data-action="update" data-plugin-id="${plugin.id}"><i class="fas fa-sync"></i></button>
                    <button class="btn btn-sm btn-outline-danger" data-action="remove" data-plugin-id="${plugin.id}"><i class="fas fa-trash"></i></button>
                </div>
            `;
            pluginList.appendChild(item);
        });
        // Add event listeners for actions
        pluginList.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = btn.getAttribute('data-action');
                const pluginId = btn.getAttribute('data-plugin-id');
                if (action === 'details') {
                    const details = await window.electron.invoke('modding:getPluginDetails', pluginId);
                    showPluginDetails(details);
                } else if (action === 'update') {
                    showLoading();
                    const result = await window.electron.invoke('modding:updatePlugin', pluginId);
                    hideLoading();
                    showToast(result ? 'Plugin updated.' : 'Plugin update failed.', result ? 'success' : 'error');
                    await refreshPluginList();
                } else if (action === 'remove') {
                    showLoading();
                    const result = await window.electron.invoke('modding:removePlugin', pluginId);
                    hideLoading();
                    showToast(result ? 'Plugin removed.' : 'Plugin removal failed.', result ? 'success' : 'error');
                    await refreshPluginList();
                }
            });
        });
        // Add click for plugin name to show details
        pluginList.querySelectorAll('.plugin-name').forEach(span => {
            span.addEventListener('click', async (e) => {
                const pluginId = span.getAttribute('data-plugin-id');
                const details = await window.electron.invoke('modding:getPluginDetails', pluginId);
                showPluginDetails(details);
            });
        });
    } catch (err) {
        showError('Failed to load plugins: ' + (err.message || err));
    }
}

function showPluginDetails(details) {
    const modalBody = document.getElementById('pluginDetailsBody');
    modalBody.innerHTML = details ? `
        <strong>Name:</strong> ${details.name}<br>
        <strong>Version:</strong> ${details.version}<br>
        <strong>Description:</strong> ${details.description || 'No description.'}<br>
        <strong>Author:</strong> ${details.author || 'Unknown'}<br>
        <strong>Path:</strong> ${details.path || ''}<br>
    ` : '<div class="text-muted">No details available.</div>';
    const modal = new bootstrap.Modal(document.getElementById('pluginDetailsModal'));
    modal.show();
}

// === Batch Drag-and-Drop Support ===
function setupBatchDropZones() {
    const batchDropConfigs = [
        { zoneId: 'meshDropZone', handler: 'modding:batchImportMesh', accept: ['.mesh', '.obj', '.fbx', '.glb'] },
        { zoneId: 'textureDropZone', handler: 'modding:batchImportTexture', accept: ['.png', '.jpg', '.jpeg', '.dds', '.tga'] },
        { zoneId: 'audioDropZone', handler: 'modding:batchImportAudio', accept: ['.wav', '.mp3', '.ogg'] },
        { zoneId: 'questDropZone', handler: 'modding:batchImportQuest', accept: ['.quest', '.json'] },
        { zoneId: 'sceneDropZone', handler: 'modding:batchImportScene', accept: ['.scene', '.json'] },
        { zoneId: 'npcDropZone', handler: 'modding:batchImportNPC', accept: ['.npc', '.json'] },
        { zoneId: 'batchFileInput', handler: 'modding:batchImportAll', accept: [] },
    ];
    batchDropConfigs.forEach(cfg => {
        const zone = document.getElementById(cfg.zoneId);
        if (!zone) return;
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('active');
        });
        zone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('active');
        });
        zone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('active');
            if (e.dataTransfer.files.length > 0) {
                const files = Array.from(e.dataTransfer.files).filter(f => {
                    if (!cfg.accept.length) return true;
                    return cfg.accept.some(ext => f.name.toLowerCase().endsWith(ext));
                });
                if (files.length) {
                    showLoading();
                    logToConsole(`Batch importing ${files.length} files via drag-and-drop...`);
                    const result = await window.electron.invoke(cfg.handler, files);
                    hideLoading();
                    showToast(result ? 'Batch import complete!' : 'Batch import failed', result ? 'success' : 'error');
                }
            }
        });
        // Accessibility: allow keyboard focus
        zone.setAttribute('tabindex', '0');
        zone.setAttribute('aria-label', 'Drop files here for batch import');
    });
}

async function updateRHTUI(status) {
    const rhtStatusText = document.getElementById('rhtStatusText');
    const sendBtn = document.getElementById('sendToHotReload');
    const openBtn = document.getElementById('openHotFolder');
    let hotFolderPath = status && status.path ? status.path : '';
    let statusMsg = '';
    if (!status) {
        statusMsg = 'Checking...';
        rhtStatusText.className = '';
        sendBtn.disabled = true;
        openBtn.disabled = true;
    } else if (status.error) {
        statusMsg = status.error;
        rhtStatusText.className = 'text-danger';
        sendBtn.disabled = true;
        openBtn.disabled = true;
    } else if (!status.installed) {
        statusMsg = 'Not found';
        rhtStatusText.className = 'text-danger';
        sendBtn.disabled = true;
        openBtn.disabled = true;
    } else {
        statusMsg = 'Ready';
        rhtStatusText.className = 'text-success';
        sendBtn.disabled = false;
        openBtn.disabled = false;
    }
    rhtStatusText.textContent = statusMsg;
    // Show hot folder path
    let pathDiv = document.getElementById('hotFolderPath');
    if (!pathDiv) {
        pathDiv = document.createElement('div');
        pathDiv.id = 'hotFolderPath';
        pathDiv.className = 'small text-muted';
        document.getElementById('rhtStatus').appendChild(pathDiv);
    }
    pathDiv.textContent = hotFolderPath ? `Hot Folder: ${hotFolderPath}` : '';
    // Show Set Game Path button if needed
    let setPathBtn = document.getElementById('setGamePathBtn');
    if (status && status.error && status.error.includes('Game path')) {
        if (!setPathBtn) {
            setPathBtn = document.createElement('button');
            setPathBtn.id = 'setGamePathBtn';
            setPathBtn.className = 'btn btn-outline-info btn-sm mt-2';
            setPathBtn.textContent = 'Set Game Path';
            setPathBtn.setAttribute('aria-label', 'Set Cyberpunk 2077 Game Path');
            setPathBtn.addEventListener('click', async () => {
                // Open directory picker via IPC
                const result = await window.electron.invoke('dialog:selectGameDirectory');
                if (result && result.valid) {
                    showToast('Game path set!', 'success');
                    await checkRHTStatus();
                } else {
                    showError('Invalid game directory selected.');
                }
            });
            document.getElementById('rhtStatus').appendChild(setPathBtn);
        }
        setPathBtn.style.display = '';
    } else if (setPathBtn) {
        setPathBtn.style.display = 'none';
    }
}

async function checkRHTStatus() {
    try {
        const status = await window.electron.invoke('modding:checkRHTStatus');
        updateRHTUI(status);
    } catch {
        updateRHTUI({ error: 'Error' });
    }
}

// Enhance Live Preview section after DOMContentLoaded
function setupLivePreviewHotReload() {
    checkRHTStatus();
    const sendBtn = document.getElementById('sendToHotReload');
    const openBtn = document.getElementById('openHotFolder');
    const rhtSection = document.getElementById('rhtStatus').parentElement;
    // Drag-and-drop support
    rhtSection.setAttribute('tabindex', '0');
    rhtSection.setAttribute('aria-label', 'Live Preview Hot Reload Section');
    rhtSection.addEventListener('dragover', (e) => {
        e.preventDefault();
        rhtSection.classList.add('active');
    });
    rhtSection.addEventListener('dragleave', (e) => {
        e.preventDefault();
        rhtSection.classList.remove('active');
    });
    rhtSection.addEventListener('drop', async (e) => {
        e.preventDefault();
        rhtSection.classList.remove('active');
        if (e.dataTransfer.files.length > 0) {
            showLoading();
            setProgress(30);
            try {
                const file = e.dataTransfer.files[0].path;
                const result = await window.electron.invoke('modding:sendToHotReload', file);
                setProgress(100);
                if (result.success) {
                    showToast('File sent to Hot Reload!', 'success');
                } else {
                    showError(result.error || 'Failed to send to Hot Reload.');
                }
            } catch (err) {
                showError('Hot Reload failed: ' + (err.message || err));
            } finally {
                hideLoading(); setProgress(null); checkRHTStatus();
            }
        }
    });
    // Button logic
    sendBtn.addEventListener('click', async () => {
        try {
            const file = await selectFile('Select mod/archive/script/tweak to hot reload', '.archive,.xl,.reds,.tweak,.yaml,.json');
            if (!file) return;
            showLoading();
            setProgress(30);
            const result = await window.electron.invoke('modding:sendToHotReload', file);
            setProgress(100);
            document.getElementById('hotReloadStatus').textContent = result.success ? 'Sent to Hot Reload!' : (result.error || 'Failed to send to Hot Reload.');
            if (!result.success) showError(result.error || 'Failed to send to Hot Reload.');
        } catch (err) {
            showError('Hot Reload failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null); checkRHTStatus();
        }
    });
    openBtn.addEventListener('click', async () => {
        try {
            showLoading();
            await window.electron.invoke('modding:openHotFolder');
        } catch (err) {
            showError('Failed to open Hot Folder: ' + (err.message || err));
        } finally {
            hideLoading(); checkRHTStatus();
        }
    });
}

// Quest graph validation
function validateQuestGraph() {
    const nodes = questNodeEditor.nodes;
    const connections = questNodeEditor.connections;
    // Must have one Start node
    const startNodes = nodes.filter(n => n.type === 'start');
    if (startNodes.length !== 1) return { valid: false, error: 'There must be exactly one Start node.' };
    // Must have at least one End node
    const endNodes = nodes.filter(n => n.type === 'end');
    if (endNodes.length < 1) return { valid: false, error: 'There must be at least one End node.' };
    // No orphaned nodes (all nodes except Start must have at least one incoming connection)
    const nodeIds = nodes.map(n => n.id);
    const incoming = {};
    nodeIds.forEach(id => incoming[id] = 0);
    connections.forEach(c => { incoming[c.target] = (incoming[c.target] || 0) + 1; });
    for (const n of nodes) {
        if (n.type !== 'start' && incoming[n.id] === 0) {
            return { valid: false, error: `Node '${n.name}' (${n.type}) is orphaned (no incoming connection).` };
        }
    }
    // All good
    return { valid: true };
}

function showAIGenerateQuestModal() {
    let modal = document.getElementById('aiQuestModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'aiQuestModal';
        modal.tabIndex = -1;
        modal.setAttribute('aria-labelledby', 'aiQuestModalLabel');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content bg-dark text-light">
                <div class="modal-header">
                    <h5 class="modal-title" id="aiQuestModalLabel">AI Generate Quest Graph</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <label for="aiQuestPrompt">Describe your quest (e.g. branching choices, objectives, characters):</label>
                    <textarea id="aiQuestPrompt" class="form-control bg-dark text-light border-secondary" rows="4" placeholder="e.g. A quest where the player must choose to help or betray a fixer, with different outcomes."></textarea>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" id="aiGenerateQuestConfirm">Generate</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    modal.querySelector('#aiGenerateQuestConfirm').onclick = async () => {
        const prompt = modal.querySelector('#aiQuestPrompt').value;
        if (!prompt) {
            showError('Please enter a quest description.');
            return;
        }
        bsModal.hide();
        await aiGenerateQuestGraph(prompt);
    };
}

async function aiGenerateQuestGraph(prompt) {
    try {
        showLoading();
        const result = await window.electron.invoke('ai:generateQuestNodeGraph', { prompt });
        hideLoading();
        if (result && result.success && result.graph) {
            clearQuestNodeGraph();
            // Populate node editor with generated graph
            (result.graph.nodes || []).forEach(n => createQuestNode(n));
            setTimeout(() => {
                (result.graph.connections || []).forEach(c => {
                    questNodeEditor.jsPlumb.connect({ source: c.source, target: c.target });
                    questNodeEditor.connections.push({ source: c.source, target: c.target, label: c.label || '' });
                });
            }, 200);
            showToast('AI-generated quest graph loaded!', 'success');
        } else {
            showError('AI did not return a valid quest graph.');
        }
    } catch (err) {
        hideLoading();
        showError('AI quest generation failed: ' + (err.message || err));
    }
}

// === Drag-to-create connections, Minimap, Undo/Redo for Quest Node Editor ===

// 1. Drag-to-create connections with visual feedback
function setupDragToCreateConnections() {
    const canvas = document.getElementById('questNodeEditorCanvas');
    let dragSource = null;
    let dragLine = null;
    canvas.addEventListener('mousedown', (e) => {
        const node = e.target.closest('.scene-node');
        if (node && e.target.classList.contains('node-header')) {
            // Only drag from output (bottom endpoint)
            dragSource = node.id;
            dragLine = document.createElement('div');
            dragLine.className = 'drag-conn-line';
            dragLine.style.position = 'absolute';
            dragLine.style.pointerEvents = 'none';
            dragLine.style.zIndex = 2000;
            canvas.appendChild(dragLine);
        }
    });
    canvas.addEventListener('mousemove', (e) => {
        if (dragSource && dragLine) {
            const srcEl = document.getElementById(dragSource);
            const rect = canvas.getBoundingClientRect();
            const srcRect = srcEl.getBoundingClientRect();
            const x1 = srcRect.left + srcRect.width / 2 - rect.left;
            const y1 = srcRect.top + srcRect.height - rect.top;
            const x2 = e.clientX - rect.left;
            const y2 = e.clientY - rect.top;
            dragLine.style.left = Math.min(x1, x2) + 'px';
            dragLine.style.top = Math.min(y1, y2) + 'px';
            dragLine.style.width = Math.abs(x2 - x1) + 'px';
            dragLine.style.height = Math.abs(y2 - y1) + 'px';
            dragLine.style.border = '2px dashed #0ff';
            dragLine.style.background = 'none';
        }
    });
    canvas.addEventListener('mouseup', (e) => {
        if (dragSource && dragLine) {
            const target = e.target.closest('.scene-node');
            if (target && target.id !== dragSource) {
                questNodeEditor.jsPlumb.connect({ source: dragSource, target: target.id });
                questNodeEditor.connections.push({ source: dragSource, target: target.id, label: '' });
                showToast('Connection created.', 'success');
            }
            dragLine.remove();
            dragSource = null;
            dragLine = null;
        }
    });
    // Style for drag line
    const dragStyle = document.createElement('style');
    dragStyle.innerHTML = `.drag-conn-line { pointer-events: none; border-radius: 4px; }`;
    document.head.appendChild(dragStyle);
}

// 2. Minimap overlay
function setupMinimap() {
    const canvas = document.getElementById('questNodeEditorCanvas');
    let minimap = document.getElementById('questNodeMinimap');
    if (!minimap) {
        minimap = document.createElement('div');
        minimap.id = 'questNodeMinimap';
        minimap.className = 'minimap-overlay';
        minimap.style.position = 'absolute';
        minimap.style.right = '16px';
        minimap.style.bottom = '16px';
        minimap.style.width = '180px';
        minimap.style.height = '120px';
        minimap.style.background = '#222c';
        minimap.style.border = '1px solid #0ff';
        minimap.style.zIndex = 3000;
        minimap.style.borderRadius = '8px';
        minimap.style.overflow = 'hidden';
        minimap.style.cursor = 'pointer';
        canvas.parentElement.appendChild(minimap);
    }
    function renderMinimap() {
        minimap.innerHTML = '';
        const nodes = questNodeEditor.nodes;
        const minX = Math.min(...nodes.map(n => n.x || 0), 0);
        const minY = Math.min(...nodes.map(n => n.y || 0), 0);
        const maxX = Math.max(...nodes.map(n => (n.x || 0) + 150), 200);
        const maxY = Math.max(...nodes.map(n => (n.y || 0) + 80), 120);
        const scaleX = 180 / (maxX - minX);
        const scaleY = 120 / (maxY - minY);
        nodes.forEach(n => {
            const dot = document.createElement('div');
            dot.className = 'minimap-node';
            dot.style.position = 'absolute';
            dot.style.left = ((n.x - minX) * scaleX) + 'px';
            dot.style.top = ((n.y - minY) * scaleY) + 'px';
            dot.style.width = '12px';
            dot.style.height = '12px';
            dot.style.background = getNodeColor(n.type);
            dot.style.borderRadius = '50%';
            dot.title = n.name;
            minimap.appendChild(dot);
        });
    }
    minimap.addEventListener('mousedown', (e) => {
        const rect = minimap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        // Pan main canvas to center on this point
        const nodes = questNodeEditor.nodes;
        if (!nodes.length) return;
        const minX = Math.min(...nodes.map(n => n.x || 0), 0);
        const minY = Math.min(...nodes.map(n => n.y || 0), 0);
        const maxX = Math.max(...nodes.map(n => (n.x || 0) + 150), 200);
        const maxY = Math.max(...nodes.map(n => (n.y || 0) + 80), 120);
        const scaleX = 180 / (maxX - minX);
        const scaleY = 120 / (maxY - minY);
        const targetX = minX + x / scaleX - canvas.offsetWidth / 2;
        const targetY = minY + y / scaleY - canvas.offsetHeight / 2;
        canvas.scrollLeft = targetX;
        canvas.scrollTop = targetY;
    });
    // Patch node creation/deletion to update minimap
    const origCreate = createQuestNode;
    createQuestNode = function(args) { origCreate(args); renderMinimap(); };
    const origDelete = deleteQuestNode;
    deleteQuestNode = function(id) { origDelete(id); renderMinimap(); };
    const origLoad = loadQuestNodeGraph;
    loadQuestNodeGraph = function() { origLoad(); setTimeout(renderMinimap, 200); };
    renderMinimap();
}

// 3. Undo/Redo support
function setupUndoRedo() {
    const undoStack = [];
    const redoStack = [];
    function snapshot() {
        undoStack.push(JSON.stringify({ nodes: questNodeEditor.nodes, connections: questNodeEditor.connections }));
        if (undoStack.length > 50) undoStack.shift();
        redoStack.length = 0;
    }
    function restore(state) {
        clearQuestNodeGraph();
        const data = JSON.parse(state);
        (data.nodes || []).forEach(n => createQuestNode(n));
        setTimeout(() => {
            (data.connections || []).forEach(c => {
                questNodeEditor.jsPlumb.connect({ source: c.source, target: c.target });
                questNodeEditor.connections.push({ source: c.source, target: c.target, label: c.label || '' });
            });
        }, 200);
    }
    // Patch node/connection changes
    const patch = (fn) => (...args) => { snapshot(); return fn(...args); };
    createQuestNode = patch(createQuestNode);
    deleteQuestNode = patch(deleteQuestNode);
    loadQuestNodeGraph = patch(loadQuestNodeGraph);
    questNodeEditor.jsPlumb.bind('connection', patch(() => {}));
    // Undo/Redo buttons
    const nodeControls = document.getElementById('nodeEditorControls');
    if (nodeControls && !document.getElementById('undoNodeGraph')) {
        const undoBtn = document.createElement('button');
        undoBtn.id = 'undoNodeGraph';
        undoBtn.className = 'btn btn-sm btn-outline-secondary';
        undoBtn.innerHTML = '<i class="fas fa-undo"></i> Undo';
        undoBtn.setAttribute('aria-label', 'Undo');
        nodeControls.appendChild(undoBtn);
        undoBtn.onclick = () => {
            if (undoStack.length > 1) {
                redoStack.push(undoStack.pop());
                restore(undoStack[undoStack.length - 1]);
                showToast('Undo', 'info');
            }
        };
    }
    if (nodeControls && !document.getElementById('redoNodeGraph')) {
        const redoBtn = document.createElement('button');
        redoBtn.id = 'redoNodeGraph';
        redoBtn.className = 'btn btn-sm btn-outline-secondary';
        redoBtn.innerHTML = '<i class="fas fa-redo"></i> Redo';
        redoBtn.setAttribute('aria-label', 'Redo');
        nodeControls.appendChild(redoBtn);
        redoBtn.onclick = () => {
            if (redoStack.length) {
                const state = redoStack.pop();
                undoStack.push(state);
                restore(state);
                showToast('Redo', 'info');
            }
        };
    }
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'z') {
            document.getElementById('undoNodeGraph')?.click();
        } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
            document.getElementById('redoNodeGraph')?.click();
        }
    });
    // Initial snapshot
    snapshot();
}

// ... existing code ...
// === AI-powered Asset Enhancement UI ===
document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    // Image upscaling
    document.getElementById('upscaleAsset').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = { file: document.getElementById('upscaleFile').files[0] };
            logToConsole('AI: Upscale Asset...', 'info');
            const result = await window.electron.invoke('ai:upscaleImage', opts);
            setProgress(100);
            if (result.success) {
                showToast('Image upscaled!', 'success');
            } else {
                showError(result.message || 'Upscaling failed');
            }
        } catch (err) {
            showError('Upscale failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });
    // Voice cloning
    document.getElementById('voiceCloneFile').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            showToast('Voice sample selected: ' + e.target.files[0].name, 'info');
        }
    });
    document.getElementById('generateVoiceAdvanced').addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const opts = {
                apiKey: document.getElementById('voiceApiKey').value,
                textBatch: document.getElementById('voiceTextBatch').value,
                voiceCloneFile: document.getElementById('voiceCloneFile').files[0],
                emotion: document.getElementById('voiceEmotionSlider').value,
                phoneme: document.getElementById('voicePhoneme').value,
                noise: document.getElementById('voiceNoise').value
            };
            logToConsole('AI: Voice Cloning...', 'info');
            const result = await window.electron.invoke('ai:voiceClone', opts);
            setProgress(100);
            if (result.success) {
                showToast('Voice cloned/generated!', 'success');
            } else {
                showError(result.message || 'Voice cloning failed');
            }
        } catch (err) {
            showError('Voice cloning failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });
    // Animation retargeting
    document.getElementById('animationRetargetBtn')?.addEventListener('click', async () => {
        try {
            showLoading();
            setProgress(20);
            const src = document.getElementById('animationRetargetSource').files[0];
            const tgt = document.getElementById('animationRetargetTarget').files[0];
            if (!src || !tgt) {
                showError('Please select both source and target animation files.');
                hideLoading(); setProgress(null); return;
            }
            logToConsole('AI: Animation Retargeting...', 'info');
            const result = await window.electron.invoke('ai:retargetAnimation', { source: src, target: tgt });
            setProgress(100);
            if (result.success) {
                showToast('Animation retargeted!', 'success');
            } else {
                showError(result.message || 'Animation retargeting failed');
            }
        } catch (err) {
            showError('Animation retargeting failed: ' + (err.message || err));
        } finally {
            hideLoading(); setProgress(null);
        }
    });
});
// ... existing code ...

// ... existing code ...
// === Procedural Content Generation UI ===
document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    // Add Generate City Block button
    if (!document.getElementById('generateCityBlock')) {
        const aiSection = document.getElementById('aiToolsAccordion');
        const cityBtn = document.createElement('button');
        cityBtn.id = 'generateCityBlock';
        cityBtn.className = 'btn btn-outline-info w-100 mb-2';
        cityBtn.innerHTML = '<i class="fas fa-city"></i> Generate City Block';
        cityBtn.setAttribute('aria-label', 'Generate City Block');
        aiSection.parentElement.insertBefore(cityBtn, aiSection);
        cityBtn.addEventListener('click', showCityBlockPromptModal);
    }
    // Add Generate NPC Crowd button
    if (!document.getElementById('generateNPCCrowd')) {
        const aiSection = document.getElementById('aiToolsAccordion');
        const npcBtn = document.createElement('button');
        npcBtn.id = 'generateNPCCrowd';
        npcBtn.className = 'btn btn-outline-info w-100 mb-2';
        npcBtn.innerHTML = '<i class="fas fa-users"></i> Generate NPC Crowd';
        npcBtn.setAttribute('aria-label', 'Generate NPC Crowd');
        aiSection.parentElement.insertBefore(npcBtn, aiSection);
        npcBtn.addEventListener('click', showNPCCrowdPromptModal);
    }
});

function showCityBlockPromptModal() {
    let modal = document.getElementById('cityBlockModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'cityBlockModal';
        modal.tabIndex = -1;
        modal.setAttribute('aria-labelledby', 'cityBlockModalLabel');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content bg-dark text-light">
                <div class="modal-header">
                    <h5 class="modal-title" id="cityBlockModalLabel">Generate City Block</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <label for="cityBlockPrompt">Describe the city block (e.g. size, style, features):</label>
                    <textarea id="cityBlockPrompt" class="form-control bg-dark text-light border-secondary" rows="3" placeholder="e.g. Large block with alleys, neon signs, market stalls"></textarea>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" id="cityBlockGenerateBtn">Generate</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    modal.querySelector('#cityBlockGenerateBtn').onclick = async () => {
        const prompt = modal.querySelector('#cityBlockPrompt').value;
        if (!prompt) {
            showError('Please enter a description.');
            return;
        }
        bsModal.hide();
        await generateCityBlock(prompt);
    };
}

async function generateCityBlock(prompt) {
    try {
        showLoading();
        const result = await window.electron.invoke('ai:generateCityBlock', { prompt });
        hideLoading();
        if (result && result.success && result.file) {
            showToast('City block generated!', 'success');
        } else {
            showError(result.message || 'City block generation failed');
        }
    } catch (err) {
        hideLoading();
        showError('City block generation failed: ' + (err.message || err));
    }
}

function showNPCCrowdPromptModal() {
    let modal = document.getElementById('npcCrowdModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'npcCrowdModal';
        modal.tabIndex = -1;
        modal.setAttribute('aria-labelledby', 'npcCrowdModalLabel');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content bg-dark text-light">
                <div class="modal-header">
                    <h5 class="modal-title" id="npcCrowdModalLabel">Generate NPC Crowd</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <label for="npcCrowdPrompt">Describe the NPC crowd (e.g. number, types, behaviors):</label>
                    <textarea id="npcCrowdPrompt" class="form-control bg-dark text-light border-secondary" rows="3" placeholder="e.g. 20 people, mix of vendors, street kids, corpo agents"></textarea>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" id="npcCrowdGenerateBtn">Generate</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    modal.querySelector('#npcCrowdGenerateBtn').onclick = async () => {
        const prompt = modal.querySelector('#npcCrowdPrompt').value;
        if (!prompt) {
            showError('Please enter a description.');
            return;
        }
        bsModal.hide();
        await generateNPCCrowd(prompt);
    };
}

async function generateNPCCrowd(prompt) {
    try {
        showLoading();
        const result = await window.electron.invoke('ai:generateNPCCrowd', { prompt });
        hideLoading();
        if (result && result.success && result.file) {
            showToast('NPC crowd generated!', 'success');
        } else {
            showError(result.message || 'NPC crowd generation failed');
        }
    } catch (err) {
        hideLoading();
        showError('NPC crowd generation failed: ' + (err.message || err));
    }
}
// ... existing code ...

// ... existing code ...
// === Publish/Versioning UI Event Handlers ===
document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    // Publish Mod
    document.getElementById('publishModBtn').addEventListener('click', async () => {
        try {
            showLoading();
            const apiKey = document.getElementById('publishApiKey').value;
            const title = document.getElementById('publishModTitle').value;
            const desc = document.getElementById('publishModDesc').value;
            const version = document.getElementById('publishModVersion').value;
            const changelog = document.getElementById('publishModChangelog').value;
            const deps = document.getElementById('publishModDeps').value;
            if (!apiKey || !title || !desc || !version) {
                showError('Please fill in all required fields.');
                hideLoading(); return;
            }
            const result = await window.electron.invoke('modding:publishMod', {
                apiKey, title, desc, version, changelog, deps
            });
            hideLoading();
            if (result && result.success) {
                showToast('Mod published successfully!', 'success');
            } else {
                showError(result.message || 'Mod publishing failed');
            }
        } catch (err) {
            hideLoading();
            showError('Mod publishing failed: ' + (err.message || err));
        }
    });
    // Git Init
    document.getElementById('gitInitBtn').addEventListener('click', async () => {
        try {
            showLoading();
            const result = await window.electron.invoke('modding:gitInit');
            hideLoading();
            if (result && result.success) {
                showToast('Git repository initialized!', 'success');
            } else {
                showError(result.message || 'Git init failed');
            }
        } catch (err) {
            hideLoading();
            showError('Git init failed: ' + (err.message || err));
        }
    });
    // Git Commit
    document.getElementById('gitCommitBtn').addEventListener('click', async () => {
        try {
            showLoading();
            const msg = prompt('Enter commit message:');
            if (!msg) { hideLoading(); return; }
            const result = await window.electron.invoke('modding:gitCommit', { message: msg });
            hideLoading();
            if (result && result.success) {
                showToast('Committed to Git!', 'success');
            } else {
                showError(result.message || 'Git commit failed');
            }
        } catch (err) {
            hideLoading();
            showError('Git commit failed: ' + (err.message || err));
        }
    });
    // Git Push
    document.getElementById('gitPushBtn').addEventListener('click', async () => {
        try {
            showLoading();
            const result = await window.electron.invoke('modding:gitPush');
            hideLoading();
            if (result && result.success) {
                showToast('Pushed to remote!', 'success');
            } else {
                showError(result.message || 'Git push failed');
            }
        } catch (err) {
            hideLoading();
            showError('Git push failed: ' + (err.message || err));
        }
    });
    // Git Log
    document.getElementById('gitLogBtn').addEventListener('click', async () => {
        try {
            showLoading();
            const result = await window.electron.invoke('modding:gitLog');
            hideLoading();
            if (result && result.success && result.log) {
                document.getElementById('gitLogOutput').textContent = result.log;
            } else {
                showError(result.message || 'Git log failed');
            }
        } catch (err) {
            hideLoading();
            showError('Git log failed: ' + (err.message || err));
        }
    });
});
// ... existing code ...

// ... existing code ...
document.addEventListener('DOMContentLoaded', () => {
  // ... existing code ...
  // Analysis buttons
  document.getElementById('analyzeModBtn').addEventListener('click', async () => {
    const dir = await selectDirectory('Select Mod Directory to Analyze');
    if (!dir) return;
    showLoading();
    setProgress(10);
    try {
      const report = await window.electron.invoke('modding:analyzeMod', dir);
      setProgress(100);
      showAnalysisReport(report);
    } catch (err) {
      showError('Mod analysis failed: ' + (err.message || err));
    } finally {
      hideLoading(); setProgress(null);
    }
  });
  document.getElementById('analyzeAssetBtn').addEventListener('click', async () => {
    const file = await selectFile('Select Asset to Analyze', '.mesh,.obj,.fbx,.glb,.png,.jpg,.jpeg,.dds,.tga,.xbm,.reds,.lua,.js,.archive,.zip,.rar,.7z');
    if (!file) return;
    showLoading();
    setProgress(10);
    try {
      const report = await window.electron.invoke('modding:analyzeAsset', file);
      setProgress(100);
      showAnalysisReport(report);
    } catch (err) {
      showError('Asset analysis failed: ' + (err.message || err));
    } finally {
      hideLoading(); setProgress(null);
    }
  });
  function showAnalysisReport(report) {
    const body = document.getElementById('analysisReportBody');
    let html = '';
    if (report.summary) html += `<div class='mb-2'><strong>Summary:</strong> ${report.summary}</div>`;
    if (report.path) html += `<div class='mb-2'><strong>Path:</strong> ${report.path}</div>`;
    if (report.type) html += `<div class='mb-2'><strong>Type:</strong> ${report.type}</div>`;
    if (report.size) html += `<div class='mb-2'><strong>Size:</strong> ${Math.round(report.size/1024)} KB</div>`;
    if (report.issues && report.issues.length) html += `<div class='mb-2 text-danger'><strong>Issues:</strong><ul>` + report.issues.map(i => `<li>${i}</li>`).join('') + '</ul></div>';
    if (report.warnings && report.warnings.length) html += `<div class='mb-2 text-warning'><strong>Warnings:</strong><ul>` + report.warnings.map(w => `<li>${w}</li>`).join('') + '</ul></div>';
    if (report.suggestions && report.suggestions.length) html += `<div class='mb-2 text-info'><strong>Suggestions:</strong><ul>` + report.suggestions.map(s => `<li>${s}</li>`).join('') + '</ul></div>';
    if (report.assets && Array.isArray(report.assets)) {
      html += `<hr><strong>Assets:</strong><ul>`;
      report.assets.forEach(a => {
        html += `<li>${a.path} (${a.type || ''}, ${Math.round(a.size/1024)} KB)`;
        if (a.issues && a.issues.length) html += `<span class='text-danger'> Issues: ${a.issues.join('; ')}</span>`;
        if (a.warnings && a.warnings.length) html += `<span class='text-warning'> Warnings: ${a.warnings.join('; ')}</span>`;
        if (a.suggestions && a.suggestions.length) html += `<span class='text-info'> Suggestions: ${a.suggestions.join('; ')}</span>`;
        html += '</li>';
      });
      html += '</ul>';
    }
    body.innerHTML = html;
    const modal = new bootstrap.Modal(document.getElementById('analysisReportModal'));
    modal.show();
  }
  // ... existing code ...
});
// ... existing code ...

// ... existing code ...
document.addEventListener('DOMContentLoaded', () => {
  // ... existing code ...
  // Asset Market logic
  const assetMarketSearchBtn = document.getElementById('assetMarketSearchBtn');
  const assetMarketSearchInput = document.getElementById('assetMarketSearchInput');
  const assetMarketResults = document.getElementById('assetMarketResults');
  let assetMarketAssets = [];
  let selectedAsset = null;
  assetMarketSearchBtn.addEventListener('click', async () => {
    const query = assetMarketSearchInput.value.trim();
    if (!query) return;
    showLoading();
    setProgress(10);
    try {
      const res = await window.electron.invoke('assetMarket:searchAssets', query, 1, 24);
      setProgress(100);
      if (res.success && res.results) {
        assetMarketAssets = res.results;
        renderAssetMarketResults(assetMarketAssets);
      } else {
        showError(res.message || 'Asset search failed');
      }
    } catch (err) {
      showError('Asset search failed: ' + (err.message || err));
    } finally {
      hideLoading(); setProgress(null);
    }
  });
  assetMarketSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') assetMarketSearchBtn.click();
  });
  function renderAssetMarketResults(assets) {
    assetMarketResults.innerHTML = '';
    if (!assets.length) {
      assetMarketResults.innerHTML = '<div class="text-muted">No assets found.</div>';
      return;
    }
    assets.forEach(asset => {
      const col = document.createElement('div');
      col.className = 'col-6';
      col.innerHTML = `
        <div class="card h-100" tabindex="0" aria-label="${asset.name}">
          <img src="${asset.thumbnails && asset.thumbnails.images && asset.thumbnails.images[2]?.url || ''}" class="card-img-top" alt="${asset.name}">
          <div class="card-body p-2">
            <h6 class="card-title mb-1" style="font-size:0.95em;">${asset.name}</h6>
            <div class="small text-muted mb-1">by ${asset.user?.displayName || asset.user?.username || 'Unknown'}</div>
            <button class="btn btn-sm btn-outline-info w-100 asset-preview-btn" data-uid="${asset.uid}">Preview</button>
          </div>
        </div>
      `;
      assetMarketResults.appendChild(col);
    });
    // Add preview button listeners
    assetMarketResults.querySelectorAll('.asset-preview-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const uid = btn.getAttribute('data-uid');
        showLoading();
        setProgress(20);
        try {
          const res = await window.electron.invoke('assetMarket:getAssetDetails', uid);
          setProgress(100);
          if (res.success && res.asset) {
            selectedAsset = res.asset;
            showAssetMarketPreview(selectedAsset);
          } else {
            showError(res.message || 'Failed to fetch asset details');
          }
        } catch (err) {
          showError('Failed to fetch asset details: ' + (err.message || err));
        } finally {
          hideLoading(); setProgress(null);
        }
      });
    });
  }
  function showAssetMarketPreview(asset) {
    const body = document.getElementById('assetMarketPreviewBody');
    let html = '';
    html += `<div class='row'><div class='col-md-6'><img src='${asset.thumbnails && asset.thumbnails.images && asset.thumbnails.images[2]?.url || ''}' class='img-fluid rounded mb-2' alt='${asset.name}'></div>`;
    html += `<div class='col-md-6'><h5>${asset.name}</h5><div class='small text-muted mb-2'>by ${asset.user?.displayName || asset.user?.username || 'Unknown'}</div>`;
    html += `<div class='mb-2'>${asset.description || ''}</div>`;
    html += `<div class='mb-2'><strong>Tags:</strong> ${(asset.tags || []).map(t => t.name).join(', ')}</div>`;
    html += `<div class='mb-2'><strong>License:</strong> ${asset.license || 'Unknown'}</div>`;
    html += `<div class='mb-2'><a href='${asset.viewerUrl}' target='_blank' rel='noopener'>View on Sketchfab <i class='fas fa-external-link-alt'></i></a></div>`;
    html += `</div></div>`;
    body.innerHTML = html;
    const modal = new bootstrap.Modal(document.getElementById('assetMarketPreviewModal'));
    modal.show();
  }
  document.getElementById('assetMarketDownloadBtn').addEventListener('click', async () => {
    if (!selectedAsset) return;
    const destDir = await selectDirectory('Select Download Directory');
    if (!destDir) return;
    showLoading();
    setProgress(20);
    try {
      const res = await window.electron.invoke('assetMarket:downloadAsset', selectedAsset.uid, destDir);
      setProgress(100);
      if (res.success && res.file) {
        showToast('Asset downloaded: ' + res.file, 'success');
      } else {
        showError(res.message || 'Download failed');
      }
    } catch (err) {
      showError('Download failed: ' + (err.message || err));
    } finally {
      hideLoading(); setProgress(null);
    }
  });
  // ... existing code ...
});
// ... existing code ...

// ... existing code ...
// === Mesh Editor Integration ===

// Load three.js from CDN if not present
if (typeof THREE === 'undefined') {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/three@0.156.1/build/three.min.js';
  script.onload = () => { window.THREE = THREE; };
  document.head.appendChild(script);
}

let meshEditorState = {
  mesh: null,
  meshJson: null,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  animationId: null
};

function openMeshEditorModal() {
  const modal = new bootstrap.Modal(document.getElementById('meshEditorModal'));
  modal.show();
  setTimeout(initMeshEditorThree, 200); // Wait for modal to render
}

document.getElementById('openMeshEditor').addEventListener('click', openMeshEditorModal);

function initMeshEditorThree() {
  const canvas = document.getElementById('meshEditorCanvas');
  if (!canvas) return;
  // Clean up previous renderer
  if (meshEditorState.renderer) {
    meshEditorState.renderer.dispose && meshEditorState.renderer.dispose();
    cancelAnimationFrame(meshEditorState.animationId);
    meshEditorState.renderer = null;
  }
  // Init three.js
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(0, 1, 3);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(width, height);
  // Lighting
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 7.5);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x888888));
  // Grid
  const grid = new THREE.GridHelper(10, 20);
  scene.add(grid);
  // Store state
  meshEditorState.scene = scene;
  meshEditorState.camera = camera;
  meshEditorState.renderer = renderer;
  // Animate
  function animate() {
    meshEditorState.animationId = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}

// Load mesh file
const meshEditorFileInput = document.getElementById('meshEditorFileInput');
meshEditorFileInput.addEventListener('change', async (e) => {
  if (!e.target.files.length) return;
  const file = e.target.files[0];
  const filePath = file.path;
  const result = await window.electron.meshEditor.loadMesh(filePath);
  if (result.success) {
    meshEditorState.meshJson = result.mesh;
    loadMeshToScene(result.mesh);
    showToast('Mesh loaded', 'success');
  } else {
    showError('Failed to load mesh: ' + result.error);
  }
});

function loadMeshToScene(meshJson) {
  // Remove previous mesh
  if (meshEditorState.mesh) {
    meshEditorState.scene.remove(meshEditorState.mesh);
    meshEditorState.mesh = null;
  }
  // Reconstruct mesh from JSON
  const loader = new THREE.ObjectLoader();
  const mesh = loader.parse(meshJson);
  meshEditorState.scene.add(mesh);
  meshEditorState.mesh = mesh;
}

// Save mesh
const meshEditorSaveBtn = document.getElementById('meshEditorSaveBtn');
meshEditorSaveBtn.addEventListener('click', async () => {
  if (!meshEditorState.meshJson) return showError('No mesh loaded');
  const fileName = prompt('Enter file name to save (with extension, e.g. mymesh.obj):');
  if (!fileName) return;
  const filePath = await selectSaveFile('Save Mesh', fileName.split('.').pop());
  if (!filePath) return;
  const result = await window.electron.meshEditor.saveMesh(meshEditorState.meshJson, filePath);
  if (result.success) {
    showToast('Mesh saved', 'success');
  } else {
    showError('Failed to save mesh: ' + result.error);
  }
});

// Transform mesh
const meshEditorApplyTransform = document.getElementById('meshEditorApplyTransform');
meshEditorApplyTransform.addEventListener('click', async () => {
  if (!meshEditorState.meshJson) return showError('No mesh loaded');
  const pos = {
    x: parseFloat(document.getElementById('meshEditorPosX').value) || 0,
    y: parseFloat(document.getElementById('meshEditorPosY').value) || 0,
    z: parseFloat(document.getElementById('meshEditorPosZ').value) || 0
  };
  const rot = {
    x: (parseFloat(document.getElementById('meshEditorRotX').value) || 0) * Math.PI / 180,
    y: (parseFloat(document.getElementById('meshEditorRotY').value) || 0) * Math.PI / 180,
    z: (parseFloat(document.getElementById('meshEditorRotZ').value) || 0) * Math.PI / 180
  };
  const scale = {
    x: parseFloat(document.getElementById('meshEditorScaleX').value) || 1,
    y: parseFloat(document.getElementById('meshEditorScaleY').value) || 1,
    z: parseFloat(document.getElementById('meshEditorScaleZ').value) || 1
  };
  const result = await window.electron.meshEditor.transformMesh(meshEditorState.meshJson, { position: pos, rotation: rot, scale });
  if (result.success) {
    meshEditorState.meshJson = result.mesh;
    loadMeshToScene(result.mesh);
    showToast('Transform applied', 'success');
  } else {
    showError('Failed to transform mesh: ' + result.error);
  }
});

// Delete child
const meshEditorDeleteChild = document.getElementById('meshEditorDeleteChild');
meshEditorDeleteChild.addEventListener('click', async () => {
  if (!meshEditorState.meshJson) return showError('No mesh loaded');
  const childName = document.getElementById('meshEditorChildName').value;
  if (!childName) return showError('Enter child name');
  const result = await window.electron.meshEditor.deleteMeshChild(meshEditorState.meshJson, childName);
  if (result.success) {
    meshEditorState.meshJson = result.mesh;
    loadMeshToScene(result.mesh);
    showToast('Child deleted', 'success');
  } else {
    showError('Failed to delete child: ' + result.error);
  }
});

// Add child mesh
const meshEditorAddChildFile = document.getElementById('meshEditorAddChildFile');
const meshEditorAddChild = document.getElementById('meshEditorAddChild');
let addChildMeshJson = null;
meshEditorAddChildFile.addEventListener('change', async (e) => {
  if (!e.target.files.length) return;
  const file = e.target.files[0];
  const filePath = file.path;
  const result = await window.electron.meshEditor.loadMesh(filePath);
  if (result.success) {
    addChildMeshJson = result.mesh;
    showToast('Child mesh loaded', 'success');
  } else {
    showError('Failed to load child mesh: ' + result.error);
  }
});
meshEditorAddChild.addEventListener('click', async () => {
  if (!meshEditorState.meshJson) return showError('No mesh loaded');
  if (!addChildMeshJson) return showError('No child mesh loaded');
  const result = await window.electron.meshEditor.addMeshChild(meshEditorState.meshJson, addChildMeshJson);
  if (result.success) {
    meshEditorState.meshJson = result.mesh;
    loadMeshToScene(result.mesh);
    showToast('Child added', 'success');
    addChildMeshJson = null;
    meshEditorAddChildFile.value = '';
  } else {
    showError('Failed to add child: ' + result.error);
  }
});

// ... existing code ...
// === Monaco Editor for Script Editing ===
let monacoScriptEditor = null;
let currentScriptFilePath = null;

function loadMonacoEditor(callback) {
  if (window.monaco) return callback();
  const loaderScript = document.createElement('script');
  loaderScript.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
  loaderScript.onload = () => {
    window.require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
    window.require(['vs/editor/editor.main'], () => callback());
  };
  document.body.appendChild(loaderScript);
}

function openScriptEditorModal() {
  const modal = new bootstrap.Modal(document.getElementById('scriptEditorModal'));
  modal.show();
  setTimeout(() => {
    loadMonacoEditor(() => {
      if (!monacoScriptEditor) {
        monacoScriptEditor = monaco.editor.create(document.getElementById('monacoScriptEditor'), {
          value: '',
          language: 'reds',
          theme: 'vs-dark',
          fontSize: 15,
          minimap: { enabled: false },
          automaticLayout: true
        });
      }
    });
  }, 200);
}

document.getElementById('openScriptEditor')?.addEventListener('click', openScriptEditorModal);
document.getElementById('openScriptEditor')?.addEventListener('keydown', e => { if (e.key === 'Enter') openScriptEditorModal(); });

// Language selector
const scriptEditorLanguage = document.getElementById('scriptEditorLanguage');
if (scriptEditorLanguage) {
  scriptEditorLanguage.addEventListener('change', () => {
    if (monacoScriptEditor) {
      monaco.editor.setModelLanguage(monacoScriptEditor.getModel(), scriptEditorLanguage.value);
    }
  });
}

// File open
const scriptFileBrowser = document.getElementById('scriptFileBrowser');
if (scriptFileBrowser) {
  scriptFileBrowser.addEventListener('change', async (e) => {
    if (!e.target.files.length) return;
    const file = e.target.files[0];
    currentScriptFilePath = file.path;
    const text = await file.text();
    loadMonacoEditor(() => {
      if (monacoScriptEditor) {
        monacoScriptEditor.setValue(text);
        // Set language based on extension
        const ext = file.name.split('.').pop();
        let lang = 'plaintext';
        if (ext === 'reds') lang = 'reds';
        else if (ext === 'lua') lang = 'lua';
        else if (ext === 'js') lang = 'javascript';
        monaco.editor.setModelLanguage(monacoScriptEditor.getModel(), lang);
        scriptEditorLanguage.value = lang;
      }
    });
  });
}

// Save file
const saveScriptFileBtn = document.getElementById('saveScriptFile');
if (saveScriptFileBtn) {
  saveScriptFileBtn.addEventListener('click', async () => {
    if (!monacoScriptEditor) return;
    let filePath = currentScriptFilePath;
    if (!filePath) {
      filePath = await selectSaveFile('Save Script', scriptEditorLanguage.value);
      if (!filePath) return;
    }
    const content = monacoScriptEditor.getValue();
    const ok = await window.electron.invoke('modding:saveScriptFile', filePath, content);
    if (ok) {
      showToast('Script saved', 'success');
      currentScriptFilePath = filePath;
    } else {
      showError('Failed to save script');
    }
  });
}

// Compile file
const compileScriptFileBtn = document.getElementById('compileScriptFile');
if (compileScriptFileBtn) {
  compileScriptFileBtn.addEventListener('click', async () => {
    if (!monacoScriptEditor) return;
    let filePath = currentScriptFilePath;
    if (!filePath) {
      filePath = await selectSaveFile('Save Script Before Compile', scriptEditorLanguage.value);
      if (!filePath) return;
      const content = monacoScriptEditor.getValue();
      await window.electron.invoke('modding:saveScriptFile', filePath, content);
      currentScriptFilePath = filePath;
    }
    const result = await window.electron.invoke('modding:compileScriptFile', filePath);
    const output = document.getElementById('scriptEditorOutput');
    if (result.success) {
      output.textContent = 'Compilation successful!';
      output.classList.remove('text-danger');
      output.classList.add('text-success');
    } else {
      output.textContent = 'Compilation failed: ' + (result.error || 'Unknown error');
      output.classList.remove('text-success');
      output.classList.add('text-danger');
    }
  });
}

// Open Script Editor from sidebar
const openScriptEditorBtn = document.getElementById('openScriptEditor');
if (openScriptEditorBtn) {
  openScriptEditorBtn.addEventListener('click', openScriptEditorModal);
}

// ... existing code ...
// === Dependency Management UI Logic ===
let currentManifest = null;
let currentModDir = './mod'; // Default mod dir, update as needed

async function loadDependenciesUI() {
    // Load manifest
    currentManifest = await window.electron.moddingDeps.readManifest(currentModDir);
    if (!currentManifest) {
        // If no manifest, create a new one
        currentManifest = await window.electron.moddingDeps.createManifest({ id: 'my_mod', name: 'My Mod' });
    }
    renderDependenciesTable();
    await checkAndShowDependencyWarnings();
}

function renderDependenciesTable() {
    const tbody = document.getElementById('dependenciesTableBody');
    tbody.innerHTML = '';
    if (!currentManifest.dependencies) currentManifest.dependencies = [];
    currentManifest.dependencies.forEach((dep, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dep.id}</td>
            <td>${dep.version || ''}</td>
            <td>${dep.required !== false ? 'Yes' : 'No'}</td>
            <td>
                <button class="btn btn-sm btn-outline-danger" data-idx="${idx}" data-action="remove-dep">Remove</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById('addDependencyBtn').addEventListener('click', () => {
    const id = document.getElementById('depIdInput').value.trim();
    const version = document.getElementById('depVersionInput').value.trim();
    const required = document.getElementById('depRequiredInput').checked;
    if (!id) return;
    if (!currentManifest.dependencies) currentManifest.dependencies = [];
    currentManifest.dependencies.push({ id, version, required });
    renderDependenciesTable();
    checkAndShowDependencyWarnings();
    document.getElementById('depIdInput').value = '';
    document.getElementById('depVersionInput').value = '';
    document.getElementById('depRequiredInput').checked = true;
});

document.getElementById('dependenciesTableBody').addEventListener('click', (e) => {
    if (e.target && e.target.dataset.action === 'remove-dep') {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (!isNaN(idx)) {
            currentManifest.dependencies.splice(idx, 1);
            renderDependenciesTable();
            checkAndShowDependencyWarnings();
        }
    }
});

async function checkAndShowDependencyWarnings() {
    // Scan available mods/plugins
    const { modIds, modVersions } = await window.electron.moddingDeps.scanAvailableMods('./mod');
    const issues = await window.electron.moddingDeps.resolveDependencies(currentManifest, modIds, modVersions);
    const warningArea = document.getElementById('dependencyWarningArea');
    if (issues && issues.length > 0) {
        warningArea.classList.remove('d-none');
        warningArea.innerHTML = issues.map(i => `<div>${i.message}</div>`).join('');
    } else {
        warningArea.classList.add('d-none');
        warningArea.innerHTML = '';
    }
}

// Hook into settings modal show/save
function showSettingsModal() {
    // ... existing code ...
    loadDependenciesUI();
    // ... existing code ...
}

function saveSettings() {
    // ... existing code ...
    // Save manifest with updated dependencies
    window.electron.moddingDeps.writeManifest(currentModDir, currentManifest);
    // ... existing code ...
}
// ... existing code ...

// ... existing code ...
// === Savegame Editor UI Logic ===
let loadedSavegame = null;
let loadedSaveObj = null;

// Inventory/QuestFlags Table helpers
function renderInventoryTable() {
    const textarea = document.getElementById('sgInventory');
    let items = [];
    try { items = JSON.parse(textarea.value || '[]'); } catch {}
    let html = `<table class='table table-sm table-dark table-bordered align-middle' id='inventoryTable'><thead><tr><th>Item ID</th><th>Quantity</th><th>Actions</th></tr></thead><tbody>`;
    items.forEach((item, idx) => {
        html += `<tr><td>${item.Id || ''}</td><td>${item.Quantity || 1}</td><td>
            <button class='btn btn-sm btn-outline-info' onclick='editInventoryItem(${idx})'>Edit</button>
            <button class='btn btn-sm btn-outline-danger' onclick='removeInventoryItem(${idx})'>Remove</button></td></tr>`;
    });
    html += `</tbody></table><button class='btn btn-sm btn-outline-success mt-2' onclick='addInventoryItem()'>Add Item</button>`;
    const container = document.getElementById('sgInventory').parentElement;
    let tableDiv = container.querySelector('#inventoryTableContainer');
    if (!tableDiv) {
        tableDiv = document.createElement('div');
        tableDiv.id = 'inventoryTableContainer';
        container.insertBefore(tableDiv, textarea);
    }
    tableDiv.innerHTML = html;
}
function renderQuestFlagsTable() {
    const textarea = document.getElementById('sgQuestFlags');
    let flags = [];
    try { flags = JSON.parse(textarea.value || '[]'); } catch {}
    let html = `<table class='table table-sm table-dark table-bordered align-middle' id='questFlagsTable'><thead><tr><th>Flag ID</th><th>Value</th><th>Actions</th></tr></thead><tbody>`;
    flags.forEach((flag, idx) => {
        html += `<tr><td>${flag.Id || ''}</td><td>${flag.Value || ''}</td><td>
            <button class='btn btn-sm btn-outline-info' onclick='editQuestFlag(${idx})'>Edit</button>
            <button class='btn btn-sm btn-outline-danger' onclick='removeQuestFlag(${idx})'>Remove</button></td></tr>`;
    });
    html += `</tbody></table><button class='btn btn-sm btn-outline-success mt-2' onclick='addQuestFlag()'>Add Flag</button>`;
    const container = document.getElementById('sgQuestFlags').parentElement;
    let tableDiv = container.querySelector('#questFlagsTableContainer');
    if (!tableDiv) {
        tableDiv = document.createElement('div');
        tableDiv.id = 'questFlagsTableContainer';
        container.insertBefore(tableDiv, textarea);
    }
    tableDiv.innerHTML = html;
}
window.addInventoryItem = function() {
    const id = prompt('Enter Item ID:');
    if (!id) return;
    const qty = parseInt(prompt('Enter Quantity:', '1'), 10) || 1;
    let items = [];
    try { items = JSON.parse(document.getElementById('sgInventory').value || '[]'); } catch {}
    items.push({ Id: id, Quantity: qty });
    document.getElementById('sgInventory').value = JSON.stringify(items, null, 2);
    renderInventoryTable();
};
window.editInventoryItem = function(idx) {
    let items = [];
    try { items = JSON.parse(document.getElementById('sgInventory').value || '[]'); } catch {}
    const item = items[idx];
    const id = prompt('Edit Item ID:', item.Id);
    if (!id) return;
    const qty = parseInt(prompt('Edit Quantity:', item.Quantity), 10) || 1;
    items[idx] = { Id: id, Quantity: qty };
    document.getElementById('sgInventory').value = JSON.stringify(items, null, 2);
    renderInventoryTable();
};
window.removeInventoryItem = function(idx) {
    let items = [];
    try { items = JSON.parse(document.getElementById('sgInventory').value || '[]'); } catch {}
    items.splice(idx, 1);
    document.getElementById('sgInventory').value = JSON.stringify(items, null, 2);
    renderInventoryTable();
};
window.addQuestFlag = function() {
    const id = prompt('Enter Flag ID:');
    if (!id) return;
    const val = prompt('Enter Value:', 'true');
    let flags = [];
    try { flags = JSON.parse(document.getElementById('sgQuestFlags').value || '[]'); } catch {}
    flags.push({ Id: id, Value: val });
    document.getElementById('sgQuestFlags').value = JSON.stringify(flags, null, 2);
    renderQuestFlagsTable();
};
window.editQuestFlag = function(idx) {
    let flags = [];
    try { flags = JSON.parse(document.getElementById('sgQuestFlags').value || '[]'); } catch {}
    const flag = flags[idx];
    const id = prompt('Edit Flag ID:', flag.Id);
    if (!id) return;
    const val = prompt('Edit Value:', flag.Value);
    flags[idx] = { Id: id, Value: val };
    document.getElementById('sgQuestFlags').value = JSON.stringify(flags, null, 2);
    renderQuestFlagsTable();
};
window.removeQuestFlag = function(idx) {
    let flags = [];
    try { flags = JSON.parse(document.getElementById('sgQuestFlags').value || '[]'); } catch {}
    flags.splice(idx, 1);
    document.getElementById('sgQuestFlags').value = JSON.stringify(flags, null, 2);
    renderQuestFlagsTable();
};
document.getElementById('sgInventory').addEventListener('input', renderInventoryTable);
document.getElementById('sgQuestFlags').addEventListener('input', renderQuestFlagsTable);

// Patch fillSavegameEditorFields to render tables
const origFillSavegameEditorFields = fillSavegameEditorFields;
fillSavegameEditorFields = function(summary) {
    origFillSavegameEditorFields(summary);
    renderInventoryTable();
    renderQuestFlagsTable();
};
// ... existing code ...

// ... existing code ...
// === Archive Tools UI Logic ===
// Add event listeners to Archive Tools buttons (assume buttons with IDs: browseArchiveBtn, diffArchiveBtn, verifyArchiveBtn)
document.getElementById('browseArchiveBtn')?.addEventListener('click', () => {
    clearArchiveBrowserUI();
    new bootstrap.Modal(document.getElementById('archiveBrowserModal')).show();
});
document.getElementById('diffArchiveBtn')?.addEventListener('click', () => {
    clearArchiveDiffUI();
    new bootstrap.Modal(document.getElementById('archiveDiffModal')).show();
});
document.getElementById('verifyArchiveBtn')?.addEventListener('click', () => {
    clearArchiveVerifyUI();
    new bootstrap.Modal(document.getElementById('archiveVerifyModal')).show();
});

// Archive Browser
function clearArchiveBrowserUI() {
    document.getElementById('archiveBrowseFileInput').value = '';
    document.getElementById('archiveBrowseError').textContent = '';
    document.getElementById('archiveBrowseContents').innerHTML = '';
}
document.getElementById('archiveBrowseFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const tempPath = './output/_temp_browse.archive';
        await window.electron.fsWriteFile(tempPath, new Uint8Array(await file.arrayBuffer()));
        const res = await window.electron.archive.listContents(tempPath);
        if (res.success) {
            renderArchiveContents(res.contents);
        } else {
            document.getElementById('archiveBrowseError').textContent = res.error;
        }
    } catch (err) {
        document.getElementById('archiveBrowseError').textContent = err.message;
    }
});
function renderArchiveContents(contents) {
    const container = document.getElementById('archiveBrowseContents');
    if (!contents || contents.length === 0) {
        container.innerHTML = '<div class="text-muted">Archive is empty.</div>';
        return;
    }
    const list = document.createElement('ul');
    list.className = 'list-group';
    for (const entry of contents) {
        const li = document.createElement('li');
        li.className = 'list-group-item bg-dark text-light';
        li.textContent = `${entry.path} (${entry.size} bytes)`;
        list.appendChild(li);
    }
    container.innerHTML = '';
    container.appendChild(list);
}

// Archive Diff
function clearArchiveDiffUI() {
    document.getElementById('archiveDiffFileA').value = '';
    document.getElementById('archiveDiffFileB').value = '';
    document.getElementById('archiveDiffError').textContent = '';
    document.getElementById('archiveDiffResults').innerHTML = '';
}
async function handleArchiveDiff() {
    const fileA = document.getElementById('archiveDiffFileA').files[0];
    const fileB = document.getElementById('archiveDiffFileB').files[0];
    if (!fileA || !fileB) return;
    try {
        const tempA = './output/_temp_diffA.archive';
        const tempB = './output/_temp_diffB.archive';
        await window.electron.fsWriteFile(tempA, new Uint8Array(await fileA.arrayBuffer()));
        await window.electron.fsWriteFile(tempB, new Uint8Array(await fileB.arrayBuffer()));
        const res = await window.electron.archive.diff(tempA, tempB);
        if (res.success) {
            renderArchiveDiff(res.diff);
        } else {
            document.getElementById('archiveDiffError').textContent = res.error;
        }
    } catch (err) {
        document.getElementById('archiveDiffError').textContent = err.message;
    }
}
document.getElementById('archiveDiffFileA').addEventListener('change', handleArchiveDiff);
document.getElementById('archiveDiffFileB').addEventListener('change', handleArchiveDiff);
function renderArchiveDiff(diff) {
    const container = document.getElementById('archiveDiffResults');
    let html = '';
    html += `<div class='text-success'>Added: ${diff.added.length}</div>`;
    if (diff.added.length) html += '<ul>' + diff.added.map(f => `<li>${f.path} (${f.size} bytes)</li>`).join('') + '</ul>';
    html += `<div class='text-danger'>Removed: ${diff.removed.length}</div>`;
    if (diff.removed.length) html += '<ul>' + diff.removed.map(f => `<li>${f.path} (${f.size} bytes)</li>`).join('') + '</ul>';
    html += `<div class='text-warning'>Changed: ${diff.changed.length}</div>`;
    if (diff.changed.length) html += '<ul>' + diff.changed.map(f => `<li>${f.path} (size changed)</li>`).join('') + '</ul>';
    container.innerHTML = html;
}

// Archive Verify
function clearArchiveVerifyUI() {
    document.getElementById('archiveVerifyFileInput').value = '';
    document.getElementById('archiveVerifyError').textContent = '';
    document.getElementById('archiveVerifyStatus').textContent = '';
}
document.getElementById('archiveVerifyFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const tempPath = './output/_temp_verify.archive';
        await window.electron.fsWriteFile(tempPath, new Uint8Array(await file.arrayBuffer()));
        const res = await window.electron.archive.verify(tempPath);
        if (res.success && res.verify.valid) {
            document.getElementById('archiveVerifyStatus').innerHTML = '<span class="text-success">Archive is valid.</span>';
        } else {
            document.getElementById('archiveVerifyStatus').innerHTML = `<span class="text-danger">Invalid: ${res.verify?.error || res.error}</span>`;
        }
    } catch (err) {
        document.getElementById('archiveVerifyError').textContent = err.message;
    }
});
// ... existing code ...

// ... existing code ...
// === Plugin Manager UI Logic ===
document.getElementById('openPluginManagerBtn')?.addEventListener('click', () => {
    clearPluginManagerUI();
    loadPluginManagerList();
    new bootstrap.Modal(document.getElementById('pluginManagerModal')).show();
});
document.getElementById('refreshPluginManagerBtn')?.addEventListener('click', loadPluginManagerList);

document.getElementById('importPluginBtn')?.addEventListener('click', () => {
    document.getElementById('importPluginFileInput').click();
});
document.getElementById('importPluginFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        // Save to temp and import via backend
        const tempPath = './plugins/_import_' + file.name;
        await window.electron.fsWriteFile(tempPath, new Uint8Array(await file.arrayBuffer()));
        const res = await window.electron.modding.importPlugin(tempPath);
        if (res.success) {
            loadPluginManagerList();
        } else {
            showPluginManagerError(res.error || 'Failed to import plugin');
        }
    } catch (err) {
        showPluginManagerError(err.message);
    }
});

function clearPluginManagerUI() {
    document.getElementById('pluginManagerError').textContent = '';
    document.getElementById('pluginManagerTableBody').innerHTML = '';
}

async function loadPluginManagerList() {
    try {
        const plugins = await window.electron.modding.listPlugins();
        renderPluginManagerTable(plugins);
    } catch (err) {
        showPluginManagerError(err.message);
    }
}

// Enhance renderPluginManagerTable to show version, update, moderation status, and rating
function renderPluginManagerTable(plugins) {
    const tbody = document.getElementById('pluginManagerTableBody');
    tbody.innerHTML = '';
    if (!plugins || plugins.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-muted">No plugins installed.</td></tr>';
        return;
    }
    communityService.fetchMarketplacePlugins().then(marketPlugins => {
        for (const plugin of plugins) {
            const market = marketPlugins.find(p => p.id === plugin.id);
            const hasUpdate = market && market.version && plugin.version && market.version !== plugin.version;
            const moderation = market ? (market.moderationStatus || 'unknown') : 'unknown';
            const rating = market ? (market.rating ? market.rating.toFixed(1) : 'N/A') : 'N/A';
            const isReported = moderation === 'reported';
            const isPending = moderation === 'pending';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${plugin.name || plugin.id}</td>
                <td>${plugin.version || ''}</td>
                <td>${plugin.author || ''}</td>
                <td>${plugin.description || ''}</td>
                <td>${plugin.enabled === false ? '<span class="text-danger">Disabled</span>' : '<span class="text-success">Enabled</span>'}</td>
                <td><span title="${hasUpdate ? 'Update available from marketplace' : 'Up to date'}" class="${hasUpdate ? 'text-warning' : 'text-success'}">${hasUpdate ? 'Update Available' : 'Up to Date'}</span></td>
                <td><span title="Moderation status: ${moderation}" class="${moderation === 'approved' ? 'text-success' : moderation === 'reported' ? 'text-danger' : 'text-warning'}">
                    ${moderation.charAt(0).toUpperCase() + moderation.slice(1)}
                    ${isReported ? '<i class=\'fas fa-exclamation-triangle text-danger ms-1\' title=\'This plugin has been reported.\'></i>' : ''}
                    ${isPending ? '<i class=\'fas fa-hourglass-half text-warning ms-1\' title=\'This plugin is pending moderation.\'></i>' : ''}
                </span></td>
                <td><span title="User rating">${rating}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-secondary me-1" data-action="toggle" data-id="${plugin.id}">${plugin.enabled === false ? 'Enable' : 'Disable'}</button>
                    <button class="btn btn-sm btn-outline-info me-1" data-action="update" data-id="${plugin.id}" ${hasUpdate ? '' : 'disabled'} title="${hasUpdate ? 'Update to latest version' : 'No update available'}">Update</button>
                    <button class="btn btn-sm btn-outline-danger me-1" data-action="remove" data-id="${plugin.id}">Remove</button>
                    <button class="btn btn-sm btn-outline-warning" data-action="report" data-id="${plugin.id}" title="Report this plugin">Report</button>
                </td>
            `;
            tbody.appendChild(tr);
        }
        // Add event listeners for report buttons
        tbody.querySelectorAll('button[data-action="report"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const pluginId = btn.getAttribute('data-id');
                showReportPluginModal(pluginId);
            });
        });
    });
}

function showReportPluginModal(pluginId) {
    let modal = document.getElementById('reportPluginModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'reportPluginModal';
        modal.tabIndex = -1;
        modal.setAttribute('aria-labelledby', 'reportPluginModalLabel');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content bg-dark text-light">
                <div class="modal-header">
                    <h5 class="modal-title" id="reportPluginModalLabel">Report Plugin</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <label for="reportPluginReason">Reason/Description:</label>
                    <textarea id="reportPluginReason" class="form-control bg-dark text-light border-secondary" rows="3" placeholder="Describe the issue or reason for reporting this plugin."></textarea>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-warning" id="submitReportPluginBtn">Submit Report</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }
    document.getElementById('reportPluginReason').value = '';
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    document.getElementById('submitReportPluginBtn').onclick = async () => {
        const reason = document.getElementById('reportPluginReason').value.trim();
        if (!reason) {
            showError('Please enter a reason for reporting.');
            return;
        }
        showLoading();
        const ok = await communityService.reportPlugin(pluginId, reason);
        hideLoading();
        bsModal.hide();
        showToast(ok ? 'Report submitted.' : 'Failed to report plugin.', ok ? 'success' : 'error');
    };
}

document.getElementById('pluginManagerTableBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    try {
        if (action === 'toggle') {
            // Enable/disable plugin
            const plugins = await window.electron.modding.listPlugins();
            const plugin = plugins.find(p => p.id === id);
            if (plugin) {
                if (plugin.enabled === false) {
                    await window.electron.modding.enablePlugin(id);
                } else {
                    await window.electron.modding.disablePlugin(id);
                }
                loadPluginManagerList();
            }
        } else if (action === 'update') {
            await window.electron.modding.updatePlugin(id);
            loadPluginManagerList();
        } else if (action === 'remove') {
            await window.electron.modding.removePlugin(id);
            loadPluginManagerList();
        }
    } catch (err) {
        showPluginManagerError(err.message);
    }
});

function showPluginManagerError(msg) {
    document.getElementById('pluginManagerError').textContent = msg;
}
// ... existing code ...

// ... existing code ...
// === Community/Mods and Asset Sharing UI Logic ===
// Open modals from sidebar
const openCommunityModsBtn = document.getElementById('openCommunityModsBtn');
const openAssetSharingBtn = document.getElementById('openAssetSharingBtn');
openCommunityModsBtn?.addEventListener('click', () => {
    clearCommunityModsUI();
    loadCommunityModsList();
    new bootstrap.Modal(document.getElementById('communityModsModal')).show();
});
openAssetSharingBtn?.addEventListener('click', () => {
    clearAssetSharingUI();
    loadAssetSharingList();
    new bootstrap.Modal(document.getElementById('assetSharingModal')).show();
});

// Community Mods
function clearCommunityModsUI() {
    document.getElementById('communityModsSearchInput').value = '';
    document.getElementById('communityModsError').textContent = '';
    document.getElementById('communityModsList').innerHTML = '';
}
document.getElementById('communityModsSearchBtn').addEventListener('click', loadCommunityModsList);
document.getElementById('communityModsSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadCommunityModsList();
});
async function loadCommunityModsList() {
    const apiKey = localStorage.getItem('nexusApiKey') || '';
    const query = document.getElementById('communityModsSearchInput').value.trim();
    try {
        const res = await window.electron.community.browseMods(apiKey, query, 1);
        if (res.success) {
            renderCommunityModsList(res.mods);
        } else {
            document.getElementById('communityModsError').textContent = res.error;
        }
    } catch (err) {
        document.getElementById('communityModsError').textContent = err.message;
    }
}
function renderCommunityModsList(mods) {
    const container = document.getElementById('communityModsList');
    container.innerHTML = '';
    if (!mods || mods.length === 0) {
        container.innerHTML = '<div class="text-muted">No mods found.</div>';
        return;
    }
    mods.forEach(mod => {
        const col = document.createElement('div');
        col.className = 'col-6';
        col.innerHTML = `
            <div class="card h-100" tabindex="0" aria-label="${mod.name}">
                <div class="card-body p-2">
                    <h6 class="card-title mb-1" style="font-size:0.95em;">${mod.name}</h6>
                    <div class="small text-muted mb-1">by ${mod.author || 'Unknown'}</div>
                    <div class="mb-1">${mod.summary || ''}</div>
                    <button class="btn btn-sm btn-outline-info w-100 mod-details-btn" data-mod-id="${mod.mod_id}">Details</button>
                </div>
            </div>
        `;
        container.appendChild(col);
    });
    container.querySelectorAll('.mod-details-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const modId = btn.getAttribute('data-mod-id');
            showModDetailsModal(modId);
        });
    });
}
async function showModDetailsModal(modId) {
    // For demo, just show modId; in real use, fetch details from backend
    const apiKey = localStorage.getItem('nexusApiKey') || '';
    const res = await window.electron.community.browseMods(apiKey, '', 1);
    const mod = res.mods.find(m => m.mod_id == modId);
    const body = document.getElementById('modDetailsBody');
    if (!mod) {
        body.innerHTML = '<div class="text-danger">Mod not found.</div>';
    } else {
        body.innerHTML = `
            <h5>${mod.name}</h5>
            <div class="mb-2">by ${mod.author || 'Unknown'}</div>
            <div class="mb-2">${mod.summary || ''}</div>
            <div class="mb-2">Version: ${mod.version || ''}</div>
            <div class="mb-2">Downloads: ${mod.downloads || 0}</div>
            <div class="mb-2">Endorsements: ${mod.endorsements || 0}</div>
            <button class="btn btn-outline-success mb-2" id="downloadModBtn">Download</button>
            <div class="mb-2">
                <label>Rate:</label>
                <select id="rateModSelect" class="form-select form-select-sm w-auto d-inline-block ms-2">
                    <option value="">Select</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                </select>
                <button class="btn btn-sm btn-outline-primary ms-2" id="rateModBtn">Rate</button>
            </div>
        `;
        document.getElementById('downloadModBtn').onclick = async () => {
            const destDir = await selectDirectory('Select Download Directory');
            if (!destDir) return;
            const downloadRes = await window.electron.community.downloadMod(apiKey, mod.mod_id, destDir);
            if (downloadRes.success) showToast('Mod downloaded: ' + downloadRes.file, 'success');
            else showError(downloadRes.error || 'Download failed');
        };
        document.getElementById('rateModBtn').onclick = async () => {
            const rating = parseInt(document.getElementById('rateModSelect').value, 10);
            if (!rating) return;
            const rateRes = await window.electron.community.rateMod(apiKey, mod.mod_id, rating);
            if (rateRes.success) showToast('Mod rated!', 'success');
            else showError(rateRes.error || 'Rating failed');
        };
    }
    new bootstrap.Modal(document.getElementById('modDetailsModal')).show();
}

// Asset Sharing
function clearAssetSharingUI() {
    document.getElementById('assetSharingSearchInput').value = '';
    document.getElementById('assetSharingError').textContent = '';
    document.getElementById('assetSharingList').innerHTML = '';
}
document.getElementById('assetSharingSearchBtn').addEventListener('click', loadAssetSharingList);
document.getElementById('assetSharingSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadAssetSharingList();
});
async function loadAssetSharingList() {
    try {
        const res = await window.electron.community.browseAssets(document.getElementById('assetSharingSearchInput').value.trim(), 1);
        if (res.success) {
            renderAssetSharingList(res.assets);
        } else {
            document.getElementById('assetSharingError').textContent = res.error;
        }
    } catch (err) {
        document.getElementById('assetSharingError').textContent = err.message;
    }
}
function renderAssetSharingList(assets) {
    const container = document.getElementById('assetSharingList');
    container.innerHTML = '';
    if (!assets || assets.length === 0) {
        container.innerHTML = '<div class="text-muted">No assets found.</div>';
        return;
    }
    assets.forEach(asset => {
        const col = document.createElement('div');
        col.className = 'col-6';
        col.innerHTML = `
            <div class="card h-100" tabindex="0" aria-label="${asset.name}">
                <div class="card-body p-2">
                    <h6 class="card-title mb-1" style="font-size:0.95em;">${asset.name}</h6>
                    <div class="small text-muted mb-1">${asset.author || ''}</div>
                    <div class="mb-1">${asset.description || ''}</div>
                    <div class="mb-1">Tags: ${(asset.tags || []).join(', ')}</div>
                    <a href="${asset.downloadUrl || '#'}" class="btn btn-sm btn-outline-success w-100" target="_blank">Download</a>
                </div>
            </div>
        `;
        container.appendChild(col);
    });
}
document.getElementById('openAssetUploadModalBtn').addEventListener('click', () => {
    clearAssetUploadUI();
    new bootstrap.Modal(document.getElementById('assetUploadModal')).show();
});
function clearAssetUploadUI() {
    document.getElementById('assetUploadFile').value = '';
    document.getElementById('assetUploadName').value = '';
    document.getElementById('assetUploadDesc').value = '';
    document.getElementById('assetUploadTags').value = '';
    document.getElementById('assetUploadError').textContent = '';
}
document.getElementById('assetUploadSubmitBtn').addEventListener('click', async () => {
    const file = document.getElementById('assetUploadFile').files[0];
    const name = document.getElementById('assetUploadName').value.trim();
    const description = document.getElementById('assetUploadDesc').value.trim();
    const tags = document.getElementById('assetUploadTags').value.split(',').map(t => t.trim()).filter(Boolean);
    if (!file || !name || !description) {
        document.getElementById('assetUploadError').textContent = 'All fields are required.';
        return;
    }
    try {
        const apiKey = localStorage.getItem('communityApiKey') || '';
        const tempPath = './output/_temp_upload_' + file.name;
        await window.electron.fsWriteFile(tempPath, new Uint8Array(await file.arrayBuffer()));
        const res = await window.electron.community.uploadAsset(apiKey, tempPath, { name, description, tags });
        if (res.success) {
            showToast('Asset uploaded!', 'success');
            loadAssetSharingList();
            bootstrap.Modal.getInstance(document.getElementById('assetUploadModal')).hide();
        } else {
            document.getElementById('assetUploadError').textContent = res.error;
        }
    } catch (err) {
        document.getElementById('assetUploadError').textContent = err.message;
    }
});
// ... existing code ...

// ... existing code ...
// === Asset Manager UI Logic ===
document.getElementById('openAssetManagerBtn')?.addEventListener('click', () => {
    clearAssetManagerUI();
    loadAssetManagerList();
    new bootstrap.Modal(document.getElementById('assetManagerModal')).show();
});
document.getElementById('assetManagerSearchBtn').addEventListener('click', loadAssetManagerList);
document.getElementById('assetManagerSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadAssetManagerList();
});
document.getElementById('assetManagerTypeFilter').addEventListener('change', loadAssetManagerList);
document.getElementById('assetManagerTagFilter').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadAssetManagerList();
});

function clearAssetManagerUI() {
    document.getElementById('assetManagerSearchInput').value = '';
    document.getElementById('assetManagerTypeFilter').value = '';
    document.getElementById('assetManagerTagFilter').value = '';
    document.getElementById('assetManagerError').textContent = '';
    document.getElementById('assetManagerList').innerHTML = '';
    document.getElementById('assetManagerPreview').innerHTML = '';
    document.getElementById('assetManagerGraphContainer').style.display = 'none';
    document.getElementById('assetManagerGraph').innerHTML = '';
}

async function loadAssetManagerList() {
    try {
        const query = {
            name: document.getElementById('assetManagerSearchInput').value.trim(),
            type: document.getElementById('assetManagerTypeFilter').value,
            tags: document.getElementById('assetManagerTagFilter').value.split(',').map(t => t.trim()).filter(Boolean)
        };
        const res = await window.electron.asset.searchAssets(query);
        if (res.success) {
            renderAssetManagerList(res.assets);
        } else {
            document.getElementById('assetManagerError').textContent = res.error;
        }
    } catch (err) {
        document.getElementById('assetManagerError').textContent = err.message;
    }
}

function renderAssetManagerList(assets) {
    const container = document.getElementById('assetManagerList');
    container.innerHTML = '';
    if (!assets || assets.length === 0) {
        container.innerHTML = '<div class="text-muted">No assets found.</div>';
        return;
    }
    assets.forEach(asset => {
        const div = document.createElement('div');
        div.className = 'asset-list-item border-bottom py-2 d-flex align-items-center';
        div.innerHTML = `
            <input type="checkbox" class="form-check-input me-2 asset-batch-checkbox" data-path="${asset.path}">
            <span class="me-2">${asset.type}</span>
            <span class="me-2">${asset.tags && asset.tags.length ? '[' + asset.tags.join(', ') + ']' : ''}</span>
            <span class="flex-grow-1">${asset.path}</span>
            <button class="btn btn-sm btn-outline-info ms-2 asset-preview-btn" data-path="${asset.path}">Preview</button>
            <button class="btn btn-sm btn-outline-success ms-2 asset-tag-btn" data-path="${asset.path}">Tag</button>
        `;
        container.appendChild(div);
    });
    container.querySelectorAll('.asset-preview-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const path = btn.getAttribute('data-path');
            const res = await window.electron.asset.getAssetPreview(path);
            if (res.success) renderAssetManagerPreview(path, res.preview);
            else document.getElementById('assetManagerPreview').innerHTML = '<div class="text-danger">Preview error: ' + res.error + '</div>';
        });
    });
    container.querySelectorAll('.asset-tag-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const path = btn.getAttribute('data-path');
            const tags = prompt('Enter tags (comma separated):');
            if (!tags) return;
            const tagArr = tags.split(',').map(t => t.trim()).filter(Boolean);
            const res = await window.electron.asset.tagAsset(path, tagArr);
            if (res.success) loadAssetManagerList();
            else document.getElementById('assetManagerError').textContent = res.error;
        });
    });
}

function renderAssetManagerPreview(path, preview) {
    const ext = path.split('.').pop().toLowerCase();
    const container = document.getElementById('assetManagerPreview');
    if (["png", "jpg", "jpeg", "dds", "tga", "xbm"].includes(ext)) {
        container.innerHTML = `<img src="${preview}" alt="Preview" class="img-fluid rounded">`;
    } else if (["txt", "js", "lua", "reds", "json"].includes(ext)) {
        container.innerHTML = `<pre class="bg-dark text-light p-2 rounded" style="max-height:320px;overflow:auto;">${preview}</pre>`;
    } else {
        container.innerHTML = `<div class="text-muted">${preview}</div>`;
    }
}

document.getElementById('assetManagerBatchTagBtn').addEventListener('click', async () => {
    const checked = Array.from(document.querySelectorAll('.asset-batch-checkbox:checked')).map(cb => cb.getAttribute('data-path'));
    if (!checked.length) {
        document.getElementById('assetManagerError').textContent = 'Select assets to batch tag.';
        return;
    }
    const tags = prompt('Enter tags to add (comma separated):');
    if (!tags) return;
    const tagArr = tags.split(',').map(t => t.trim()).filter(Boolean);
    const res = await window.electron.asset.batchTagAssets(checked, tagArr);
    if (res.success) loadAssetManagerList();
    else document.getElementById('assetManagerError').textContent = res.error;
});

document.getElementById('assetManagerShowGraphBtn').addEventListener('click', async () => {
    const res = await window.electron.asset.getDependencyGraph();
    if (res.success) renderAssetManagerGraph(res.graph);
    else document.getElementById('assetManagerError').textContent = res.error;
});

function renderAssetManagerGraph(graph) {
    const container = document.getElementById('assetManagerGraphContainer');
    const graphDiv = document.getElementById('assetManagerGraph');
    container.style.display = '';
    graphDiv.innerHTML = '';
    // Try to use vis.js if available
    if (window.vis && window.vis.Network) {
        const nodes = new window.vis.DataSet(graph.nodes);
        const edges = new window.vis.DataSet(graph.edges);
        new window.vis.Network(graphDiv, { nodes, edges }, {
            nodes: { shape: 'dot', size: 12, font: { color: '#fff' }, color: { background: '#0ff', border: '#00f' } },
            edges: { color: { color: '#ff0' } },
            layout: { improvedLayout: true },
            physics: { enabled: true }
        });
    } else {
        // Fallback: render as a list
        graphDiv.innerHTML = '<ul>' + graph.edges.map(e => `<li>${e.from} → ${e.to}</li>`).join('') + '</ul>';
    }
}
// ... existing code ...

// ... existing code ...
// === Voice Model Manager UI Logic ===
document.getElementById('openVoiceModelManagerBtn')?.addEventListener('click', () => {
    clearVoiceModelManagerUI();
    loadVoiceModelManagerList();
    new bootstrap.Modal(document.getElementById('voiceModelManagerModal')).show();
});
document.getElementById('importVoiceModelBtn')?.addEventListener('click', () => {
    document.getElementById('importVoiceModelFileInput').click();
});
document.getElementById('importVoiceModelFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const tempPath = './voice_models/_import_' + file.name;
        await window.electron.fsWriteFile(tempPath, new Uint8Array(await file.arrayBuffer()));
        const ok = await window.electron.voiceModel.import({ file: tempPath, type: 'cybervoice' });
        if (ok.success) loadVoiceModelManagerList();
        else showVoiceModelManagerError(ok.error || 'Import failed');
    } catch (err) {
        showVoiceModelManagerError(err.message);
    }
});
document.getElementById('importElevenLabsModelBtn')?.addEventListener('click', async () => {
    const voiceId = prompt('Enter ElevenLabs voice_id:');
    const name = prompt('Enter a name for this model:');
    if (!voiceId || !name) return;
    try {
        const ok = await window.electron.voiceModel.import({ type: 'elevenlabs', voice_id: voiceId, name });
        if (ok.success) loadVoiceModelManagerList();
        else showVoiceModelManagerError(ok.error || 'Import failed');
    } catch (err) {
        showVoiceModelManagerError(err.message);
    }
});

function clearVoiceModelManagerUI() {
    document.getElementById('voiceModelManagerError').textContent = '';
    document.getElementById('voiceModelManagerTableBody').innerHTML = '';
    document.getElementById('voiceModelSelector').innerHTML = '';
}

async function loadVoiceModelManagerList() {
    try {
        const res = await window.electron.voiceModel.list();
        if (res.success) {
            renderVoiceModelManagerTable(res.models);
            renderVoiceModelSelector(res.models);
        } else {
            showVoiceModelManagerError(res.error);
        }
    } catch (err) {
        showVoiceModelManagerError(err.message);
    }
}

function renderVoiceModelManagerTable(models) {
    const tbody = document.getElementById('voiceModelManagerTableBody');
    tbody.innerHTML = '';
    if (!models || models.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-muted">No models available.</td></tr>';
        return;
    }
    for (const model of models) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${model.name}</td>
            <td>${model.type}</td>
            <td>${model.source}</td>
            <td><button class="btn btn-sm btn-outline-info" data-action="select" data-id="${model.id}">Select</button></td>
        `;
        tbody.appendChild(tr);
    }
    tbody.querySelectorAll('button[data-action="select"]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('voiceModelSelector').value = btn.getAttribute('data-id');
        });
    });
}

function renderVoiceModelSelector(models) {
    const selector = document.getElementById('voiceModelSelector');
    selector.innerHTML = '';
    for (const model of models) {
        const opt = document.createElement('option');
        opt.value = model.id;
        opt.textContent = `${model.name} (${model.source})`;
        selector.appendChild(opt);
    }
    // Set current model as selected if available
    const current = localStorage.getItem('activeVoiceModel');
    if (current) selector.value = current;
    selector.addEventListener('change', () => {
        localStorage.setItem('activeVoiceModel', selector.value);
    });
}

function showVoiceModelManagerError(msg) {
    document.getElementById('voiceModelManagerError').textContent = msg;
}
// ... existing code ...

// Helper modals for AI results
function showNPCResultModal(npc) {
    let html = `<div><strong>NPC Data:</strong><pre>${JSON.stringify(npc.npcData || npc, null, 2)}</pre></div>`;
    if (npc.files) {
        html += '<div class="mt-2"><strong>Files:</strong>';
        if (npc.files.appearance) html += `<div><a href="${npc.files.appearance}" download>Download Appearance (.app)</a></div>`;
        if (npc.files.entity) html += `<div><a href="${npc.files.entity}" download>Download Entity (.ent)</a></div>`;
        html += '</div>';
    }
    showModal('NPC Profile Generated', html);
}
function showQuestResultModal(quest) {
    let html = `<div><strong>Quest Data:</strong><pre>${JSON.stringify(quest, null, 2)}</pre></div>`;
    showModal('Quest Generated', html);
}
function showDialogueResultModal(dialoguePath) {
    let html = `<div><strong>Dialogue File:</strong><div><a href="${dialoguePath}" download>Download Dialogue JSON</a></div></div>`;
    showModal('Dialogue Expanded', html);
}
function showTranslationResultModal(translation) {
    let html = `<div><strong>Translation:</strong><pre>${translation}</pre><button class="btn btn-sm btn-outline-info mt-2" onclick="navigator.clipboard.writeText(\`${translation.replace(/`/g, '\`')}\`);showToast('Copied!','success');">Copy</button></div>`;
    showModal('Dialogue Translated', html);
}
function showModal(title, bodyHtml) {
    let modal = document.getElementById('aiResultModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'aiResultModal';
        modal.tabIndex = -1;
        modal.setAttribute('aria-labelledby', 'aiResultModalLabel');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content bg-dark text-light">
                <div class="modal-header">
                    <h5 class="modal-title" id="aiResultModalLabel"></h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body" id="aiResultModalBody"></div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }
    document.getElementById('aiResultModalLabel').textContent = title;
    document.getElementById('aiResultModalBody').innerHTML = bodyHtml;
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
}
// ... existing code ...

// ... existing code ...
// Helper modals for AI results
function showVoiceResultModal(files) {
    let html = '<div><strong>Generated Voice Files:</strong>';
    for (const [key, val] of Object.entries(files)) {
        if (val && typeof val === 'string' && (val.endsWith('.mp3') || val.endsWith('.wav') || val.endsWith('.wem'))) {
            html += `<div><a href="${val}" download>${key} (${val.split('.').pop()})</a>`;
            if (val.endsWith('.mp3') || val.endsWith('.wav')) {
                html += `<audio controls src="${val}" style="max-width:100%"></audio>`;
            }
            html += '</div>';
        }
    }
    html += '</div>';
    showModal('Voice Generated', html);
}
function showImageResultModal(files) {
    let html = '<div><strong>Generated Images:</strong>';
    for (const [key, val] of Object.entries(files)) {
        if (val && typeof val === 'string' && (val.endsWith('.png') || val.endsWith('.jpg') || val.endsWith('.jpeg') || val.endsWith('.xbm'))) {
            if (val.endsWith('.png') || val.endsWith('.jpg') || val.endsWith('.jpeg')) {
                html += `<div><img src="${val}" alt="${key}" style="max-width:100%;border-radius:4px;"/><br>`;
            }
            html += `<a href="${val}" download>${key} (${val.split('.').pop()})</a></div>`;
        }
    }
    html += '</div>';
    showModal('Image Generated', html);
}
function showAudioResultModal(file, label) {
    let html = `<div><strong>${label}:</strong><div><a href="${file}" download>Download</a></div>`;
    if (file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.ogg')) {
        html += `<audio controls src="${file}" style="max-width:100%"></audio>`;
    }
    html += '</div>';
    showModal(label + ' Generated', html);
}
function showTagsResultModal(tags) {
    let html = `<div><strong>Tags:</strong> ${Array.isArray(tags) ? tags.join(', ') : tags}</div>`;
    showModal('Auto-Tagging Result', html);
}
function showSmartSearchResultModal(results) {
    let html = `<div><strong>Smart Search Results:</strong><pre>${results}</pre></div>`;
    showModal('Smart Search', html);
}
function showAssistantResultModal(response) {
    let html = `<div><strong>Assistant Response:</strong><pre>${response}</pre><button class=\"btn btn-sm btn-outline-info mt-2\" onclick=\"navigator.clipboard.writeText(\`${response.replace(/`/g, '\`')}\`);showToast('Copied!','success');\">Copy</button></div>`;
    showModal('AI Assistant', html);
}
function showDownloadResultModal(file, label) {
    let html = `<div><strong>${label}:</strong><div><a href="${file}" download>Download</a></div></div>`;
    showModal(label + ' Generated', html);
}
// Procedural content helpers
async function handleProceduralResult(result, label) {
    if (result && result.success && result.file) {
        let html = `<div><strong>${label} File:</strong><div><a href=\"${result.file}\" download>Download</a></div>`;
        try {
            const resp = await window.electron.fs.readFile(result.file);
            if (resp.success && resp.data) {
                const text = new TextDecoder().decode(resp.data);
                html += `<pre style='max-height:300px;overflow:auto;'>${text}</pre>`;
            }
        } catch {}
        html += '</div>';
        showModal(label + ' Generated', html);
    } else {
        showError(result.message || label + ' generation failed');
    }
}
window.generateCityBlock = async function(prompt) {
    try {
        showLoading();
        const result = await window.electron.ai.generateCityBlock({ prompt });
        hideLoading();
        await handleProceduralResult(result, 'City Block');
    } catch (err) {
        hideLoading();
        showError('City block generation failed: ' + (err.message || err));
    }
};
window.generateNPCCrowd = async function(prompt) {
    try {
        showLoading();
        const result = await window.electron.ai.generateNPCCrowd({ prompt });
        hideLoading();
        await handleProceduralResult(result, 'NPC Crowd');
    } catch (err) {
        hideLoading();
        showError('NPC crowd generation failed: ' + (err.message || err));
    }
};
// ... existing code ...

document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    renderPluginToolPanels();
});

async function renderPluginToolPanels() {
    let sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    let section = document.getElementById('pluginToolPanelsSection');
    if (!section) {
        section = document.createElement('div');
        section.className = 'sidebar-section';
        section.id = 'pluginToolPanelsSection';
        section.innerHTML = '<h3><i class="fas fa-puzzle-piece"></i> Plugin Tool Panels <button class="btn btn-sm btn-outline-secondary ms-2" id="refreshPluginPanelsBtn" title="Refresh"><i class="fas fa-sync"></i></button></h3><div id="pluginPanelsContainer"></div>';
        sidebar.appendChild(section);
    }
    const container = section.querySelector('#pluginPanelsContainer');
    container.innerHTML = '<div class="text-muted">Loading plugin panels...</div>';
    try {
        const res = await window.electron.pluginEngine.getToolPanels();
        if (!res.success || !res.panels || !res.panels.length) {
            container.innerHTML = '<div class="text-muted">No plugin tool panels registered.</div>';
            return;
        }
        container.innerHTML = '';
        for (const panel of res.panels) {
            const panelDiv = document.createElement('div');
            panelDiv.className = 'plugin-tool-panel mb-3 p-2 bg-dark border rounded';
            panelDiv.setAttribute('data-panel-id', panel.id);
            let html = '';
            if (panel.template) {
                html = panel.template;
            } else if (panel.component && panel.component.template) {
                html = panel.component.template;
            } else {
                html = `<div class='text-muted'>No template for panel: ${panel.name}</div>`;
            }
            panelDiv.innerHTML = `<div class='fw-bold mb-1'>${panel.name}</div>` + html;
            container.appendChild(panelDiv);
        }
    } catch (err) {
        container.innerHTML = `<div class="text-danger">Failed to load plugin panels: ${err.message}</div>`;
    }
    // Refresh button
    section.querySelector('#refreshPluginPanelsBtn').onclick = renderPluginToolPanels;
}
// ... existing code ...

// ... existing code ...
// Listen for global errors from the main process
if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.on('app:error', (event, data) => {
        showError(data.message + (data.stack ? ('\n' + data.stack) : ''));
    });
}
// ... existing code ...

// ... existing code ...
import * as communityService from './communityService.js';
// ... existing code ...

// === Plugin Marketplace Integration ===
let marketplacePlugins = [];

async function showMarketplaceModal() {
    showLoading();
    marketplacePlugins = await communityService.fetchMarketplacePlugins();
    hideLoading();
    const modalBody = document.getElementById('pluginDetailsBody');
    if (!marketplacePlugins.length) {
        modalBody.innerHTML = '<div class="text-muted">No plugins found in the marketplace.</div>';
    } else {
        modalBody.innerHTML = marketplacePlugins.map(p => `
            <div class="market-plugin-item mb-3 p-2 bg-dark rounded">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${p.name}</strong> <span class="badge bg-secondary">v${p.version}</span><br>
                        <span class="text-muted small">by ${p.author || 'Unknown'}</span>
                    </div>
                    <button class="btn btn-sm btn-outline-primary" data-action="install" data-plugin-id="${p.id}" aria-label="Install ${p.name}" title="Install Plugin">Install</button>
                </div>
                <div class="mt-1 small">${p.description || ''}</div>
                <div class="mt-1 small">Permissions: <span class="text-warning">${(p.permissions||[]).join(', ')||'None'}</span></div>
                <div class="mt-1 small">Rating: <span class="text-info">${p.rating ? p.rating.toFixed(1) : 'N/A'}</span></div>
                <div class="mt-1">
                    <button class="btn btn-xs btn-outline-success me-1" data-action="rate" data-plugin-id="${p.id}" aria-label="Rate ${p.name}" title="Rate Plugin">Rate</button>
                    <button class="btn btn-xs btn-outline-danger" data-action="report" data-plugin-id="${p.id}" aria-label="Report ${p.name}" title="Report Plugin">Report</button>
                </div>
            </div>
        `).join('');
    }
    const modal = new bootstrap.Modal(document.getElementById('pluginDetailsModal'));
    modal.show();
    // Add event listeners for install, rate, report
    modalBody.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const action = btn.getAttribute('data-action');
            const pluginId = btn.getAttribute('data-plugin-id');
            if (action === 'install') {
                showLoading();
                const pluginBuffer = await communityService.downloadPluginFile(pluginId);
                if (pluginBuffer) {
                    // Save to plugins/ and trigger refresh
                    await window.electron.invoke('modding:installPluginBuffer', pluginId, pluginBuffer);
                    showToast('Plugin installed!', 'success');
                    await refreshPluginList();
                } else {
                    showToast('Failed to download plugin.', 'error');
                }
                hideLoading();
            } else if (action === 'rate') {
                const rating = prompt('Enter rating (1-5):');
                if (rating && Number(rating) >= 1 && Number(rating) <= 5) {
                    showLoading();
                    const ok = await communityService.ratePlugin(pluginId, Number(rating));
                    showToast(ok ? 'Thank you for rating!' : 'Failed to rate plugin.', ok ? 'success' : 'error');
                    hideLoading();
                }
            } else if (action === 'report') {
                const reason = prompt('Describe the issue or reason for reporting this plugin:');
                if (reason) {
                    showLoading();
                    const ok = await communityService.reportPlugin(pluginId, reason);
                    showToast(ok ? 'Report submitted.' : 'Failed to report plugin.', ok ? 'success' : 'error');
                    hideLoading();
                }
            }
        });
    });
}

// Wire up marketplace UI buttons
const installPluginBtn = document.getElementById('installPlugin');
if (installPluginBtn) {
    installPluginBtn.addEventListener('click', showMarketplaceModal);
    installPluginBtn.setAttribute('title', 'Browse and install plugins from the marketplace');
}
const refreshPluginsBtn = document.getElementById('refreshPlugins');
if (refreshPluginsBtn) {
    refreshPluginsBtn.addEventListener('click', refreshPluginList);
    refreshPluginsBtn.setAttribute('title', 'Refresh installed plugin list');
}
// ... existing code ...

// ... existing code ...
// === Plugin Update Notification ===
let pluginUpdateNotified = false;
async function checkPluginUpdatesAndNotify() {
    if (pluginUpdateNotified) return;
    try {
        const [installed, market] = await Promise.all([
            window.electron.invoke('modding:listPlugins'),
            communityService.fetchMarketplacePlugins()
        ]);
        const updates = installed.filter(inst => {
            const m = market.find(mp => mp.id === inst.id);
            return m && m.version && inst.version && m.version !== inst.version;
        });
        if (updates.length) {
            pluginUpdateNotified = true;
            const names = updates.map(u => u.name || u.id).join(', ');
            showToast(`Plugin update available: ${names}. <button class='btn btn-sm btn-outline-info ms-2' onclick='openPluginManagerFromToast()'>Open Plugin Manager</button>`, 'warning');
        }
    } catch {}
}
window.openPluginManagerFromToast = function() {
    document.getElementById('openPluginManagerBtn')?.click();
};
// Call on app load and after plugin list refresh
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(checkPluginUpdatesAndNotify, 2000);
} else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(checkPluginUpdatesAndNotify, 2000));
}
const origRefreshPluginList = refreshPluginList;
refreshPluginList = async function() {
    await origRefreshPluginList();
    checkPluginUpdatesAndNotify();
};
// ... existing code ...

// ... existing code ...
// === User Profile & Collections Logic ===

// User Profile
function loadUserProfile() {
    const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');
    document.getElementById('userNameInput').value = profile.username || '';
    document.getElementById('userEmailInput').value = profile.email || '';
    document.getElementById('userPreferencesInput').value = profile.preferences || '';
}
function saveUserProfile() {
    const profile = {
        username: document.getElementById('userNameInput').value.trim(),
        email: document.getElementById('userEmailInput').value.trim(),
        preferences: document.getElementById('userPreferencesInput').value.trim(),
    };
    localStorage.setItem('userProfile', JSON.stringify(profile));
    showToast('Profile saved', 'success');
    bootstrap.Modal.getInstance(document.getElementById('userProfileModal')).hide();
}
document.getElementById('openUserProfileBtn').addEventListener('click', () => {
    loadUserProfile();
    new bootstrap.Modal(document.getElementById('userProfileModal')).show();
});
document.getElementById('saveUserProfileBtn').addEventListener('click', saveUserProfile);

// Plugin Collections
function loadCollections() {
    return JSON.parse(localStorage.getItem('pluginCollections') || '[]');
}
function saveCollections(collections) {
    localStorage.setItem('pluginCollections', JSON.stringify(collections));
}
function renderCollections() {
    const collections = loadCollections();
    const list = document.getElementById('collectionsList');
    list.innerHTML = '';
    if (collections.length === 0) {
        list.innerHTML = '<div class="text-muted">No collections yet.</div>';
        return;
    }
    for (const col of collections) {
        const div = document.createElement('div');
        div.className = 'mb-2';
        div.innerHTML = `<strong>${col.name}</strong> <span class='badge bg-secondary'>${col.plugins.length} plugins</span> <button class='btn btn-sm btn-outline-danger ms-2' title='Delete collection' aria-label='Delete collection' data-col='${col.name}'>Delete</button>`;
        // List plugins in collection
        if (col.plugins.length > 0) {
            div.innerHTML += '<ul class="list-group list-group-flush">' + col.plugins.map(p => `<li class="list-group-item bg-dark text-light d-flex justify-content-between align-items-center">${p}<button class='btn btn-sm btn-outline-danger ms-2' title='Remove plugin' aria-label='Remove plugin' data-col='${col.name}' data-plugin='${p}'>Remove</button></li>`).join('') + '</ul>';
        }
        list.appendChild(div);
    }
    // Delete collection
    list.querySelectorAll('button[title="Delete collection"]').forEach(btn => {
        btn.onclick = e => {
            const name = btn.getAttribute('data-col');
            let collections = loadCollections();
            collections = collections.filter(c => c.name !== name);
            saveCollections(collections);
            renderCollections();
            showToast('Collection deleted', 'success');
        };
    });
    // Remove plugin from collection
    list.querySelectorAll('button[title="Remove plugin"]').forEach(btn => {
        btn.onclick = e => {
            const name = btn.getAttribute('data-col');
            const plugin = btn.getAttribute('data-plugin');
            let collections = loadCollections();
            const col = collections.find(c => c.name === name);
            if (col) {
                col.plugins = col.plugins.filter(p => p !== plugin);
                saveCollections(collections);
                renderCollections();
                showToast('Plugin removed from collection', 'success');
            }
        };
    });
}
document.getElementById('openCollectionsBtn').addEventListener('click', () => {
    renderCollections();
    new bootstrap.Modal(document.getElementById('collectionsModal')).show();
});
document.getElementById('addCollectionBtn').addEventListener('click', () => {
    const name = document.getElementById('newCollectionName').value.trim();
    if (!name) {
        showToast('Collection name required', 'warning');
        return;
    }
    let collections = loadCollections();
    if (collections.some(c => c.name === name)) {
        showToast('Collection already exists', 'warning');
        return;
    }
    collections.push({ name, plugins: [] });
    saveCollections(collections);
    document.getElementById('newCollectionName').value = '';
    renderCollections();
    showToast('Collection added', 'success');
});
// Add/remove plugin to/from collection (to be called from plugin manager, e.g.)
window.addPluginToCollection = function(pluginId, collectionName) {
    let collections = loadCollections();
    const col = collections.find(c => c.name === collectionName);
    if (col && !col.plugins.includes(pluginId)) {
        col.plugins.push(pluginId);
        saveCollections(collections);
        showToast('Plugin added to collection', 'success');
        renderCollections();
    }
};
window.removePluginFromCollection = function(pluginId, collectionName) {
    let collections = loadCollections();
    const col = collections.find(c => c.name === collectionName);
    if (col) {
        col.plugins = col.plugins.filter(p => p !== pluginId);
        saveCollections(collections);
        showToast('Plugin removed from collection', 'success');
        renderCollections();
    }
};
// ... existing code ...

// ... existing code ...
// === Plugin & Mod Rating/Comment Logic ===

// Utility to render star rating UI
function renderStarRating(container, current, onRate) {
    container.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
        const star = document.createElement('i');
        star.className = 'fa-star fa-lg me-1 ' + (i <= current ? 'fas text-warning' : 'far text-secondary');
        star.setAttribute('role', 'button');
        star.setAttribute('tabindex', '0');
        star.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}`);
        star.title = `${i} star${i > 1 ? 's' : ''}`;
        if (onRate) {
            star.onclick = () => onRate(i);
            star.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') onRate(i); };
        }
        container.appendChild(star);
    }
}

// Plugin Rating/Comments
let currentPluginId = null;
async function showPluginRatingSection(pluginId) {
    currentPluginId = pluginId;
    // Fetch average rating and comments
    document.getElementById('pluginAverageRating').textContent = 'Loading...';
    document.getElementById('pluginCommentsList').innerHTML = '<div class="text-muted">Loading...</div>';
    let avg = 0, userRating = 0, comments = [];
    try {
        // Fetch from backend (mocked for now)
        // TODO: Replace with real API calls
        avg = 4.2; // await communityService.getPluginAverageRating(pluginId);
        userRating = 0; // await communityService.getUserPluginRating(pluginId);
        comments = []; // await communityService.getPluginComments(pluginId);
    } catch (e) {
        document.getElementById('pluginAverageRating').textContent = 'Failed to load ratings';
    }
    document.getElementById('pluginAverageRating').textContent = `Average: ${avg.toFixed(2)}/5`;
    renderStarRating(document.getElementById('pluginRatingStars'), userRating, async (rating) => {
        try {
            await communityService.ratePlugin(pluginId, rating);
            showToast('Rating submitted', 'success');
            showPluginRatingSection(pluginId);
        } catch (e) {
            showToast('Failed to submit rating', 'error');
        }
    });
    // Render comments
    const list = document.getElementById('pluginCommentsList');
    list.innerHTML = comments.length === 0 ? '<div class="text-muted">No comments yet.</div>' : comments.map(c => `<div class='border-bottom pb-1 mb-1'><strong>${c.user || 'User'}:</strong> ${c.text}</div>`).join('');
}
document.getElementById('submitPluginComment').addEventListener('click', async () => {
    const comment = document.getElementById('pluginCommentInput').value.trim();
    if (!comment) return showToast('Comment required', 'warning');
    try {
        // await communityService.commentPlugin(currentPluginId, comment);
        showToast('Comment submitted', 'success');
        document.getElementById('pluginCommentInput').value = '';
        showPluginRatingSection(currentPluginId);
    } catch (e) {
        showToast('Failed to submit comment', 'error');
    }
});
// Call showPluginRatingSection(pluginId) when a plugin is selected in the manager

// Mod Rating/Comments
let currentModId = null;
async function showModRatingSection(modId) {
    currentModId = modId;
    document.getElementById('modAverageRating').textContent = 'Loading...';
    document.getElementById('modCommentsList').innerHTML = '<div class="text-muted">Loading...</div>';
    let avg = 0, userRating = 0, comments = [];
    try {
        // Fetch from backend (mocked for now)
        // TODO: Replace with real API calls
        avg = 4.5; // await communityService.getModAverageRating(modId);
        userRating = 0; // await communityService.getUserModRating(modId);
        comments = []; // await communityService.getModComments(modId);
    } catch (e) {
        document.getElementById('modAverageRating').textContent = 'Failed to load ratings';
    }
    document.getElementById('modAverageRating').textContent = `Average: ${avg.toFixed(2)}/5`;
    renderStarRating(document.getElementById('modRatingStars'), userRating, async (rating) => {
        try {
            // await communityService.rateMod(null, modId, rating);
            showToast('Rating submitted', 'success');
            showModRatingSection(modId);
        } catch (e) {
            showToast('Failed to submit rating', 'error');
        }
    });
    // Render comments
    const list = document.getElementById('modCommentsList');
    list.innerHTML = comments.length === 0 ? '<div class="text-muted">No comments yet.</div>' : comments.map(c => `<div class='border-bottom pb-1 mb-1'><strong>${c.user || 'User'}:</strong> ${c.text}</div>`).join('');
}
document.getElementById('submitModComment').addEventListener('click', async () => {
    const comment = document.getElementById('modCommentInput').value.trim();
    if (!comment) return showToast('Comment required', 'warning');
    try {
        // await communityService.commentMod(null, currentModId, comment);
        showToast('Comment submitted', 'success');
        document.getElementById('modCommentInput').value = '';
        showModRatingSection(currentModId);
    } catch (e) {
        showToast('Failed to submit comment', 'error');
    }
});
// Call showModRatingSection(modId) when a mod is selected in the details modal
// ... existing code ...

// ... existing code ...
// === Author Profile Popover/Modal Logic ===

// Utility to show author profile modal
async function showAuthorProfile(username) {
    const modal = new bootstrap.Modal(document.getElementById('authorProfileModal'));
    const body = document.getElementById('authorProfileBody');
    body.innerHTML = '<div class="text-muted">Loading...</div>';
    // TODO: Fetch real user profile from backend
    setTimeout(() => {
        // Mocked user info
        body.innerHTML = `
            <div class='mb-2'><strong>Username:</strong> ${username}</div>
            <div class='mb-2'><strong>Email:</strong> (hidden)</div>
            <div class='mb-2'><strong>Collections:</strong> <span class='text-muted'>Not public</span></div>
            <div class='mb-2'><strong>Bio:</strong> <span class='text-muted'>No bio set.</span></div>
        `;
    }, 400);
    modal.show();
}
// Patch comment rendering to make author clickable
function renderCommentList(listElem, comments) {
    listElem.innerHTML = comments.length === 0 ? '<div class="text-muted">No comments yet.</div>' : comments.map(c => `<div class='border-bottom pb-1 mb-1'><a href='#' class='author-link' tabindex='0' data-username='${c.user || 'User'}' title='View profile'><strong>${c.user || 'User'}</strong></a>: ${c.text}</div>`).join('');
    // Add click handlers
    listElem.querySelectorAll('.author-link').forEach(link => {
        link.onclick = e => { e.preventDefault(); showAuthorProfile(link.getAttribute('data-username')); };
        link.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showAuthorProfile(link.getAttribute('data-username')); } };
    });
}
// Patch plugin/mod rating section logic to use renderCommentList
// Plugin
async function showPluginRatingSection(pluginId) {
    currentPluginId = pluginId;
    document.getElementById('pluginAverageRating').textContent = 'Loading...';
    document.getElementById('pluginCommentsList').innerHTML = '<div class="text-muted">Loading...</div>';
    let avg = 0, userRating = 0, comments = [];
    try {
        avg = 4.2;
        userRating = 0;
        comments = [ { user: 'Alice', text: 'Great plugin!' }, { user: 'Bob', text: 'Needs more features.' } ];
    } catch (e) {
        document.getElementById('pluginAverageRating').textContent = 'Failed to load ratings';
    }
    document.getElementById('pluginAverageRating').textContent = `Average: ${avg.toFixed(2)}/5`;
    renderStarRating(document.getElementById('pluginRatingStars'), userRating, async (rating) => {
        try {
            await communityService.ratePlugin(pluginId, rating);
            showToast('Rating submitted', 'success');
            showPluginRatingSection(pluginId);
        } catch (e) {
            showToast('Failed to submit rating', 'error');
        }
    });
    renderCommentList(document.getElementById('pluginCommentsList'), comments);
}
// Mod
async function showModRatingSection(modId) {
    currentModId = modId;
    document.getElementById('modAverageRating').textContent = 'Loading...';
    document.getElementById('modCommentsList').innerHTML = '<div class="text-muted">Loading...</div>';
    let avg = 0, userRating = 0, comments = [];
    try {
        avg = 4.5;
        userRating = 0;
        comments = [ { user: 'Alice', text: 'Awesome mod!' }, { user: 'Bob', text: 'Didn\'t work for me.' } ];
    } catch (e) {
        document.getElementById('modAverageRating').textContent = 'Failed to load ratings';
    }
    document.getElementById('modAverageRating').textContent = `Average: ${avg.toFixed(2)}/5`;
    renderStarRating(document.getElementById('modRatingStars'), userRating, async (rating) => {
        try {
            // await communityService.rateMod(null, modId, rating);
            showToast('Rating submitted', 'success');
            showModRatingSection(modId);
        } catch (e) {
            showToast('Failed to submit rating', 'error');
        }
    });
    renderCommentList(document.getElementById('modCommentsList'), comments);
}
// ... existing code ...

// ... existing code ...
// === Comment Reporting Logic ===
let reportContext = null;
function renderCommentList(listElem, comments, contextType, contextId) {
    listElem.innerHTML = comments.length === 0 ? '<div class="text-muted">No comments yet.</div>' : comments.map((c, idx) => `<div class='border-bottom pb-1 mb-1 d-flex justify-content-between align-items-center'><span><a href='#' class='author-link' tabindex='0' data-username='${c.user || 'User'}' title='View profile'><strong>${c.user || 'User'}</strong></a>: ${c.text}</span><span>${isAdmin ? `<button class='btn btn-sm btn-outline-danger ms-2 remove-comment-btn' title='Remove comment' aria-label='Remove comment' data-idx='${idx}'><i class='fas fa-trash'></i></button>` : ''}<button class='btn btn-sm btn-outline-danger ms-2 report-comment-btn' title='Report comment' aria-label='Report comment' data-idx='${idx}'><i class='fas fa-flag'></i></button></span></div>`).join('');
    // Add click handlers for author
    listElem.querySelectorAll('.author-link').forEach(link => {
        link.onclick = e => { e.preventDefault(); showAuthorProfile(link.getAttribute('data-username')); };
        link.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showAuthorProfile(link.getAttribute('data-username')); } };
    });
    // Add click handlers for report
    listElem.querySelectorAll('.report-comment-btn').forEach(btn => {
        btn.onclick = e => {
            const idx = btn.getAttribute('data-idx');
            reportContext = { contextType, contextId, comment: comments[idx] };
            document.getElementById('reportReasonInput').value = '';
            document.getElementById('reportDescriptionInput').value = '';
            new bootstrap.Modal(document.getElementById('reportCommentModal')).show();
        };
    });
    // Add click handlers for remove (admin)
    if (isAdmin) {
        listElem.querySelectorAll('.remove-comment-btn').forEach(btn => {
            btn.onclick = e => {
                const idx = btn.getAttribute('data-idx');
                comments.splice(idx, 1);
                showToast('Comment removed', 'success');
                renderCommentList(listElem, comments, contextType, contextId);
            };
        });
    }
}
document.getElementById('submitReportCommentBtn').addEventListener('click', async () => {
    const reason = document.getElementById('reportReasonInput').value;
    const desc = document.getElementById('reportDescriptionInput').value.trim();
    if (!reason) return showToast('Reason required', 'warning');
    if (!reportContext) return showToast('No comment selected', 'error');
    try {
        // TODO: Call backend API for reporting
        // if (reportContext.contextType === 'plugin') await communityService.reportPlugin(reportContext.contextId, reason + (desc ? (': ' + desc) : ''));
        // else if (reportContext.contextType === 'mod') await communityService.reportMod(reportContext.contextId, reason + (desc ? (': ' + desc) : ''));
        showToast('Report submitted', 'success');
        bootstrap.Modal.getInstance(document.getElementById('reportCommentModal')).hide();
    } catch (e) {
        showToast('Failed to submit report', 'error');
    }
});
// Patch plugin/mod rating section logic to use new renderCommentList
// Plugin
async function showPluginRatingSection(pluginId) {
    currentPluginId = pluginId;
    document.getElementById('pluginAverageRating').textContent = 'Loading...';
    document.getElementById('pluginCommentsList').innerHTML = '<div class="text-muted">Loading...</div>';
    let avg = 0, userRating = 0, comments = [];
    try {
        avg = 4.2;
        userRating = 0;
        comments = [ { user: 'Alice', text: 'Great plugin!' }, { user: 'Bob', text: 'Needs more features.' } ];
    } catch (e) {
        document.getElementById('pluginAverageRating').textContent = 'Failed to load ratings';
    }
    document.getElementById('pluginAverageRating').textContent = `Average: ${avg.toFixed(2)}/5`;
    renderStarRating(document.getElementById('pluginRatingStars'), userRating, async (rating) => {
        try {
            await communityService.ratePlugin(pluginId, rating);
            showToast('Rating submitted', 'success');
            showPluginRatingSection(pluginId);
        } catch (e) {
            showToast('Failed to submit rating', 'error');
        }
    });
    renderCommentList(document.getElementById('pluginCommentsList'), comments, 'plugin', pluginId);
}
// Mod
async function showModRatingSection(modId) {
    currentModId = modId;
    document.getElementById('modAverageRating').textContent = 'Loading...';
    document.getElementById('modCommentsList').innerHTML = '<div class="text-muted">Loading...</div>';
    let avg = 0, userRating = 0, comments = [];
    try {
        avg = 4.5;
        userRating = 0;
        comments = [ { user: 'Alice', text: 'Awesome mod!' }, { user: 'Bob', text: 'Didn\'t work for me.' } ];
    } catch (e) {
        document.getElementById('modAverageRating').textContent = 'Failed to load ratings';
    }
    document.getElementById('modAverageRating').textContent = `Average: ${avg.toFixed(2)}/5`;
    renderStarRating(document.getElementById('modRatingStars'), userRating, async (rating) => {
        try {
            // await communityService.rateMod(null, modId, rating);
            showToast('Rating submitted', 'success');
            showModRatingSection(modId);
        } catch (e) {
            showToast('Failed to submit rating', 'error');
        }
    });
    renderCommentList(document.getElementById('modCommentsList'), comments, 'mod', modId);
}
// ... existing code ...

// ... existing code ...
// === Admin/Moderator Tools Logic ===
const isAdmin = localStorage.getItem('isAdmin') === 'true'; // For demo, set manually
// Show moderation tools sidebar if admin
if (isAdmin) document.getElementById('moderationToolsSection').style.display = '';

document.getElementById('openModerationQueueBtn').addEventListener('click', () => {
    renderModerationQueue();
    new bootstrap.Modal(document.getElementById('moderationQueueModal')).show();
});

// Mock moderation queue data
let moderationQueue = [
    { id: 1, contextType: 'plugin', contextId: 'plugin1', user: 'Alice', text: 'Spam comment', reason: 'spam' },
    { id: 2, contextType: 'mod', contextId: 'mod1', user: 'Bob', text: 'Abusive comment', reason: 'abuse' }
];
function renderModerationQueue() {
    const list = document.getElementById('moderationQueueList');
    if (!moderationQueue.length) {
        list.innerHTML = '<div class="text-muted">No reported comments.</div>';
        return;
    }
    list.innerHTML = moderationQueue.map((c, idx) => `
        <div class='border-bottom pb-2 mb-2'>
            <strong>${c.user}</strong> (${c.contextType} ${c.contextId})<br>
            <span class='text-warning'>Reason: ${c.reason}</span><br>
            <span>${c.text}</span>
            <div class='mt-2'>
                <button class='btn btn-sm btn-outline-success me-2' data-action='approve' data-idx='${idx}'>Approve</button>
                <button class='btn btn-sm btn-outline-danger me-2' data-action='remove' data-idx='${idx}'>Remove</button>
                <button class='btn btn-sm btn-outline-secondary' data-action='reject' data-idx='${idx}'>Reject</button>
            </div>
        </div>
    `).join('');
    list.querySelectorAll('button[data-action]').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.getAttribute('data-idx'));
            const action = btn.getAttribute('data-action');
            if (action === 'approve' || action === 'reject') {
                moderationQueue.splice(idx, 1);
                showToast('Comment approved', 'success');
            } else if (action === 'remove') {
                moderationQueue.splice(idx, 1);
                showToast('Comment removed', 'success');
            }
            renderModerationQueue();
        };
    });
}
// ... existing code ...

// ... existing code ...
// === Backup & Recovery Logic ===

// Mock backup/version data
let backupHistory = [
    { name: 'mod-backup-2024-06-01.zip', date: '2024-06-01 12:00', size: '2.1MB' },
    { name: 'mod-backup-2024-05-30.zip', date: '2024-05-30 18:30', size: '2.0MB' }
];
let cloudStatus = { lastSync: '2024-06-01 12:01', status: 'Up to date' };

document.getElementById('manualBackupBtn').addEventListener('click', async () => {
    // TODO: Call backend for manual backup
    showToast('Manual backup created', 'success');
    // Add to mock history
    backupHistory.unshift({ name: `mod-backup-${new Date().toISOString().slice(0,10)}.zip`, date: new Date().toLocaleString(), size: '2.2MB' });
});
document.getElementById('restoreBackupBtn').addEventListener('click', async () => {
    // TODO: Show restore modal, select backup to restore
    if (!backupHistory.length) return showToast('No backups available', 'warning');
    showToast('Restored from latest backup', 'success');
});
document.getElementById('versionHistoryBtn').addEventListener('click', () => {
    renderVersionHistory();
    new bootstrap.Modal(document.getElementById('versionHistoryModal')).show();
});
function renderVersionHistory() {
    const list = document.getElementById('versionHistoryList');
    if (!backupHistory.length) {
        list.innerHTML = '<div class="text-muted">No backups found.</div>';
        return;
    }
    list.innerHTML = backupHistory.map((b, idx) => `
        <div class='border-bottom pb-2 mb-2 d-flex justify-content-between align-items-center'>
            <span><strong>${b.name}</strong><br><span class='text-muted small'>${b.date} &middot; ${b.size}</span></span>
            <span>
                <button class='btn btn-sm btn-outline-success me-2' data-action='restore' data-idx='${idx}'>Restore</button>
                <button class='btn btn-sm btn-outline-danger' data-action='delete' data-idx='${idx}'>Delete</button>
            </span>
        </div>
    `).join('');
    list.querySelectorAll('button[data-action]').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.getAttribute('data-idx'));
            const action = btn.getAttribute('data-action');
            if (action === 'restore') {
                showToast(`Restored from ${backupHistory[idx].name}`, 'success');
            } else if (action === 'delete') {
                backupHistory.splice(idx, 1);
                showToast('Backup deleted', 'success');
                renderVersionHistory();
            }
        };
    });
}
document.getElementById('cloudSyncBtn').addEventListener('click', () => {
    renderCloudSyncStatus();
    new bootstrap.Modal(document.getElementById('cloudSyncModal')).show();
});
function renderCloudSyncStatus() {
    const status = document.getElementById('cloudSyncStatus');
    status.innerHTML = `<strong>Status:</strong> ${cloudStatus.status}<br><span class='text-muted small'>Last sync: ${cloudStatus.lastSync}</span>`;
}
document.getElementById('cloudUploadBtn').addEventListener('click', async () => {
    // TODO: Call backend for cloud upload
    cloudStatus = { lastSync: new Date().toLocaleString(), status: 'Up to date' };
    showToast('Uploaded to cloud', 'success');
    renderCloudSyncStatus();
});
document.getElementById('cloudDownloadBtn').addEventListener('click', async () => {
    // TODO: Call backend for cloud download
    showToast('Downloaded from cloud', 'success');
    renderCloudSyncStatus();
});
// ... existing code ...

// ... existing code ...
// === Data Management/Cleanup Logic ===

// Add ARIA live region for status updates
let dataMgmtStatusRegion = document.getElementById('dataMgmtStatusRegion');
if (!dataMgmtStatusRegion) {
    dataMgmtStatusRegion = document.createElement('div');
    dataMgmtStatusRegion.id = 'dataMgmtStatusRegion';
    dataMgmtStatusRegion.setAttribute('aria-live', 'polite');
    dataMgmtStatusRegion.className = 'visually-hidden';
    document.body.appendChild(dataMgmtStatusRegion);
}

function setDataMgmtStatus(msg) {
    dataMgmtStatusRegion.textContent = msg;
}

function setDataMgmtBtnState(disabled) {
    [
        'clearCacheBtn',
        'removeOrphansBtn',
        'analyzeStorageBtn',
        'optimizeStorageBtn'
    ].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = disabled;
    });
}

async function handleDataMgmtAction(action, onSuccess, onError) {
    setDataMgmtBtnState(true);
    showLoading();
    setDataMgmtStatus('Working...');
    try {
        const res = await action();
        hideLoading();
        setDataMgmtBtnState(false);
        setDataMgmtStatus('Done.');
        if (onSuccess) onSuccess(res);
    } catch (e) {
        hideLoading();
        setDataMgmtBtnState(false);
        setDataMgmtStatus('Error: ' + (e.message || e));
        if (onError) onError(e);
    }
}

document.getElementById('clearCacheBtn').addEventListener('click', async () => {
    handleDataMgmtAction(
        () => window.electron.invoke('data:clearCache'),
        () => showToast('Cache cleared', 'success'),
        () => showToast('Failed to clear cache', 'error')
    );
});
document.getElementById('removeOrphansBtn').addEventListener('click', async () => {
    handleDataMgmtAction(
        () => window.electron.invoke('data:removeOrphans'),
        (res) => showToast(`Orphaned files removed: ${res.removed}`, 'success'),
        () => showToast('Failed to remove orphans', 'error')
    );
});
document.getElementById('analyzeStorageBtn').addEventListener('click', async () => {
    handleDataMgmtAction(
        () => window.electron.invoke('data:analyzeStorage'),
        (res) => {
            renderStorageAnalysis(res.usage, res.largest);
            const modal = new bootstrap.Modal(document.getElementById('storageAnalysisModal'));
            modal.show();
            // Focus modal for accessibility
            setTimeout(() => {
                document.getElementById('storageAnalysisModal').focus();
            }, 300);
        },
        () => showToast('Failed to analyze storage', 'error')
    );
});
document.getElementById('optimizeStorageBtn').addEventListener('click', async () => {
    handleDataMgmtAction(
        () => window.electron.invoke('data:optimizeStorage'),
        () => showToast('Storage optimized', 'success'),
        () => showToast('Failed to optimize storage', 'error')
    );
});
// ... existing code ...