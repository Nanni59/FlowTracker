// app.js
// UI Orchestrator — mirrors Formulae's App class

class App {
    constructor() {
        this.library = new window.FlowchartLibrary();

        this.state = {
            currentSelection: 'general',
            viewingFlowchartId: null,
            viewMode: 'list',                 // 'list' | 'map' — how the open flowchart is shown
            collapsedNodes: new Set(),        // in-memory only (never persisted / exported)
            expandedCategories: new Set(JSON.parse(localStorage.getItem('expandedCategories') || '[]'))
        };

        this.els = {
            sidebarList: document.getElementById('unit-list'),
            mainContent: document.getElementById('main-content'),
            searchBar: document.getElementById('search-input'),
            addEntryBtn: document.getElementById('btn-add-entry'),
            addUnitBtn: document.getElementById('btn-add-unit'),
            addCourseBtn: document.getElementById('btn-add-course'),

            // View Modal
            viewModal: document.getElementById('view-modal'),
            viewModalTitle: document.getElementById('view-modal-title'),
            viewModalContent: document.getElementById('view-modal-content'),
            btnCloseView: document.getElementById('btn-close-view'),
            btnEditView: document.getElementById('btn-edit-view'),
            btnClearFlowchart: document.getElementById('btn-clear-flowchart'),
            btnToggleView: document.getElementById('btn-toggle-view'),
            btnMapToggleAll: document.getElementById('btn-map-toggle-all'),
            btnAddPhase: document.getElementById('btn-add-phase'),
            btnPrevFc: document.getElementById('btn-prev-fc'),
            btnNextFc: document.getElementById('btn-next-fc'),
            btnAiGenerate: document.getElementById('btn-ai-generate'),

            // AI Modal
            aiModal: document.getElementById('ai-modal'),
            btnCloseAi: document.getElementById('btn-close-ai'),
            aiKeyInput: document.getElementById('ai-key-input'),
            aiKeyInputRow: document.getElementById('ai-key-input-row'),
            aiKeySavedRow: document.getElementById('ai-key-saved-row'),
            btnSaveKey: document.getElementById('btn-save-key'),
            btnClearKey: document.getElementById('btn-clear-key'),
            aiModelSelect: document.getElementById('ai-model-select'),
            aiTextInput: document.getElementById('ai-text-input'),
            aiDropzone: document.getElementById('ai-dropzone'),
            aiFileInput: document.getElementById('ai-file-input'),
            aiFileList: document.getElementById('ai-file-list'),
            aiError: document.getElementById('ai-error'),
            btnAiRun: document.getElementById('btn-ai-run'),
            aiRunSpinner: document.getElementById('ai-run-spinner'),
            aiRunLabel: document.getElementById('ai-run-label'),

            // JSON Edit Modal
            jsonModal: document.getElementById('entry-modal'),
            jsonInput: document.getElementById('modal-raw-input'),
            btnSaveJson: document.getElementById('btn-save-entry'),
            btnCloseJson: document.getElementById('btn-cancel-entry'),
            jsonError: document.getElementById('json-error'),

            // Import/Export
            exportBtn: document.getElementById('btn-export'),
            importInput: document.getElementById('file-import'),

            // Sidebar Toggle
            btnFullscreen: document.getElementById('btn-fullscreen')
        };

        this.init();
    }

    init() {
        this.renderSidebar();
        this.renderMainContent();
        this.attachListeners();
        this._initThemedSelects();
    }

    _escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // ===== Recursive node model helpers =====
    // A node is { id, title, completed?, children?: [node] }.
    // Container = has non-empty children (completion derived); leaf = checkable.

    _uid(prefix = 'n') {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }

    // Container = has a `children` array (even if empty). Leaf = no children array.
    // Keeping empty containers distinct from leaves means an empty phase counts as
    // zero leaves (0 progress) rather than one unchecked step.
    _isContainer(node) {
        return !!node && Array.isArray(node.children);
    }

    // Friendly, standardized labels — the single place terminology is decided.
    _nodeTypeName(depth, isContainer) {
        if (isContainer) return depth === 0 ? 'Phase' : (depth === 1 ? 'Subphase' : 'Group');
        return depth <= 1 ? 'Step' : 'Substep';
    }

    // Number each role independently in depth-first display order. Numbers are
    // derived at render time, so moving nodes immediately updates both views
    // without storing presentation data in the flowchart JSON.
    _buildNodeSequenceNumbers(nodes) {
        const counters = new Map();
        const sequence = new Map();
        const walk = (arr, depth) => (arr || []).forEach(node => {
            const isContainer = this._isContainer(node);
            const typeName = this._nodeTypeName(depth, isContainer);
            const number = (counters.get(typeName) || 0) + 1;
            counters.set(typeName, number);
            sequence.set(node.id, { typeName, number, label: `${typeName} ${number}` });
            if (isContainer) walk(node.children, depth + 1);
        });
        walk(nodes, 0);
        return sequence;
    }

    // Avoid visual duplication when an existing title was manually prefixed
    // with the same sequence label (for example, "Phase 1: Planning").
    _displayNodeTitle(title, sequenceLabel) {
        const value = String(title ?? '').trim();
        if (!sequenceLabel) return value;
        const escapedLabel = sequenceLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const redundantPrefix = new RegExp(`^${escapedLabel}(?=\\s*(?:$|[:\\-–—]))\\s*[:\\-–—]?\\s*`, 'i');
        return value.replace(redundantPrefix, '').trim();
    }

    // Count leaves recursively → progress across arbitrary nesting.
    _progress(nodes) {
        let total = 0, completed = 0;
        const walk = (arr) => (arr || []).forEach(n => {
            if (this._isContainer(n)) walk(n.children);
            else { total++; if (n.completed) completed++; }
        });
        walk(nodes);
        return { total, completed };
    }

    _isComplete(node) {
        if (this._isContainer(node)) {
            const { total, completed } = this._progress(node.children);
            return total > 0 && completed === total;
        }
        return !!node.completed;
    }

    // Locate a node anywhere in the tree → { node, parentArray, index, depth }.
    _findNode(nodes, id, depth = 0) {
        const arr = nodes || [];
        for (let i = 0; i < arr.length; i++) {
            const n = arr[i];
            if (n.id === id) return { node: n, parentArray: arr, index: i, depth };
            if (Array.isArray(n.children) && n.children.length) {
                const found = this._findNode(n.children, id, depth + 1);
                if (found) return found;
            }
        }
        return null;
    }

    _moveNode(fc, id, dir) {
        const found = this._findNode(fc.phases, id);
        if (!found) return;
        const { parentArray, index } = found;
        const target = index + dir;
        if (target < 0 || target >= parentArray.length) return;
        const [moved] = parentArray.splice(index, 1);
        parentArray.splice(target, 0, moved);
        this.library.saveData();
        this.renderFlowchartCanvas(fc);
        this.renderSidebar();
    }

    showCustomModal(options) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('customModalOverlay');
            const dialog = overlay ? overlay.querySelector('.link-modal') : null;
            const titleEl = document.getElementById('customModalTitle');
            const msgEl = document.getElementById('customModalMessage');
            const inputTxt = document.getElementById('customModalInputText');
            const inputSel = document.getElementById('customModalInputSelect');
            const btnCancel = document.getElementById('customModalCancel');
            const btnSave = document.getElementById('customModalSave');

            if (!overlay || !dialog) {
                console.error("Custom Modal HTML not found.");
                resolve(null);
                return;
            }

            const previousFocus = document.activeElement;

            titleEl.textContent = options.title || 'Prompt';
            msgEl.textContent = options.message || '';
            
            const selDD = inputSel._ftDD;   // custom dropdown overlay, if themed
            inputTxt.style.display = 'none';
            if (selDD) selDD.style.display = 'none';
            else inputSel.style.display = 'none';

            let firstFocusable = btnCancel;

