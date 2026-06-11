// app.js
// UI Orchestrator — mirrors Formulae's App class

class App {
    constructor() {
        this.library = new window.FlowchartLibrary();

        this.state = {
            currentSelection: 'general',
            viewingFlowchartId: null,
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
            
            inputTxt.style.display = 'none';
            inputSel.style.display = 'none';

            let firstFocusable = btnCancel;

            if (options.type === 'text') {
                inputTxt.style.display = 'block';
                inputTxt.value = options.initialValue || '';
                firstFocusable = inputTxt;
            } else if (options.type === 'select') {
                inputSel.style.display = 'block';
                inputSel.innerHTML = '';
                (options.selectOptions || []).forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt.value;
                    o.textContent = opt.label;
                    inputSel.appendChild(o);
                });
                firstFocusable = inputSel;
            }

            const getFocusableElements = () => {
                return Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
                    .filter(el => el.style.display !== 'none' && !el.disabled);
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
                    fc.phases.push({ id: 'p-' + Date.now(), title: name.trim(), steps: [] });
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
                        this.library.updateFlowchartData(this.state.viewingFlowchartId, parsed);
                        this.els.jsonModal.classList.remove('visible');
                        const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
                        this.renderFlowchartCanvas(fc);
                        this.renderSidebar();
                    } else {
                        this.els.jsonError.textContent = 'JSON must be an array of phases.';
                    }
                } catch (e) {
                    this.els.jsonError.textContent = 'Invalid JSON format.';
                }
            });
        }

        // Flowchart Canvas Interactions (delegated on view modal content)
        if (this.els.viewModalContent) {
            this.els.viewModalContent.addEventListener('click', async (e) => {
                if (e.target.closest('.btn-add-step')) {
                    const phaseId = e.target.closest('.btn-add-step').dataset.phaseId;
                    const name = await this.showCustomModal({ title: "New Step", message: "Enter step description:", type: "text" });
                    if (name && name.trim()) {
                        const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
                        const phase = fc.phases.find(p => p.id === phaseId);
                        if (phase) {
                            phase.steps.push({ id: 's-' + Date.now(), title: name.trim(), completed: false });
                            this.library.saveData();
                            this.renderFlowchartCanvas(fc);
                        }
                    }
                }

                if (e.target.closest('.step-row')) {
                    const row = e.target.closest('.step-row');
                    const stepId = row.dataset.stepId;
                    const phaseId = row.dataset.phaseId;
                    const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
                    const phase = fc.phases.find(p => p.id === phaseId);
                    if (phase) {
                        const step = phase.steps.find(s => s.id === stepId);
                        if (step) {
                            step.completed = !step.completed;
                            this.library.saveData();
                            this.renderFlowchartCanvas(fc);
                        }
                    }
                }
            });

            this.els.viewModalContent.addEventListener('contextmenu', (e) => {
                const row = e.target.closest('.step-row');
                if (!row) return;
                e.preventDefault();

                const stepId = row.dataset.stepId;
                const phaseId = row.dataset.phaseId;

                // Remove any existing context menu
                document.getElementById('step-context-menu')?.remove();

                const menu = document.createElement('div');
                menu.id = 'step-context-menu';
                menu.className = 'step-context-menu';
                menu.innerHTML = `
                    <button data-action="before">Add Step Before</button>
                    <button data-action="after">Add Step After</button>
                    <div class="context-menu-divider"></div>
                    <button data-action="delete" class="context-menu-danger">Delete Step</button>
                `;

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

                const dismiss = () => menu.remove();

                menu.addEventListener('click', async (ev) => {
                    const action = ev.target.closest('button')?.dataset.action;
                    if (!action) return;
                    dismiss();

                    const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
                    const phase = fc.phases.find(p => p.id === phaseId);
                    if (!phase) return;
                    const idx = phase.steps.findIndex(s => s.id === stepId);
                    if (idx === -1) return;

                    if (action === 'delete') {
                        const confirmed = await this.showCustomModal({
                            title: "Delete Step",
                            message: `Delete "${phase.steps[idx].title}"?`,
                            type: "confirm"
                        });
                        if (!confirmed) return;
                        phase.steps.splice(idx, 1);
                        this.library.saveData();
                        this.renderFlowchartCanvas(fc);
                        return;
                    }

                    const name = await this.showCustomModal({ title: "New Step", message: "Enter step description:", type: "text" });
                    if (!name || !name.trim()) return;
                    const newStep = { id: 's-' + Date.now(), title: name.trim(), completed: false };
                    const insertAt = action === 'before' ? idx : idx + 1;
                    phase.steps.splice(insertAt, 0, newStep);
                    this.library.saveData();
                    this.renderFlowchartCanvas(fc);
                });

                // Dismiss on outside click, Escape, or scroll
                const onDismiss = (ev) => {
                    if (!menu.contains(ev.target)) {
                        dismiss();
                        cleanup();
                    }
                };
                const onKey = (ev) => { if (ev.key === 'Escape') { dismiss(); cleanup(); } };
                const cleanup = () => {
                    document.removeEventListener('click', onDismiss);
                    document.removeEventListener('keydown', onKey);
                };
                // Defer so this contextmenu event doesn't immediately close the menu
                setTimeout(() => document.addEventListener('click', onDismiss), 0);
                document.addEventListener('keydown', onKey);
            });
        }

        this.attachDragAndDrop();
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
        this._prevBarPercent = null;
        this.els.viewModalTitle.textContent = fc.name;
        this.els.viewModal.classList.add('visible');
        this._updateNavButtons();
        this.renderFlowchartCanvas(fc);
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

