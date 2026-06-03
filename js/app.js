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
                    
                    if (categories.length === 0) {
                        alert('Create a category first before assigning flowcharts.');
                        return;
                    }
                    
                    const sortedCats = [...categories].sort((a, b) => a.name.localeCompare(b.name));
                    
                    let selectOptions = [];
                    sortedCats.forEach((c) => {
                        selectOptions.push({ label: c.name, value: c.id });
                    });
                    
                    const choice = await this.showCustomModal({
                        title: "Move to Category",
                        message: "Select a category to assign to:",
                        type: "select",
                        selectOptions: selectOptions
                    });
                    
                    if (choice !== null) {
                        this.library.assignFlowchartToCategory(fcId, choice);
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
                document.querySelectorAll('.unit-list li').forEach(el => el.classList.remove('drag-over'));
            });

            this.els.sidebarList.addEventListener('dragover', (e) => {
                e.preventDefault();
                const li = e.target.closest('li');
                if (!li || li.dataset.id === 'general' || li.dataset.id === draggedId) return;
                li.classList.add('drag-over');
            });

            this.els.sidebarList.addEventListener('dragleave', (e) => {
                const li = e.target.closest('li');
                if (li) li.classList.remove('drag-over');
            });

            this.els.sidebarList.addEventListener('drop', (e) => {
                e.preventDefault();
                const targetLi = e.target.closest('li');
                if (!targetLi || targetLi.dataset.id === 'general') return;

                const targetId = targetLi.dataset.id;
                if (draggedId && draggedId !== targetId) {
                    const flowcharts = this.library.getFlowcharts();
                    const fromIndex = flowcharts.findIndex(f => f.id === draggedId);
                    const toIndex = flowcharts.findIndex(f => f.id === targetId);

                    if (fromIndex !== -1 && toIndex !== -1) {
                        this.library.reorderFlowcharts(fromIndex, toIndex);
                        this.renderSidebar();
                    }
                }
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

    openFlowchartView(fc) {
        this.state.viewingFlowchartId = fc.id;
        this.els.viewModalTitle.textContent = fc.name;
        this.els.viewModal.classList.add('visible');
        this.renderFlowchartCanvas(fc);
    }

    renderFlowchartCanvas(fc) {
        this.els.viewModalContent.innerHTML = '';
        
        const canvas = document.createElement('div');
        canvas.className = 'flowchart-canvas';

        let html = `
            <div class="canvas-title-wrapper">
                <h2 class="canvas-title">${this._escapeHtml(fc.name)}</h2>
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
                                        <line class="phase-arrow-line" x1="0" y1="10" x2="45" y2="10" stroke="var(--primary-color)" stroke-width="2"/>
                                        <polygon class="phase-arrow-head" points="38,5 48,10 38,15" fill="var(--primary-color)"/>
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
                                            <svg width="10" height="25">
                                                <line class="arrow-line" x1="5" y1="0" x2="5" y2="20" stroke="var(--primary-color)" stroke-width="1.5"/>
                                                <polygon class="arrow-head" points="2,20 8,20 5,25" fill="var(--primary-color)"/>
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
        
        // Hide the default modal header title since we have the large canvas title now
        this.els.viewModalTitle.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