            if (options.type === 'text') {
                inputTxt.style.display = 'block';
                inputTxt.value = options.initialValue || '';
                firstFocusable = inputTxt;
            } else if (options.type === 'select') {
                inputSel.innerHTML = '';
                (options.selectOptions || []).forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt.value;
                    o.textContent = opt.label;
                    inputSel.appendChild(o);
                });
                if (selDD) {
                    selDD.style.display = 'block';
                    selDD.classList.remove('open');
                    firstFocusable = selDD.querySelector('.ft-dd-head');
                } else {
                    inputSel.style.display = 'block';
                    firstFocusable = inputSel;
                }
            }

            const getFocusableElements = () => {
                return Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
                    .filter(el => el.style.display !== 'none' && !el.disabled && !el.classList.contains('ft-dd-opt'));
            };

            const handleTrap = (e) => {
                if (e.key === 'Tab') {
                    const focusable = getFocusableElements();
                    if (focusable.length === 0) return;
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (e.shiftKey && document.activeElement === first) {
                        last.focus(); e.preventDefault();
                    } else if (!e.shiftKey && document.activeElement === last) {
                        first.focus(); e.preventDefault();
                    }
                }
            };

            const handleCancel = () => {
                cleanup();
                resolve(options.type === 'confirm' ? false : null);
            };

            const handleSave = () => {
                cleanup();
                if (options.type === 'confirm') resolve(true);
                else if (options.type === 'text') resolve(inputTxt.value);
                else if (options.type === 'select') resolve(inputSel.value);
                else resolve(null);
            };

            const handleKeydown = (e) => {
                if (e.key === 'Enter' && options.type !== 'confirm') {
                    e.preventDefault(); handleSave();
                } else if (e.key === 'Escape') {
                    handleCancel();
                } else {
                    handleTrap(e);
                }
            };

            const cleanup = () => {
                overlay.classList.remove('active');
                overlay.setAttribute('aria-hidden', 'true');
                btnCancel.removeEventListener('click', handleCancel);
                btnSave.removeEventListener('click', handleSave);
                dialog.removeEventListener('keydown', handleKeydown);
                if (previousFocus) previousFocus.focus();
            };

            btnCancel.addEventListener('click', handleCancel);
            btnSave.addEventListener('click', handleSave);
            dialog.addEventListener('keydown', handleKeydown);

            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
            setTimeout(() => firstFocusable.focus(), 50);
        });
    }

    toggleCategory(categoryId) {
        if (this.state.expandedCategories.has(categoryId)) {
            this.state.expandedCategories.delete(categoryId);
        } else {
            this.state.expandedCategories.add(categoryId);
        }
        localStorage.setItem('expandedCategories', JSON.stringify(Array.from(this.state.expandedCategories)));
        this.renderSidebar();
    }

    toggleSidebar() {
        const container = document.querySelector('.glass-container');
        container.classList.toggle('sidebar-collapsed');

        const sidebar = container.querySelector('.sidebar');
        if (container.classList.contains('sidebar-collapsed')) {
            sidebar.style.visibility = 'hidden';
            this.els.btnFullscreen.innerHTML = '&times;';
            this.els.btnFullscreen.style.fontSize = '2rem';
        } else {
            setTimeout(() => sidebar.style.visibility = 'visible', 200);
            this.els.btnFullscreen.innerHTML = '&#9776;';
            this.els.btnFullscreen.style.fontSize = '1.6rem';
        }
    }

    attachListeners() {
        // Search
        if (this.els.searchBar) {
            this.els.searchBar.addEventListener('input', (e) => {
                this.renderMainContent(e.target.value);
            });
        }

        // Sidebar Toggle
        if (this.els.btnFullscreen) {
            this.els.btnFullscreen.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }

        // Add Flowchart (header button)
        if (this.els.addEntryBtn) {
            this.els.addEntryBtn.addEventListener('click', () => {
                if (this.state.currentSelection === 'general') {
                    this.addFlowchart();
                } else if (this.state.currentSelection.startsWith('c-')) {
                    this.addFlowchart(this.state.currentSelection);
                } else {
                    this.addFlowchart();
                }
            });
        }

        // Add Flowchart (sidebar button)
        if (this.els.addUnitBtn) {
            this.els.addUnitBtn.addEventListener('click', async () => {
                const name = await this.showCustomModal({
                    title: "New Flowchart",
                    message: "Enter name for new Flowchart:",
                    type: "text"
                });
                if (name && name.trim()) {
                    const newFc = this.library.createFlowchart(name.trim());
                    this.state.currentSelection = newFc.id;
                    this.renderSidebar();
                    this.renderMainContent();
                }
            });
        }

        // Add Category
        if (this.els.addCourseBtn) {
            this.els.addCourseBtn.addEventListener('click', async () => {
                const name = await this.showCustomModal({
                    title: "New Category",
                    message: "Enter name for new Category:",
                    type: "text"
                });
                if (name && name.trim()) {
                    const newCat = this.library.createCategory(name.trim());
                    this.state.currentSelection = newCat.id;
                    this.renderSidebar();
                    this.renderMainContent();
                }
            });
        }

        // Sidebar selection
        if (this.els.sidebarList) {
            this.els.sidebarList.addEventListener('click', async (e) => {
                // Category Toggle Collapse/Expand
                if (e.target.closest('.course-toggle')) {
                    e.stopPropagation();
                    const categoryId = e.target.closest('.course-toggle').dataset.categoryId;
                    this.toggleCategory(categoryId);
                    return;
                }

                // Delete Flowchart
                if (e.target.closest('.delete-unit-btn')) {
                    e.stopPropagation();
                    const fcId = e.target.closest('li').dataset.id;
                    const isConfirmed = await this.showCustomModal({
                        title: "Confirm Deletion",
                        message: "Delete this Flowchart and all its data?",
                        type: "confirm"
                    });
                    if (isConfirmed) {
                        this.library.deleteFlowchart(fcId);
                        if (this.state.currentSelection === fcId) {
                            this.state.currentSelection = 'general';
                        }
                        this.renderSidebar();
                        this.renderMainContent();
                    }
                    return;
                }

                // Delete Category
                if (e.target.closest('.delete-course-btn')) {
                    e.stopPropagation();
                    const catId = e.target.closest('li').dataset.id;
                    const isConfirmed = await this.showCustomModal({
                        title: "Delete Category",
                        message: "Delete this Category? Flowcharts will be unassigned.",
                        type: "confirm"
                    });
                    if (isConfirmed) {
                        this.library.deleteCategory(catId);
                        if (this.state.currentSelection === catId) {
                            this.state.currentSelection = 'general';
                        }
                        this.renderSidebar();
                        this.renderMainContent();
                    }
                    return;
                }

                // Rename Category
                if (e.target.closest('.rename-course-btn')) {
                    e.stopPropagation();
                    const li = e.target.closest('li');
                    const catId = li.dataset.id;
                    const cat = this.library.getCategory(catId);
                    
                    const newName = await this.showCustomModal({
                        title: "Rename Category",
                        message: "Enter new name:",
                        initialValue: cat.name,
                        type: "text"
                    });
                    if (newName && newName.trim() && newName.trim() !== cat.name) {
                        this.library.renameCategory(catId, newName.trim());
                        this.renderSidebar();
                        if (this.state.currentSelection === catId) {
                            this.renderMainContent();
                        }
                    }
                    return;
                }

                // Move Flowchart to Category
                if (e.target.closest('.move-unit-btn')) {
                    e.stopPropagation();
                    const fcId = e.target.closest('li').dataset.id;
                    const categories = this.library.getCategories();
                    const sortedCats = [...categories].sort((a, b) => a.name.localeCompare(b.name));

                    const selectOptions = [
                        { label: '— No Category (Standalone) —', value: '' },
                        ...sortedCats.map(c => ({ label: c.name, value: c.id }))
                    ];

                    const choice = await this.showCustomModal({
                        title: "Move to Category",
                        message: "Select a category to assign to:",
                        type: "select",
                        selectOptions: selectOptions
                    });

                    if (choice !== null) {
                        this.library.assignFlowchartToCategory(fcId, choice === '' ? null : choice);
                        this.renderSidebar();
                        this.renderMainContent();
                    }
                    return;
                }

                // Rename Flowchart
                if (e.target.closest('.rename-unit-btn')) {
                    e.stopPropagation();
                    const li = e.target.closest('li');
                    const fcId = li.dataset.id;
                    const fc = this.library.getFlowchart(fcId);

                    const newName = await this.showCustomModal({
                        title: "Rename Flowchart",
                        message: "Enter new name:",
                        initialValue: fc.name,
                        type: "text"
                    });
                    if (newName && newName.trim() && newName.trim() !== fc.name) {
                        this.library.renameFlowchart(fcId, newName.trim());
                        this.renderSidebar();
                        if (this.state.currentSelection === fcId) {
                            this.renderMainContent();
                        }
                    }
                    return;
                }

                const li = e.target.closest('li');
                if (li) {
                    this.state.currentSelection = li.dataset.id;
                    this.renderSidebar();
                    this.renderMainContent();
                }
            });
        }

        // Export/Import
        if (this.els.exportBtn) {
            this.els.exportBtn.addEventListener('click', () => {
                const json = this.library.exportToJSON();
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "flowcharts_backup.json";
                a.click();
            });
        }

        if (this.els.importInput) {
            this.els.importInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    if (this.library.importFromJSON(evt.target.result)) {
                        alert("Library imported successfully!");
                        window.location.reload();
                    } else {
                        alert("Import failed.");
                    }
                };
                reader.readAsText(file);
            });
        }

        // View Modal Controls
        if (this.els.btnCloseView) {
            this.els.btnCloseView.addEventListener('click', () => {
                this.els.viewModal.classList.remove('visible');
                this.state.viewingFlowchartId = null;
                this.renderSidebar();
                this.renderMainContent();
            });
        }

        const navigateFc = (dir) => {
            if (!this.state.viewingFlowchartId) return;
            const { siblings, idx } = this._getFlowchartSiblings();
            const next = siblings[idx + dir];
            if (next) this.openFlowchartView(next);
        };

        if (this.els.btnPrevFc) {
            this.els.btnPrevFc.addEventListener('click', () => navigateFc(-1));
        }
        if (this.els.btnNextFc) {
            this.els.btnNextFc.addEventListener('click', () => navigateFc(1));
        }

        document.addEventListener('keydown', (e) => {
            if (!this.state.viewingFlowchartId) return;
            // Skip if user is typing in an input/textarea
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            // Skip if a modal on top of the flowchart is open
            if (this.els.aiModal.classList.contains('visible')) return;
            if (this.els.jsonModal.classList.contains('visible')) return;
            if (e.key === 'ArrowLeft')  { e.preventDefault(); navigateFc(-1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); navigateFc(1); }
        });

        if (this.els.btnAddPhase) {
            this.els.btnAddPhase.addEventListener('click', async () => {
                if (!this.state.viewingFlowchartId) return;
                const name = await this.showCustomModal({ title: "New Phase", message: "Enter phase title:", type: "text" });
                if (name && name.trim()) {
                    const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
                    fc.phases.push({ id: this._uid('p'), title: name.trim(), children: [] });
                    this.library.saveData();
                    this.renderFlowchartCanvas(fc);
                    this.renderSidebar();
                }
            });
        }

        if (this.els.btnEditView) {
            this.els.btnEditView.addEventListener('click', () => {
                if (!this.state.viewingFlowchartId) return;
                const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
                this.els.jsonInput.value = JSON.stringify(fc.phases, null, 2);
                this.els.jsonError.textContent = '';
                this.els.jsonModal.classList.add('visible');
            });
        }

        if (this.els.btnClearFlowchart) {
            this.els.btnClearFlowchart.addEventListener('click', async () => {
                if (!this.state.viewingFlowchartId) return;
                const isConfirmed = await this.showCustomModal({
                    title: "Clear Flowchart",
                    message: "Are you sure you want to clear the canvas? This action cannot be undone.",
                    type: "confirm"
                });
                if (!isConfirmed) return;

                this.library.updateFlowchartData(this.state.viewingFlowchartId, []);
                const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
                this._prevBarPercent = null;
                this.renderFlowchartCanvas(fc);
                this.renderSidebar();
                this.renderMainContent();
            });
        }

        if (this.els.btnToggleView) {
            this.els.btnToggleView.addEventListener('click', (e) => {
                const btn = e.target.closest('.vmt-btn');
                if (!btn || !this.state.viewingFlowchartId) return;
                const mode = btn.dataset.mode;
                if (mode === this.state.viewMode) return;
                this.state.viewMode = mode;
                this._prevBarPercent = null;
                this._updateViewModeToggle();
                const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
                if (fc) this.renderFlowchartCanvas(fc);
            });
        }

        if (this.els.btnMapToggleAll) {
            this.els.btnMapToggleAll.addEventListener('click', () => {
                if (this.state.viewMode !== 'map' || !this.state.viewingFlowchartId) return;
                const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
                if (!fc) return;

                const expandableIds = this._getExpandableNodeIds(fc.phases);
                if (!expandableIds.length) return;
                const allCollapsed = expandableIds.every(id => this.state.collapsedNodes.has(id));

                expandableIds.forEach(id => {
                    if (allCollapsed) this.state.collapsedNodes.delete(id);
                    else this.state.collapsedNodes.add(id);
                });
                this.renderFlowchartCanvas(fc);
            });
        }

        this.attachAiListeners();

        if (this.els.btnCloseJson) {
            this.els.btnCloseJson.addEventListener('click', () => {
                this.els.jsonModal.classList.remove('visible');
            });
        }

        if (this.els.btnSaveJson) {
            this.els.btnSaveJson.addEventListener('click', () => {
                try {
                    const parsed = JSON.parse(this.els.jsonInput.value);
                    if (Array.isArray(parsed)) {
                        // Normalize hand-edited JSON: assign ids, migrate steps->children,
                        // default completed on leaves — so partial edits stay valid.
                        const nodes = this.library.normalizeNodes(parsed);
                        this.library.updateFlowchartData(this.state.viewingFlowchartId, nodes);
                        this.els.jsonModal.classList.remove('visible');
                        const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
                        this._prevBarPercent = null;
                        this.renderFlowchartCanvas(fc);
                        this.renderSidebar();
                    } else {
                        this.els.jsonError.textContent = 'JSON must be an array of phase nodes.';
                    }
                } catch (e) {
                    this.els.jsonError.textContent = 'Invalid JSON format.';
                }
            });
        }

        // Flowchart Canvas Interactions (delegated on view modal content)
        if (this.els.viewModalContent) {
            this.els.viewModalContent.addEventListener('click', async (e) => {
                // Add a step (leaf) into a phase/container
                const addBtn = e.target.closest('.btn-add-step');
                if (addBtn) {
                    await this._addChildLeaf(addBtn.dataset.nodeId);
                    return;
                }

                // Collapse / expand a container
                const subHeader = e.target.closest('.subphase-header');
                if (subHeader) {
                    const subEl = subHeader.closest('.subphase');
                    if (subEl) this._toggleCollapse(subEl.dataset.nodeId);
                    return;
                }

                // Toggle a leaf step's completion
                const row = e.target.closest('.step-row');
                if (row) {
                    this._toggleLeafCompletion(row.dataset.nodeId);
                    return;
                }

                // Map editing mirrors the list: leaf click toggles completion;
                // container click collapses or expands its descendant branch.
                const mapNode = e.target.closest('.ft-map-node[data-node-id]');
                if (mapNode) {
                    if (mapNode.dataset.mapAction === 'toggle-leaf') {
                        this._toggleLeafCompletion(mapNode.dataset.nodeId);
                    } else if (mapNode.dataset.mapAction === 'toggle-collapse') {
                        this._toggleCollapse(mapNode.dataset.nodeId);
                    }
                }
            });

            this.els.viewModalContent.addEventListener('contextmenu', (e) => {
                const el = e.target.closest('[data-node-id]');
                if (el) {
                    e.preventDefault();
                    this._openNodeContextMenu(e, el.dataset.nodeId);
                }
            });
        }

        this.attachDragAndDrop();
    }

    // ===== Right-click Context Menus (steps & phases) =====

    // Generic menu renderer. `items` is an array of
    //   { label, onClick, danger } | { divider: true }
    // Leading/trailing/duplicate dividers are normalized away so callers can
    // conditionally include entries without worrying about stray separators.
    _openContextMenu(e, items) {
        const normalized = [];
        items.forEach(it => {
            if (it.divider) {
                if (normalized.length === 0 || normalized[normalized.length - 1].divider) return;
            }
            normalized.push(it);
        });
        while (normalized.length && normalized[normalized.length - 1].divider) normalized.pop();

        // Remove any existing context menu
        document.getElementById('fc-context-menu')?.remove();

        const menu = document.createElement('div');
        menu.id = 'fc-context-menu';
        menu.className = 'step-context-menu';
        menu.innerHTML = normalized.map((it, i) =>
            it.divider
                ? '<div class="context-menu-divider"></div>'
                : `<button data-idx="${i}"${it.danger ? ' class="context-menu-danger"' : ''}>${this._escapeHtml(it.label)}</button>`
        ).join('');

        // Position near cursor, keeping within viewport
        document.body.appendChild(menu);
        const menuW = menu.offsetWidth;
        const menuH = menu.offsetHeight;
        let x = e.clientX;
        let y = e.clientY;
        if (x + menuW > window.innerWidth)  x = window.innerWidth - menuW - 8;
        if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
        menu.style.left = x + 'px';
        menu.style.top  = y + 'px';

        const cleanup = () => {
            document.removeEventListener('click', onDismiss);
            document.removeEventListener('keydown', onKey);
        };
        const dismiss = () => { menu.remove(); cleanup(); };
        const onDismiss = (ev) => { if (!menu.contains(ev.target)) dismiss(); };
        const onKey = (ev) => { if (ev.key === 'Escape') dismiss(); };

        menu.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button');
            if (!btn) return;
            const it = normalized[parseInt(btn.dataset.idx, 10)];
            dismiss();
            if (it && it.onClick) it.onClick();
        });

        // Defer so this contextmenu event doesn't immediately close the menu
        setTimeout(() => document.addEventListener('click', onDismiss), 0);
        document.addEventListener('keydown', onKey);
    }

    // ---- Small edit helpers shared by clicks and the context menu ----

    _toggleCollapse(nodeId) {
        if (!nodeId) return;
        if (this.state.collapsedNodes.has(nodeId)) this.state.collapsedNodes.delete(nodeId);
        else this.state.collapsedNodes.add(nodeId);
        const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
        if (fc) this.renderFlowchartCanvas(fc);
    }

    _toggleLeafCompletion(nodeId) {
        if (!nodeId) return;
        const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
        if (!fc) return;
        const found = this._findNode(fc.phases, nodeId);
        if (!found || this._isContainer(found.node)) return;
        found.node.completed = !found.node.completed;
        this.library.saveData();
        this.renderFlowchartCanvas(fc);
    }

    // Push a new leaf into a container (or an empty phase). Turns a leaf into a
    // container if needed — this is how optional nesting is created.
    async _addChildLeaf(nodeId, promptTitle = "New Step") {
        const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
        const found = this._findNode(fc.phases, nodeId);
        if (!found) return;
        const name = await this.showCustomModal({ title: promptTitle, message: "Enter description:", type: "text" });
        if (!name || !name.trim()) return;
        const node = found.node;
        if (!Array.isArray(node.children)) { node.children = []; delete node.completed; }
        node.children.push({ id: this._uid('s'), title: name.trim(), completed: false });
        this.state.collapsedNodes.delete(nodeId); // reveal the newly added child
        this.library.saveData();
        this.renderFlowchartCanvas(fc);
        this.renderSidebar();
    }

    // Add a container (subphase/group) child.
    async _addChildContainer(nodeId, typeName) {
        const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
        const found = this._findNode(fc.phases, nodeId);
        if (!found) return;
        const name = await this.showCustomModal({ title: `New ${typeName}`, message: `Enter ${typeName.toLowerCase()} title:`, type: "text" });
        if (!name || !name.trim()) return;
        const node = found.node;
        if (!Array.isArray(node.children)) { node.children = []; delete node.completed; }
        node.children.push({ id: this._uid('p'), title: name.trim(), children: [] });
        this.state.collapsedNodes.delete(nodeId);
        this.library.saveData();
        this.renderFlowchartCanvas(fc);
        this.renderSidebar();
    }

    // Unified right-click menu for any node (phase / subphase / step / substep).
    _openNodeContextMenu(e, nodeId) {
        const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
        if (!fc) return;
        const found = this._findNode(fc.phases, nodeId);
        if (!found) return;
        const { node, parentArray, index, depth } = found;
        const isContainer = this._isContainer(node);
        const typeName = this._nodeTypeName(depth, isContainer);
        const isTopLevel = depth === 0;

        const rerender = (alsoSidebar) => {
            this.library.saveData();
            this.renderFlowchartCanvas(fc);
            if (alsoSidebar) this.renderSidebar();
        };

        const insertSibling = async (insertAt) => {
            const name = await this.showCustomModal({ title: `New ${typeName}`, message: "Enter description:", type: "text" });
            if (!name || !name.trim()) return;
            const sibling = isContainer
                ? { id: this._uid('p'), title: name.trim(), children: [] }
                : { id: this._uid('s'), title: name.trim(), completed: false };
            parentArray.splice(insertAt, 0, sibling);
            rerender(isTopLevel);
        };

        const items = [
            { label: `Rename ${typeName}`, onClick: async () => {
                const newName = await this.showCustomModal({
                    title: `Rename ${typeName}`, message: "Enter new title:",
                    initialValue: node.title, type: "text"
                });
                if (newName && newName.trim() && newName.trim() !== node.title) {
                    node.title = newName.trim();
                    rerender(isTopLevel);
                }
            }},
            { divider: true },
        ];

        const upLabel = isTopLevel ? `Move ${typeName} Left` : `Move ${typeName} Up`;
        const downLabel = isTopLevel ? `Move ${typeName} Right` : `Move ${typeName} Down`;
        if (index > 0) items.push({ label: upLabel, onClick: () => this._moveNode(fc, nodeId, -1) });
        if (index < parentArray.length - 1) items.push({ label: downLabel, onClick: () => this._moveNode(fc, nodeId, 1) });

        items.push({ divider: true });

        if (isContainer) {
            // Containers can hold both leaves and sub-containers.
            const childContainerName = this._nodeTypeName(depth + 1, true);
            items.push(
                { label: "Add Step", onClick: () => this._addChildLeaf(nodeId) },
                { label: `Add ${childContainerName}`, onClick: () => this._addChildContainer(nodeId, childContainerName) }
            );
        } else {
            // A leaf becomes a container the moment it gets a child.
            items.push({ label: "Add Subitem", onClick: () => this._addChildLeaf(nodeId, "New Subitem") });
        }

        // Sibling insertion (skip for top-level phases — use the New Phase button).
        if (!isTopLevel) {
            items.push(
                { divider: true },
                { label: `Add ${typeName} Before`, onClick: () => insertSibling(index) },
                { label: `Add ${typeName} After`, onClick: () => insertSibling(index + 1) }
            );
        }

        items.push(
            { divider: true },
            { label: `Delete ${typeName}`, danger: true, onClick: async () => {
                const { total } = this._progress(node.children || []);
                const suffix = isContainer && total > 0 ? ` and all ${total} nested item${total === 1 ? '' : 's'}` : '';
                const confirmed = await this.showCustomModal({
                    title: `Delete ${typeName}`,
                    message: `Delete "${node.title}"${suffix}?`,
                    type: "confirm"
                });
                if (!confirmed) return;
                parentArray.splice(index, 1);
                rerender(true);
            }}
        );

        this._openContextMenu(e, items);
    }

    // ===== Custom themed dropdowns (mirrors Course Planner's .cp-dd) =====
    // Replaces a native <select> with a styled head + popup list. The native
    // <select> stays in the DOM (hidden) as the source of truth — its .value,
    // option list, and programmatic value/selectedIndex assignments are mirrored
    // into the overlay both ways, so existing reads/writes keep working.

    _closeAllDropdowns(except) {
        document.querySelectorAll('.ft-dd.open').forEach(d => {
            if (d !== except) d.classList.remove('open');
        });
    }

    _initThemedSelects() {
        document.addEventListener('click', () => this._closeAllDropdowns(null));
        this._enhanceSelect(this.els.aiModelSelect);
        this._enhanceSelect(document.getElementById('customModalInputSelect'));
    }

    _enhanceSelect(sel) {
        if (!sel || sel.dataset.ftThemed) return;
        sel.dataset.ftThemed = '1';
        sel.style.display = 'none';

        const chev = '<span class="ft-dd-chev"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>';

        const dd = document.createElement('div');
        dd.className = 'ft-dd';
        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'ft-dd-head';
        head.innerHTML = '<span class="ft-dd-val"></span>' + chev;
        const list = document.createElement('div');
        list.className = 'ft-dd-list';
        dd.appendChild(head);
        dd.appendChild(list);
        sel.parentNode.insertBefore(dd, sel.nextSibling);
        sel._ftDD = dd;

        const valEl = head.querySelector('.ft-dd-val');
        const sync = () => {
            const opt = sel.options[sel.selectedIndex];
            valEl.textContent = opt ? opt.textContent : '';
            list.querySelectorAll('.ft-dd-opt').forEach(b =>
                b.classList.toggle('on', b.dataset.val === sel.value && !b.classList.contains('disabled')));
        };
        const rebuild = () => {
            list.innerHTML = '';
            Array.from(sel.options).forEach(opt => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'ft-dd-opt' + (opt.disabled ? ' disabled' : '');
                b.dataset.val = opt.value;
                b.textContent = opt.textContent;
                if (!opt.disabled) {
                    b.addEventListener('click', (e) => {
                        e.stopPropagation();
                        sel.value = opt.value;
                        dd.classList.remove('open');
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                }
                list.appendChild(b);
            });
            sync();
        };
        head.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = dd.classList.contains('open');
            this._closeAllDropdowns(dd);
            dd.classList.toggle('open', !open);
        });

        // Mirror programmatic changes: option-list edits and direct
        // value / selectedIndex assignment (e.g. resetting the model select).
        new MutationObserver(rebuild).observe(sel, { childList: true });
        sel.addEventListener('change', sync);
        const proto = HTMLSelectElement.prototype;
        ['value', 'selectedIndex'].forEach(prop => {
            const desc = Object.getOwnPropertyDescriptor(proto, prop);
            if (!desc) return;
            Object.defineProperty(sel, prop, {
                configurable: true,
                get() { return desc.get.call(sel); },
                set(v) { desc.set.call(sel, v); sync(); }
            });
        });

        rebuild();
    }

    async addFlowchart(categoryId = null) {
        const name = await this.showCustomModal({
            title: "New Flowchart",
            message: "Enter name for new Flowchart:",
            type: "text"
        });
        if (name && name.trim()) {
            this.library.createFlowchart(name.trim(), categoryId);
            this.renderSidebar();
            this.renderMainContent();
        }
    }

    attachDragAndDrop() {
        let draggedId = null;

        if (this.els.sidebarList) {
            this.els.sidebarList.addEventListener('dragstart', (e) => {
                const li = e.target.closest('li');
                if (!li || li.dataset.id === 'general') { e.preventDefault(); return; }
                draggedId = li.dataset.id;
                e.dataTransfer.effectAllowed = 'move';
                li.classList.add('dragging');
            });

            this.els.sidebarList.addEventListener('dragend', (e) => {
                const li = e.target.closest('li');
                if (li) li.classList.remove('dragging');
                document.querySelectorAll('.unit-list li').forEach(el => {
                    el.classList.remove('drag-over', 'drag-over-category');
                });
            });

            this.els.sidebarList.addEventListener('dragover', (e) => {
                e.preventDefault();
                const li = e.target.closest('li');
                if (!li || li.dataset.id === draggedId) return;
                const targetId = li.dataset.id;
                if (targetId === 'general' || targetId.startsWith('c-')) {
                    li.classList.add('drag-over-category');
                } else {
                    li.classList.add('drag-over');
                }
            });

            this.els.sidebarList.addEventListener('dragleave', (e) => {
                const li = e.target.closest('li');
                if (li) li.classList.remove('drag-over', 'drag-over-category');
            });

            this.els.sidebarList.addEventListener('drop', (e) => {
                e.preventDefault();
                const targetLi = e.target.closest('li');
                if (!targetLi || !draggedId) return;

                const targetId = targetLi.dataset.id;
                if (!targetId || targetId === draggedId) return;

                // Drop onto a category → assign flowchart to that category
                if (targetId.startsWith('c-')) {
                    this.library.assignFlowchartToCategory(draggedId, targetId);
                    this.renderSidebar();
                    this.renderMainContent();
                    draggedId = null;
                    return;
                }

                // Drop onto General → make standalone
                if (targetId === 'general') {
                    this.library.assignFlowchartToCategory(draggedId, null);
                    this.renderSidebar();
                    this.renderMainContent();
                    draggedId = null;
                    return;
                }

                // Drop onto another flowchart → reorder
                const flowcharts = this.library.getFlowcharts();
                const fromIndex = flowcharts.findIndex(f => f.id === draggedId);
                const toIndex = flowcharts.findIndex(f => f.id === targetId);
                if (fromIndex !== -1 && toIndex !== -1) {
                    this.library.reorderFlowcharts(fromIndex, toIndex);
                    this.renderSidebar();
                    this.renderMainContent();
                }
                draggedId = null;
            });
        }
    }

    renderSidebar() {
        const flowcharts = this.library.getFlowcharts();
        const totalFlowcharts = flowcharts.length;

        let html = `
            <li class="${this.state.currentSelection === 'general' ? 'active' : ''}" data-id="general">
                <span>General</span>
                <div style="display:flex; align-items:center; justify-content:flex-end; min-width:50px;">
                    <span class="unit-count">${totalFlowcharts}</span>
                </div>
            </li>
        `;

        html += `<div style="border-top:1px solid #ddd; margin: 10px 0;"></div>`;

        const categories = this.library.getCategories();
        const unassignedFlowcharts = flowcharts.filter(f => !f.categoryId);

        if (categories.length > 0) {
            html += `<div style="padding: 10px 10px 5px; font-size: 0.8em; color: #888; text-transform: uppercase; font-weight: 600;">Categories</div>`;
        }

        categories.forEach(c => {
            const catFlowcharts = flowcharts.filter(f => f.categoryId === c.id);
            const catFlowchartsCount = catFlowcharts.length;

            const isExpanded = this.state.expandedCategories.has(c.id);
            const expandIcon = isExpanded 
                ? `<svg class="arrow-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>` 
                : `<svg class="arrow-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; transform: rotate(-90deg);"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

            html += `
            <li class="${c.id === this.state.currentSelection ? 'active' : ''}" data-id="${c.id}">
                <span style="font-weight: 600; display:flex; align-items:center;">
                    <span class="course-toggle" data-category-id="${c.id}">
                        <span class="course-icon">
                            <svg class="folder-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                            ${expandIcon}
                        </span>
                    </span><span class="course-title-text">${this._escapeHtml(c.name)}</span>
                </span>
                <div style="display:flex; align-items:center; justify-content:flex-end; min-width:50px;">
                    <span class="unit-count">${catFlowchartsCount}</span>
                    <div class="unit-actions">
                         <button class="rename-course-btn" title="Rename Category">&#9998;</button>
                         <button class="delete-course-btn" title="Delete Category">&times;</button>
                    </div>
                </div>
            </li>`;

            if (isExpanded && catFlowcharts.length > 0) {
                html += `<ul class="nested-unit-list" style="display:block;">`;
                html += catFlowcharts.map(f => this._generateFlowchartHTML(f)).join('');
                html += `</ul>`;
            }
        });

        if (unassignedFlowcharts.length > 0) {
            if (categories.length > 0) {
                html += `<div style="padding: 10px 10px 5px; font-size: 0.8em; color: #888; text-transform: uppercase; font-weight: 600;">Flowcharts</div>`;
            }
            html += unassignedFlowcharts.map(f => this._generateFlowchartHTML(f)).join('');
        }

        this.els.sidebarList.innerHTML = html;
    }

    _generateFlowchartHTML(f) {
        return `
            <li class="${f.id === this.state.currentSelection ? 'active' : ''}" data-id="${f.id}" draggable="true">
                <span>${this._escapeHtml(f.name)}</span>
                <div style="display:flex; align-items:center; justify-content:flex-end; min-width:50px;">
                    <div class="unit-actions">
                         <button class="move-unit-btn" title="Move to Category" style="padding-top:2px;">
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                         </button>
                         <button class="rename-unit-btn" title="Rename Flowchart">&#9998;</button>
                         <button class="delete-unit-btn" title="Delete Flowchart">&times;</button>
                    </div>
                </div>
            </li>
        `;
    }

    renderMainContent(filterText = '') {
        this.els.addEntryBtn.style.display = 'inline-block';
        this.els.addEntryBtn.innerText = 'New Flowchart';
        this.els.addEntryBtn.className = 'btn-primary';

        this.els.mainContent.innerHTML = '';

        if (this.state.currentSelection === 'general') {
            if (filterText) {
                // Search all flowcharts
                const lower = filterText.toLowerCase();
                const matchedFlowcharts = this.library.getFlowcharts().filter(f => f.name.toLowerCase().includes(lower));
                this.renderFlowchartGrid([], matchedFlowcharts);
            } else {
                const categories = this.library.getCategories();
                const flowcharts = this.library.getFlowcharts();
                const unassigned = flowcharts.filter(f => !f.categoryId);

                if (categories.length === 0 && unassigned.length === 0) {
                    this.els.mainContent.innerHTML = '<div class="empty-state">No flowcharts found. Add a flowchart in the sidebar.</div>';
                    return;
                }

                // Render Category Cards then Unassigned Flowchart Cards
                this.renderFlowchartGrid(categories, unassigned);
            }
        } else if (this.state.currentSelection.startsWith('c-')) {
            // Category Tab View
            const catFlowcharts = this.library.getFlowcharts().filter(f => f.categoryId === this.state.currentSelection);
            
            if (filterText) {
                const lower = filterText.toLowerCase();
                const filtered = catFlowcharts.filter(f => f.name.toLowerCase().includes(lower));
                this.renderFlowchartGrid([], filtered);
            } else {
                this.renderFlowchartGrid([], catFlowcharts);
            }
        } else if (this.state.currentSelection.startsWith('f-')) {
            // If a specific flowchart is selected in sidebar, open it
            const fc = this.library.getFlowchart(this.state.currentSelection);
            if (fc) {
                this.openFlowchartView(fc);
                // Show the grid in the background
                this.state.currentSelection = 'general';
                this.renderSidebar();
                const categories = this.library.getCategories();
                const unassigned = this.library.getFlowcharts().filter(f => !f.categoryId);
                this.renderFlowchartGrid(categories, unassigned);
            }
        }
    }

    renderFlowchartGrid(categories, flowcharts) {
        // Render Category Cards
        categories.forEach(c => {
            const catFlowcharts = this.library.getFlowcharts().filter(f => f.categoryId === c.id);
            const card = document.createElement('div');
            card.className = 'course-card';
            card.dataset.id = c.id;
            
            card.innerHTML = `
                <div class="course-card-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <div class="flowchart-card-info">
                    <h3></h3>
                    <p style="font-size: 0.8em; color: #666; margin: 0;"></p>
                </div>
            `;
            card.querySelector('h3').textContent = c.name;
            card.querySelector('p').textContent = `${catFlowcharts.length} Flowcharts`;
            card.addEventListener('click', () => {
                this.state.currentSelection = c.id;
                this.renderSidebar();
                this.renderMainContent();
            });
            this.els.mainContent.append(card);
        });

        // Render Flowchart Cards
        flowcharts.forEach(f => {
            const card = document.createElement('div');
            card.className = 'flowchart-card';
            card.dataset.id = f.id;

            card.innerHTML = `
                <div class="flowchart-card-icon">
                    <img src="img/Vector.svg" alt="Flowchart" width="32" height="32">
                </div>
                <div class="flowchart-card-info">
                    <h3></h3>
                    <p>${f.phases.length} Phases</p>
                </div>
                <div class="flowchart-card-actions">
                    <button class="fc-rename-btn">Rename</button>
                    <button class="fc-move-btn">Move</button>
                    <button class="fc-delete-btn btn-danger">Delete</button>
                </div>
            `;

            card.querySelector('h3').textContent = f.name;

            card.querySelector('.fc-rename-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                const newName = await this.showCustomModal({
                    title: "Rename Flowchart",
                    message: "Enter new name:",
                    initialValue: f.name,
                    type: "text"
                });
                if (newName && newName.trim() && newName.trim() !== f.name) {
                    this.library.renameFlowchart(f.id, newName.trim());
                    this.renderSidebar();
                    this.renderMainContent();
                }
            });

            card.querySelector('.fc-move-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                const categories = this.library.getCategories();
                const sortedCats = [...categories].sort((a, b) => a.name.localeCompare(b.name));
                const selectOptions = [
                    { label: '— No Category (Standalone) —', value: '' },
                    ...sortedCats.map(c => ({ label: c.name, value: c.id }))
                ];
                const choice = await this.showCustomModal({
                    title: "Move to Category",
                    message: "Select a category to assign to:",
                    type: "select",
                    selectOptions
                });
                if (choice !== null) {
                    this.library.assignFlowchartToCategory(f.id, choice === '' ? null : choice);
                    this.renderSidebar();
                    this.renderMainContent();
                }
            });

            card.querySelector('.fc-delete-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                const isConfirmed = await this.showCustomModal({
                    title: "Confirm Deletion",
                    message: `Delete "${f.name}"?`,
                    type: "confirm"
                });
                if (isConfirmed) {
                    this.library.deleteFlowchart(f.id);
                    this.renderSidebar();
                    this.renderMainContent();
                }
            });

            card.addEventListener('click', () => {
                this.openFlowchartView(f);
            });
            this.els.mainContent.append(card);
        });

        if (categories.length === 0 && flowcharts.length === 0) {
            this.els.mainContent.innerHTML = '<div class="empty-state">No flowcharts found.</div>';
        }
    }

    _getFlowchartSiblings() {
        const all = this.library.getFlowcharts();
        const current = this.library.getFlowchart(this.state.viewingFlowchartId);
        if (!current) return { siblings: [], idx: -1 };
        const siblings = all.filter(f => (f.categoryId ?? null) === (current.categoryId ?? null));
        const idx = siblings.findIndex(f => f.id === current.id);
        return { siblings, idx };
    }

    _updateNavButtons() {
        const { siblings, idx } = this._getFlowchartSiblings();
        const hasPrev = idx > 0;
        const hasNext = idx < siblings.length - 1;
        this.els.btnPrevFc.disabled = !hasPrev;
        this.els.btnNextFc.disabled = !hasNext;
        this.els.btnPrevFc.style.opacity = hasPrev ? '1' : '0.3';
        this.els.btnNextFc.style.opacity = hasNext ? '1' : '0.3';
    }

    openFlowchartView(fc) {
        this.state.viewingFlowchartId = fc.id;
        this.state.viewMode = 'list';
        this.state.collapsedNodes.clear();
        this._prevBarPercent = null;
        this.els.viewModalTitle.textContent = fc.name;
        this.els.viewModal.classList.add('visible');
        this._updateViewModeToggle();
        this._updateNavButtons();
        this.renderFlowchartCanvas(fc);
    }

    _updateViewModeToggle() {
        if (this.els.btnToggleView) {
            this.els.btnToggleView.querySelectorAll('.vmt-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === this.state.viewMode);
            });
        }
        if (this.els.btnMapToggleAll) {
            this.els.btnMapToggleAll.classList.toggle('visible', this.state.viewMode === 'map');
        }
    }

    _getExpandableNodeIds(nodes) {
        const ids = [];
        const walk = (items) => {
            (items || []).forEach(node => {
                if (!this._isContainer(node) || !node.children.length) return;
                ids.push(node.id);
                walk(node.children);
            });
        };
        walk(nodes);
        return ids;
    }

    _updateMapToggleAllButton(fc) {
        const button = this.els.btnMapToggleAll;
        if (!button) return;

        const isMap = this.state.viewMode === 'map';
        button.classList.toggle('visible', isMap);
        if (!isMap || !fc) return;

        const expandableIds = this._getExpandableNodeIds(fc.phases);
        const allCollapsed = expandableIds.length > 0
            && expandableIds.every(id => this.state.collapsedNodes.has(id));
        const label = allCollapsed ? 'Expand all branches' : 'Collapse all branches';

        button.disabled = expandableIds.length === 0;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.innerHTML = allCollapsed ? `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="4" y="4" width="16" height="6" rx="1.5"></rect>
                <rect x="4" y="14" width="16" height="6" rx="1.5"></rect>
                <line x1="8" y1="7" x2="16" y2="7"></line>
                <line x1="12" y1="5" x2="12" y2="9"></line>
                <line x1="8" y1="17" x2="16" y2="17"></line>
                <line x1="12" y1="15" x2="12" y2="19"></line>
            </svg>
        ` : `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="4" y="4" width="16" height="6" rx="1.5"></rect>
                <rect x="4" y="14" width="16" height="6" rx="1.5"></rect>
                <line x1="8" y1="7" x2="16" y2="7"></line>
                <line x1="8" y1="17" x2="16" y2="17"></line>
            </svg>
        `;
    }

    // ===== AI Generation (Bring-Your-Own-Key) =====

    _getGeminiKey() {
        return localStorage.getItem('flowtracker_gemini_key') || '';
    }

    _setGeminiKey(key) {
        localStorage.setItem('flowtracker_gemini_key', key);
    }

    _clearGeminiKey() {
        localStorage.removeItem('flowtracker_gemini_key');
    }

    _getGeminiModel() {
        return localStorage.getItem('flowtracker_gemini_model') || 'gemini-2.5-flash';
    }

    _setGeminiModel(model) {
        localStorage.setItem('flowtracker_gemini_model', model);
    }

    _refreshKeyUI() {
        const hasKey = !!this._getGeminiKey();
        this.els.aiKeyInputRow.style.display = hasKey ? 'none' : 'flex';
        this.els.aiKeySavedRow.style.display = hasKey ? 'flex' : 'none';
    }

    _renderAiFileList() {
        const files = this._aiFiles || [];
        this.els.aiFileList.innerHTML = files.map((f, i) => `
            <div class="ai-file-chip">
                <span class="ai-file-name" title="${this._escapeHtml(f.name)}">${this._escapeHtml(f.name)}</span>
                <button class="ai-file-remove" data-index="${i}" title="Remove">&times;</button>
            </div>
        `).join('');
    }

    _isTextFile(f) {
        return f.type.startsWith('text/') || /\.(md|markdown|txt)$/i.test(f.name);
    }

    _addAiFiles(fileList) {
        if (!this._aiFiles) this._aiFiles = [];
        for (const f of fileList) {
            const isPdf = f.type === 'application/pdf';
            const isImg = f.type.startsWith('image/');
            const isText = this._isTextFile(f);
            if (!isPdf && !isImg && !isText) continue;
            // ~20MB inline cap per file
            if (f.size > 20 * 1024 * 1024) {
                this._showAiError(`"${f.name}" is larger than 20 MB and can't be sent inline.`);
                continue;
            }
            this._aiFiles.push(f);
        }
        this._renderAiFileList();
    }

    _showAiError(msg) {
        this.els.aiError.textContent = msg;
        this.els.aiError.style.display = 'block';
    }

    _clearAiError() {
        this.els.aiError.textContent = '';
        this.els.aiError.style.display = 'none';
    }

    _setAiLoading(loading) {
        this.els.btnAiRun.disabled = loading;
        this.els.aiRunSpinner.style.display = loading ? 'inline-block' : 'none';
        this.els.aiRunLabel.textContent = loading ? 'Generating…' : 'Generate Flowchart';
    }

    openAiModal() {
        if (!this.state.viewingFlowchartId) return;
        this._aiFiles = [];
        this.els.aiTextInput.value = '';
        this.els.aiFileInput.value = '';
        this._renderAiFileList();
        this._clearAiError();
        this._setAiLoading(false);
        this._refreshKeyUI();
        this.els.aiModelSelect.value = this._getGeminiModel();
        this.els.aiModal.classList.add('visible');
    }

    attachAiListeners() {
        if (!this.els.aiModal) return;

        this.els.btnAiGenerate.addEventListener('click', () => this.openAiModal());
        this.els.btnCloseAi.addEventListener('click', () => this.els.aiModal.classList.remove('visible'));
        this.els.aiModal.addEventListener('click', (e) => {
            if (e.target === this.els.aiModal) this.els.aiModal.classList.remove('visible');
        });

        // Key management
        this.els.btnSaveKey.addEventListener('click', () => {
            const key = this.els.aiKeyInput.value.trim();
            if (!key) { this._showAiError('Please paste an API key first.'); return; }
            this._setGeminiKey(key);
            this.els.aiKeyInput.value = '';
            this._clearAiError();
            this._refreshKeyUI();
        });
        this.els.btnClearKey.addEventListener('click', () => {
            this._clearGeminiKey();
            this._refreshKeyUI();
        });

        // Model selection
        this.els.aiModelSelect.addEventListener('change', () => {
            this._setGeminiModel(this.els.aiModelSelect.value);
        });

        // File pickers
        this.els.aiDropzone.addEventListener('click', () => this.els.aiFileInput.click());
        this.els.aiFileInput.addEventListener('change', (e) => this._addAiFiles(e.target.files));
        this.els.aiDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.els.aiDropzone.classList.add('drag-over');
        });
        this.els.aiDropzone.addEventListener('dragleave', () => {
            this.els.aiDropzone.classList.remove('drag-over');
        });
        this.els.aiDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.els.aiDropzone.classList.remove('drag-over');
            if (e.dataTransfer.files) this._addAiFiles(e.dataTransfer.files);
        });
        this.els.aiFileList.addEventListener('click', (e) => {
            const btn = e.target.closest('.ai-file-remove');
            if (!btn) return;
            this._aiFiles.splice(parseInt(btn.dataset.index, 10), 1);
            this._renderAiFileList();
        });

        // Generate
        this.els.btnAiRun.addEventListener('click', () => this.runAiGeneration());
    }

    _fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]); // strip data-URL prefix
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    _fileToText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    async runAiGeneration() {
        this._clearAiError();

        const key = this._getGeminiKey();
        if (!key) { this._showAiError('Please save your Gemini API key first.'); return; }

        const text = this.els.aiTextInput.value.trim();
        const files = this._aiFiles || [];
        if (!text && files.length === 0) {
            this._showAiError('Add some notes or attach at least one file.');
            return;
        }

        this._setAiLoading(true);
        try {
            const phases = await this.generateFlowchartFromAI({ text, files, key });

            if (!Array.isArray(phases) || phases.length === 0) {
                throw new Error('The AI did not return any phases. Try adding more detail.');
            }

            const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
            if (fc.phases && fc.phases.length > 0) {
                const ok = await this.showCustomModal({
                    title: 'Replace existing phases?',
                    message: 'This flowchart already has phases. Replace them with the AI-generated ones?',
                    type: 'confirm'
                });
                if (!ok) { this._setAiLoading(false); return; }
            }

            this.library.updateFlowchartData(this.state.viewingFlowchartId, phases);
            const updated = this.library.getFlowchart(this.state.viewingFlowchartId);
            this._prevBarPercent = null;
            this.renderFlowchartCanvas(updated);
            this.renderSidebar();
            this.els.aiModal.classList.remove('visible');
        } catch (err) {
            this._showAiError(err.message || 'Something went wrong while generating.');
        } finally {
            this._setAiLoading(false);
        }
    }

    async generateFlowchartFromAI({ text, files, key }) {
        const MODEL = this._getGeminiModel();
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

        // Split text/markdown files (read as text into the prompt) from binary files (PDF/images sent inline)
        const textFiles = [];
        const binaryFiles = [];
        for (const f of files) {
            if (this._isTextFile(f)) textFiles.push(f);
            else binaryFiles.push(f);
        }

        let dataSection = '';
        if (text) dataSection += text + '\n\n';
        for (const tf of textFiles) {
            const content = await this._fileToText(tf);
            dataSection += `--- File: ${tf.name} ---\n${content}\n\n`;
        }

        const promptText = `You are an expert project manager and system architect. Analyze the provided project overview, notes, Markdown/text files, PDF text, and/or images (which may contain messy handwriting) and convert them into a highly structured, sequential workflow.

Break the work into logical "Phases". Each Phase contains actionable "Steps".

Nesting is OPTIONAL. Only when the material is genuinely hierarchical, a Step may itself contain
sub-steps (put them in that item's "children"). Keep the tree shallow — do not nest just for the
sake of it. A simple project should stay a flat Phase → Step structure.

Rules:
1. Phase titles should be clear (e.g. "Phase 1: Planning").
2. Keep item titles concise, clear, and actionable (ideally 3-7 words).
3. Order phases and steps in the sequence the work should be performed.
4. A leaf item (no children) is a checkable step. An item with "children" is a group/heading.
5. Output only the structured data — no commentary.

${dataSection.trim() ? 'Here is the project data:\n' + dataSection : 'Use the attached file(s) as the project data.'}`;

        const parts = [{ text: promptText }];
        for (const f of binaryFiles) {
            const data = await this._fileToBase64(f);
            parts.push({ inlineData: { mimeType: f.type, data } });
        }

        // Gemini schemas can't be self-referential, so nest a bounded depth by hand:
        // phase -> children(steps) -> children(sub-steps). Deeper input still works —
        // the recursive normalizer below accepts whatever depth comes back.
        const substepItems = {
            type: 'OBJECT',
            properties: { title: { type: 'STRING' } },
            required: ['title']
        };
        const stepItems = {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING' },
                children: { type: 'ARRAY', items: substepItems }
            },
            required: ['title']
        };
        const phaseItems = {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING' },
                children: { type: 'ARRAY', items: stepItems }
            },
            required: ['title', 'children']
        };

        const body = {
            contents: [{ parts }],
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: { type: 'ARRAY', items: phaseItems }
            }
        };

        let res;
        try {
            res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } catch (e) {
            throw new Error('Network error contacting Google. Check your internet connection.');
        }

        if (!res.ok) {
            // Surface Google's actual error message — it's far more specific than the HTTP code
            let detail = '';
            try {
                const errJson = await res.json();
                detail = errJson?.error?.message || '';
            } catch (e) { /* body wasn't JSON */ }

            if (res.status === 400 || res.status === 403) {
                throw new Error('API key rejected (HTTP ' + res.status + '). ' + (detail || 'Double-check the key and that the "Generative Language API" is enabled for its project.'));
            }
            if (res.status === 404) {
                throw new Error('Model not found (HTTP 404). ' + (detail || 'The model name may be unavailable for this key.'));
            }
            if (res.status === 429) {
                throw new Error('Quota/rate limit (HTTP 429). ' + (detail || 'Free tier has per-minute and per-day limits — wait ~60s.'));
            }
            throw new Error(`Gemini request failed (HTTP ${res.status}). ${detail}`);
        }

        const json = await res.json();
        const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!raw) throw new Error('The AI returned an empty response. Try again.');

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            throw new Error('The AI returned invalid JSON. Try again or simplify the input.');
        }

        // Normalize recursively: assign fresh unique IDs + completed flags (never trust
        // AI ids), accept either `children` or `steps`, to any depth returned.
        const now = Date.now();
        const normalize = (item, path, fallback) => {
            const title = typeof item === 'string'
                ? item
                : (typeof item.title === 'string' ? item.title : fallback);
            const kids = (item && typeof item === 'object')
                ? (Array.isArray(item.children) ? item.children : (Array.isArray(item.steps) ? item.steps : null))
                : null;
            if (Array.isArray(kids) && kids.length > 0) {
                return {
                    id: `p-${now}-${path}`,
                    title,
                    children: kids.map((c, k) => normalize(c, `${path}-${k}`, `Item ${k + 1}`))
                };
            }
            return { id: `s-${now}-${path}`, title, completed: false };
        };

        const topLevel = Array.isArray(parsed) ? parsed : [];
        return topLevel.map((phase, i) => {
            const node = normalize(phase, String(i), `Phase ${i + 1}`);
            // Top-level items are phases (containers) — ensure a children array.
            if (!Array.isArray(node.children)) {
                delete node.completed;
                node.children = [];
            }
            return node;
        });
    }

    syncStepStatusAlignment() {
        const rows = Array.from(this.els.viewModalContent.querySelectorAll('.step-row'));

        rows.forEach((row, index) => {
            const card = row.querySelector('.step-card');
            const nextCard = rows[index + 1]?.querySelector('.step-card');
            const cardHeight = card ? card.getBoundingClientRect().height : 64;
            const nextCardHeight = nextCard ? nextCard.getBoundingClientRect().height : cardHeight;

            row.style.setProperty('--step-card-height', `${cardHeight}px`);
            row.style.setProperty('--next-step-card-height', `${nextCardHeight}px`);
        });
    }

    renderFlowchartCanvas(fc) {
        // Preserve horizontal scroll position across the full re-render
        const prevColumns = this.els.viewModalContent.querySelector('.canvas-columns');
        const prevScrollLeft = prevColumns ? prevColumns.scrollLeft : 0;
        const prevMap = this.els.viewModalContent.querySelector('.ft-map');
        const prevMapScrollLeft = prevMap ? prevMap.scrollLeft : 0;
        const prevCanvasScrollTop = this.els.viewModalContent.scrollTop;

        this.els.viewModalContent.innerHTML = '';

        const canvas = document.createElement('div');
        canvas.className = 'flowchart-canvas';

        const { total: totalSteps, completed: completedSteps } = this._progress(fc.phases);
        const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
        const isFullyComplete = totalSteps > 0 && completedSteps === totalSteps;
        const prevPercent = this._prevBarPercent ?? 0;
        this._prevBarPercent = percent;

        const isMap = this.state.viewMode === 'map';
        this._updateMapToggleAllButton(fc);

        let html = `
            <div class="canvas-header-card">
                <div class="canvas-header-left">
                    <h2 class="canvas-title">${this._escapeHtml(fc.name)}</h2>
                    <div class="canvas-subtitle">${completedSteps} / ${totalSteps} steps complete</div>
                </div>
                <div class="canvas-header-right">
                    <div class="progress-bar-track">
                        <div class="progress-bar-fill${isFullyComplete ? ' progress-bar-complete' : ''}" style="--prev-width: ${prevPercent}%; --target-width: ${percent}%"></div>
                    </div>
                    <span class="progress-percent${isFullyComplete ? ' progress-percent-complete' : ''}">${percent}%</span>
                </div>
            </div>
        `;

        html += isMap ? this._renderFlowchartMap(fc) : this._renderFlowchartColumns(fc);

        canvas.innerHTML = html;
        this.els.viewModalContent.appendChild(canvas);

        // Restore the horizontal scroll position so toggling a step doesn't jump back to Phase 1
        const newColumns = canvas.querySelector('.canvas-columns');
        if (newColumns) newColumns.scrollLeft = prevScrollLeft;
        const newMap = canvas.querySelector('.ft-map');
        if (newMap) newMap.scrollLeft = prevMapScrollLeft;
        this.els.viewModalContent.scrollTop = prevCanvasScrollTop;

        // Hide the default modal header title since we have the large canvas title now
        this.els.viewModalTitle.style.display = 'none';

        if (!isMap) {
            const syncAlignment = () => this.syncStepStatusAlignment();
            syncAlignment();
            requestAnimationFrame(syncAlignment);
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(syncAlignment);
            }
        } else {
            const trim = () => this._trimMapSlack(canvas);
            trim();
            requestAnimationFrame(trim);
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(trim);
            }
        }
    }

    // The centred org-chart leaves symmetric blank slack around the node cluster
    // (a flexbox intrinsic-sizing quirk). When the tree overflows the frame, trim
    // that slack with negative margins so scrolling reaches the true left/right
    // edges with no dead gap. When it fits, leave it centred.
    _trimMapSlack(canvas) {
        const map = canvas.querySelector('.ft-map');
        if (!map) return;
        const rootUl = map.querySelector(':scope > ul');
        const nodes = map.querySelectorAll('.ft-map-node');
        if (!rootUl || !nodes.length) return;

        rootUl.style.marginLeft = '';
        rootUl.style.marginRight = '';
        if (map.scrollWidth <= map.clientWidth + 1) return; // fits — keep centred

        const ulBox = rootUl.getBoundingClientRect();
        let minL = Infinity, maxR = -Infinity;
        nodes.forEach(n => {
            const r = n.getBoundingClientRect();
            if (r.left < minL) minL = r.left;
            if (r.right > maxR) maxR = r.right;
        });
        const leftGap = minL - ulBox.left;
        const rightGap = ulBox.right - maxR;
        if (leftGap > 2) rootUl.style.marginLeft = `${-leftGap}px`;
        if (rightGap > 2) rootUl.style.marginRight = `${-rightGap}px`;
    }

    // ---- List view: top-level phases as horizontal columns; children nested ----

    _renderFlowchartColumns(fc) {
        let html = '<div class="canvas-columns">';

        if (!fc.phases || fc.phases.length === 0) {
            html += '<div style="display:flex; align-items:center; justify-content:center; width:100%; color:var(--text-secondary); font-style:italic; font-size:1.2rem;">No phases in this flowchart. Click "New Phase" to start.</div></div>';
            return html;
        }

        const sequenceNumbers = this._buildNodeSequenceNumbers(fc.phases);

        fc.phases.forEach((phase, phaseIndex) => {
            const phaseCompleteClass = this._isComplete(phase) ? 'phase-completed' : '';
            const hasChildren = Array.isArray(phase.children) && phase.children.length > 0;
            const hasNesting = hasChildren && phase.children.some(node => this._isContainer(node));
            const phaseSequence = sequenceNumbers.get(phase.id);
            const phaseLabel = phaseSequence ? phaseSequence.label : `Phase ${phaseIndex + 1}`;
            const phaseTitle = this._displayNodeTitle(phase.title, phaseLabel);

            html += `
                <div class="phase-col ${phaseCompleteClass} ${hasNesting ? 'has-nesting' : ''}" data-node-id="${phase.id}">
                    <div class="phase-header" title="Right-click for phase options">
                        <span class="phase-sequence-label">${phaseLabel}</span>
                        ${phaseTitle ? `<h3>${this._escapeHtml(phaseTitle)}</h3>` : ''}
                        ${phaseIndex < fc.phases.length - 1 ? `
                            <div class="phase-connector ${phaseCompleteClass}">
                                <svg width="48" height="20" viewBox="0 0 48 20" preserveAspectRatio="none">
                                    <line class="phase-arrow-line" x1="0" y1="10" x2="38" y2="10" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="butt"/>
                                    <polygon class="phase-arrow-head" points="38,5.5 38,14.5 45,10" fill="var(--primary-color)" stroke="var(--primary-color)" stroke-width="1.5" stroke-linejoin="round"/>
                                </svg>
                            </div>
                        ` : ''}
                    </div>
            `;

            if (hasChildren) {
                html += `
                    <div class="s-connector">
                        <svg width="20" height="30" viewBox="0 0 20 30" preserveAspectRatio="none">
                            <path class="s-path" d="M 0,0 C 0,15 20,15 20,30" fill="none" stroke="var(--primary-color)" stroke-width="1.5" />
                            <circle class="s-dot" cx="0" cy="0" r="2" fill="var(--primary-color)" />
                            <circle class="s-dot" cx="20" cy="30" r="2" fill="var(--primary-color)" />
                        </svg>
                    </div>
                    <div class="node-list">
                        ${this._renderNodes(phase.children, 1, sequenceNumbers)}
                    </div>
                `;
            }

            const emptyPhaseClass = hasChildren ? '' : 'empty-phase';
            html += `
                    <div class="add-step-wrapper ${emptyPhaseClass}">
                        <button class="btn-add-step" data-node-id="${phase.id}">+ Add Step</button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    // Render a sibling list of nodes at a given depth (leaves + containers mixed).
    _renderNodes(nodes, depth, sequenceNumbers) {
        return (nodes || []).map((node, index) =>
            this._isContainer(node)
                ? this._renderContainer(node, depth, nodes, index, sequenceNumbers)
                : this._renderLeaf(node, depth, nodes, index, sequenceNumbers)
        ).join('');
    }

    _renderLeaf(node, depth, siblings, index, sequenceNumbers) {
        const isChecked = node.completed ? 'checked' : '';
        const next = siblings[index + 1];
        const sequence = sequenceNumbers.get(node.id);
        const typeLabel = sequence ? sequence.label : this._nodeTypeName(depth, false);
        const displayTitle = this._displayNodeTitle(node.title, typeLabel);
        // Only chain the connector arrow/line to the next sibling when it's also a leaf.
        const nextIsLeaf = !!next && !this._isContainer(next);
        const drawConnector = nextIsLeaf;
        const nextChecked = (nextIsLeaf && next.completed) ? 'next-checked' : '';

        return `
            <div class="step-row ${isChecked} ${nextChecked}" data-node-id="${node.id}">
                <div class="step-status">
                    <div class="check-circle ${isChecked}">
                        <svg viewBox="0 0 24 24"><polyline points="20 6.5 9 17.5 4 12.5"></polyline></svg>
                    </div>
                    ${drawConnector ? `<div class="status-line ${isChecked} ${nextChecked}"></div>` : ''}
                </div>
                <div class="step-card-wrapper">
                    <div class="step-card">
                        <span class="step-sequence-label">${typeLabel}</span>
                        ${displayTitle ? `<span class="step-title">${this._escapeHtml(displayTitle)}</span>` : ''}
                    </div>
                    ${drawConnector ? `
                        <div class="card-arrow">
                            <svg width="14" height="26">
                                <line class="arrow-line" x1="7" y1="0" x2="7" y2="18" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="butt"/>
                                <polygon class="arrow-head" points="2.5,18 11.5,18 7,23.5" fill="var(--primary-color)" stroke="var(--primary-color)" stroke-width="1.5" stroke-linejoin="round"/>
                            </svg>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    _renderContainer(node, depth, siblings, index, sequenceNumbers) {
        const collapsed = this.state.collapsedNodes.has(node.id);
        const { total, completed } = this._progress(node.children);
        const complete = total > 0 && completed === total;
        const sequence = sequenceNumbers.get(node.id);
        const typeLabel = sequence ? sequence.label : this._nodeTypeName(depth, true);
        const displayTitle = this._displayNodeTitle(node.title, typeLabel);

        const caret = collapsed
            ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>'
            : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

        return `
            <div class="subphase ${complete ? 'complete' : ''} ${collapsed ? 'collapsed' : ''}" data-node-id="${node.id}">
                <div class="subphase-header" title="Right-click for options">
                    <span class="subphase-caret">${caret}</span>
                    <span class="node-type-chip">${typeLabel}</span>
                    ${displayTitle ? `<span class="subphase-title">${this._escapeHtml(displayTitle)}</span>` : ''}
                    <span class="subphase-count">${completed}/${total}</span>
                </div>
                ${collapsed ? '' : `
                    <div class="node-children">
                        ${this._renderNodes(node.children, depth + 1, sequenceNumbers)}
                        <div class="add-step-wrapper">
                            <button class="btn-add-step" data-node-id="${node.id}">+ Add Step</button>
                        </div>
                    </div>
                `}
            </div>
        `;
    }

    // ---- Map view: editable org-chart of connected boxes (CSS connectors) ----

    _renderFlowchartMap(fc) {
        if (!fc.phases || fc.phases.length === 0) {
            return '<div class="ft-map-empty">No phases in this flowchart. Click "New Phase" to start.</div>';
        }
        const { total, completed } = this._progress(fc.phases);
        const rootComplete = total > 0 && completed === total;
        const sequenceNumbers = this._buildNodeSequenceNumbers(fc.phases);

        let html = '<div class="ft-map"><ul>';
        html += `<li${rootComplete ? ' class="complete"' : ''}>${this._mapNodeBox({
            title: fc.name, isRoot: true, isContainer: true,
            complete: rootComplete, count: `${completed}/${total}`
        })}`;
        html += '<ul>' + fc.phases.map(n => this._renderMapNode(n, 0, sequenceNumbers)).join('') + '</ul>';
        html += '</li></ul></div>';
        return html;
    }

    _renderMapNode(node, depth, sequenceNumbers) {
        const isContainer = this._isContainer(node);
        const complete = this._isComplete(node);
        const hasChildren = isContainer && node.children.length > 0;
        const collapsed = hasChildren && this.state.collapsedNodes.has(node.id);
        let count = '';
        if (isContainer) {
            const p = this._progress(node.children);
            count = `${p.completed}/${p.total}`;
        }
        const sequence = sequenceNumbers.get(node.id);
        const typeName = sequence ? sequence.label : this._nodeTypeName(depth, isContainer);
        const displayTitle = this._displayNodeTitle(node.title, typeName);

        // `complete` on the <li> lets CSS paint this node's connector lines green.
        const liClasses = [complete ? 'complete' : '', collapsed ? 'collapsed' : ''].filter(Boolean).join(' ');
        let html = `<li${liClasses ? ` class="${liClasses}"` : ''}>${this._mapNodeBox({
            nodeId: node.id, title: displayTitle, typeName, isContainer,
            complete, count, hasChildren, collapsed
        })}`;
        if (hasChildren && !collapsed) {
            html += '<ul>' + node.children.map(c => this._renderMapNode(c, depth + 1, sequenceNumbers)).join('') + '</ul>';
        }
        html += '</li>';
        return html;
    }

    _mapNodeBox({ nodeId, title, typeName, isRoot, isContainer, complete, count, hasChildren, collapsed }) {
        const cls = [
            'ft-map-node',
            isRoot ? 'root' : '',
            isContainer ? 'container' : 'leaf',
            complete ? 'complete' : ''
        ].filter(Boolean).join(' ');
        const tag = isRoot ? 'div' : 'button';
        const action = isContainer ? (hasChildren ? 'toggle-collapse' : '') : 'toggle-leaf';
        const interactionAttrs = isRoot ? '' : [
            'type="button"',
            `data-node-id="${nodeId}"`,
            action ? `data-map-action="${action}"` : '',
            !isContainer ? `aria-pressed="${complete ? 'true' : 'false'}"` : '',
            isContainer && hasChildren ? `aria-expanded="${collapsed ? 'false' : 'true'}"` : '',
            `title="${isContainer && hasChildren ? 'Click to collapse or expand; right-click for options' : (!isContainer ? 'Click to toggle completion; right-click for options' : 'Right-click for options')}"`
        ].filter(Boolean).join(' ');
        return `
            <${tag} class="${cls}" ${interactionAttrs}>
                ${typeName ? `<span class="ft-map-type">${typeName}</span>` : ''}
                ${title ? `<span class="ft-map-title">${this._escapeHtml(title)}</span>` : ''}
                ${count ? `<span class="ft-map-count">${count}</span>` : ''}
            </${tag}>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