Break the work into logical "Phases". Each Phase contains a series of actionable "Steps".

Rules:
1. Phase titles should be clear (e.g. "Phase 1: Planning").
2. Keep step titles concise, clear, and actionable (ideally 3-7 words).
3. Order phases and steps in the sequence the work should be performed.
4. Output only the structured data — no commentary.

${dataSection.trim() ? 'Here is the project data:\n' + dataSection : 'Use the attached file(s) as the project data.'}`;

        const parts = [{ text: promptText }];
        for (const f of binaryFiles) {
            const data = await this._fileToBase64(f);
            parts.push({ inlineData: { mimeType: f.type, data } });
        }

        const body = {
            contents: [{ parts }],
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        properties: {
                            title: { type: 'STRING' },
                            steps: {
                                type: 'ARRAY',
                                items: {
                                    type: 'OBJECT',
                                    properties: { title: { type: 'STRING' } },
                                    required: ['title']
                                }
                            }
                        },
                        required: ['title', 'steps']
                    }
                }
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

        // Normalize: assign fresh unique IDs + completed flags (never trust AI ids)
        const now = Date.now();
        return (Array.isArray(parsed) ? parsed : []).map((phase, i) => ({
            id: `p-${now}-${i}`,
            title: typeof phase.title === 'string' ? phase.title : `Phase ${i + 1}`,
            steps: (Array.isArray(phase.steps) ? phase.steps : []).map((step, j) => ({
                id: `s-${now}-${i}-${j}`,
                title: typeof step.title === 'string' ? step.title : (typeof step === 'string' ? step : `Step ${j + 1}`),
                completed: false
            }))
        }));
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

        this.els.viewModalContent.innerHTML = '';

        const canvas = document.createElement('div');
        canvas.className = 'flowchart-canvas';

        const allSteps = fc.phases.flatMap(p => p.steps);
        const totalSteps = allSteps.length;
        const completedSteps = allSteps.filter(s => s.completed).length;
        const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
        const isFullyComplete = totalSteps > 0 && completedSteps === totalSteps;
        const prevPercent = this._prevBarPercent ?? 0;
        this._prevBarPercent = percent;

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
            <div class="canvas-columns">
        `;

        if (fc.phases.length === 0) {
            html += '<div style="display:flex; align-items:center; justify-content:center; width:100%; color:var(--text-secondary); font-style:italic; font-size:1.2rem;">No phases in this flowchart. Click "New Phase" to start.</div>';
        } else {
            fc.phases.forEach((phase, phaseIndex) => {
                const isPhaseComplete = phase.steps.length > 0 && phase.steps.every(s => s.completed);
                const phaseCompleteClass = isPhaseComplete ? 'phase-completed' : '';

                html += `
                    <div class="phase-col ${phaseCompleteClass}">
                        <div class="phase-header">
                            <h3>${this._escapeHtml(phase.title)}</h3>
                            ${phaseIndex < fc.phases.length - 1 ? `
                                <div class="phase-connector ${phaseCompleteClass}">
                                    <svg width="48" height="20" viewBox="0 0 48 20" preserveAspectRatio="none">
                                        <line class="phase-arrow-line" x1="0" y1="10" x2="38" y2="10" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round"/>
                                        <polygon class="phase-arrow-head" points="38,5 38,15 46,10" fill="var(--primary-color)" stroke="var(--primary-color)" stroke-width="2.5" stroke-linejoin="round"/>
                                    </svg>
                                </div>
                            ` : ''}
                        </div>
                `;

                if (phase.steps.length > 0) {
                    html += `
                        <div class="s-connector">
                            <svg width="20" height="30" viewBox="0 0 20 30" preserveAspectRatio="none">
                                <path class="s-path" d="M 0,0 C 0,15 20,15 20,30" fill="none" stroke="var(--primary-color)" stroke-width="1.5" />
                                <circle class="s-dot" cx="0" cy="0" r="2" fill="var(--primary-color)" />
                                <circle class="s-dot" cx="20" cy="30" r="2" fill="var(--primary-color)" />
                            </svg>
                        </div>
                        <div class="step-list">
                    `;

                    phase.steps.forEach((step, index) => {
                        const isChecked = step.completed ? 'checked' : '';
                        const isLast = index === phase.steps.length - 1;
                        const nextChecked = (!isLast && phase.steps[index + 1].completed) ? 'next-checked' : '';

                        html += `
                            <div class="step-row ${isChecked} ${nextChecked}" data-step-id="${step.id}" data-phase-id="${phase.id}">
                                <div class="step-status">
                                    <div class="check-circle ${isChecked}">
                                        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    ${!isLast ? `<div class="status-line ${isChecked} ${nextChecked}"></div>` : ''}
                                </div>
                                <div class="step-card-wrapper">
                                    <div class="step-card">
                                        <span class="step-title">${this._escapeHtml(step.title)}</span>
                                    </div>
                                    ${!isLast ? `
                                        <div class="card-arrow">
                                            <svg width="14" height="26">
                                                <line class="arrow-line" x1="7" y1="0" x2="7" y2="18" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round"/>
                                                <polygon class="arrow-head" points="2,18 12,18 7,24" fill="var(--primary-color)" stroke="var(--primary-color)" stroke-width="2.5" stroke-linejoin="round"/>
                                            </svg>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        `;
                    });

                    html += `
                        </div>
                    `;
                }

                const emptyPhaseClass = phase.steps.length === 0 ? 'empty-phase' : '';

                html += `
                        <div class="add-step-wrapper ${emptyPhaseClass}">
                            <button class="btn-add-step" data-phase-id="${phase.id}">+ Add Step</button>
                        </div>
                    </div>
                `;
            });
        }

        html += `
            </div>
        `;
        
        canvas.innerHTML = html;
        this.els.viewModalContent.appendChild(canvas);

        // Restore the horizontal scroll position so toggling a step doesn't jump back to Phase 1
        const newColumns = canvas.querySelector('.canvas-columns');
        if (newColumns) newColumns.scrollLeft = prevScrollLeft;

        // Hide the default modal header title since we have the large canvas title now
        this.els.viewModalTitle.style.display = 'none';

        const syncAlignment = () => this.syncStepStatusAlignment();
        syncAlignment();
        requestAnimationFrame(syncAlignment);
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(syncAlignment);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
