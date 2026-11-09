// app.js
// UI Orchestrator — mirrors Formulae's App class

// Category colours (Reminders-style). Categories without a saved colour get one from this list by position.
const FT_SWATCHES = ['#2563eb', '#ff9500', '#af52de', '#30b0c7', '#34c759', '#ff2d55', '#a2845e', '#8e8e93'];
// Appearance: System (default, follows the OS live), Light or Dark. Remembered per browser.
const FT_THEME_NAMES = { system: 'System', light: 'Light', dark: 'Dark' };
const FT_THEME_ICONS = { system: 'system', light: 'sun', dark: 'moon' };
// Sidebar library filters; any other filter value is a category id.
const FT_FILTERS = {
    all: { name: 'All Flowcharts', icon: 'all' },
    progress: { name: 'In Progress', icon: 'progress' },
    done: { name: 'Completed', icon: 'doneOutline' }
};
// Gemini models for AI generation, best first. The free ones also form the fallback chain in
// generateFlowchartFromAI(): each has its own quota, so a model that is out of quota hands over to the next.
const FT_MODELS = [
    { h: 'Free' },
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', note: 'Recommended', free: true },
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', note: 'Previous Flash', free: true },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', note: 'Fastest, highest daily limit', free: true },
    { id: 'gemma-4-31b-it', name: 'Gemma 4 31B', note: 'Open model', free: true },
    { id: 'gemma-4-26b-a4b-it', name: 'Gemma 4 26B', note: 'Open model, faster', free: true },
    { h: 'Paid' },
    { id: 'gemini-4-argon', name: 'Gemini 4 Argon', note: 'Most capable, needs billing' }
];
const FT_AI_MAX_BYTES = 20 * 1024 * 1024;   // inline upload limit per file

class App {
    constructor() {
        this.library = new window.FlowchartLibrary();
        this.I = window.FT_ICONS;

        this.state = {
            filter: 'all',                    // sidebar filter: 'all' | 'progress' | 'done' | a category id
            query: '',                        // sidebar search, kept in the case it was typed
            viewingFlowchartId: null,
            viewMode: 'list',                 // 'list' | 'map' — how the open flowchart is shown
            // Like Apple Reminders: completed items are hidden unless the viewer chooses to show them.
            // A viewer preference (saved per browser), never part of flowchart data.
            hideCompleted: localStorage.getItem('flowtracker_hide_completed') !== 'false',
            pendingHide: new Set()            // just-checked leaves kept on screen until the hide delay ends
        };

        // Collapse state is in memory only (never persisted or exported). List and Map keep separate sets,
        // so collapsing in Map never strands collapsed groups in List; state.collapsedNodes is the current view's.
        this._collapsedByMode = { list: new Set(), map: new Set() };
        Object.defineProperty(this.state, 'collapsedNodes', { get: () => this._collapsedByMode[this.state.viewMode] });
        this._changed = new Set();            // node ids whose completion flipped on the last tick: they animate once

        let theme = 'system';
        try { theme = localStorage.getItem('flowtracker_theme') || 'system'; } catch (_) {}
        this.theme = FT_THEME_NAMES[theme] ? theme : 'system';
        this._doneShown = new Map();          // "where:flowchartId" -> whether it last showed as finished

        this.els = {
            app: document.getElementById('app'),
            sidebar: document.getElementById('sidebar'),
            mainContent: document.getElementById('main-content'),
            pageTitle: document.querySelector('[data-title]'),
            pageSub: document.querySelector('[data-sub]'),
            scrim: document.querySelector('[data-scrim]'),
            menu: document.querySelector('[data-menu]'),
            toast: document.querySelector('[data-toast]'),
            favicon: document.querySelector('[data-favicon]'),
            importInput: document.getElementById('file-import'),

            // Flowchart view
            main: document.querySelector('#app .main'),
            flow: document.querySelector('#app .flow'),
            flowTitle: document.querySelector('[data-flow-title]'),
            flowSub: document.querySelector('[data-flow-sub]'),
            flowRing: document.querySelector('[data-flow-ring]'),
            flowBody: document.querySelector('[data-flow-body]'),
            pagerCount: document.querySelector('[data-pager-count]'),
            ddPop: document.querySelector('[data-dd-pop]')
        };

        this.init();
    }

    init() {
        const I = this.I;
        document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = I[el.dataset.icon] || ''; });
        document.querySelectorAll('[data-icon-lead]').forEach(el => el.insertAdjacentHTML('afterbegin', I[el.dataset.iconLead] || ''));
        this._darkMQ = matchMedia('(prefers-color-scheme: dark)');
        this._phoneMQ = matchMedia('(max-width: 760px)');
        this._reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
        this._darkMQ.addEventListener('change', () => this.applyTheme());
        this.applyTheme();
        this.renderSidebar();
        this.renderMainContent();
        this.attachListeners();
    }

    _escapeHtml(unsafe) {
        return String(unsafe ?? '')
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // "1 step", "3 steps"; `many` for irregular plurals ("categories")
    _plural(n, one, many = one + 's') {
        return `${n} ${n === 1 ? one : many}`;
    }

    // After a library change (rename, recolour, delete, move…) everything that shows library data re-renders:
    // the sidebar, the grid, and the open flowchart's header (its category name and colour)
    _refreshLibrary() {
        const fc = this._currentFc();
        if (fc) this.renderFlowchartCanvas(fc);   // also renders the sidebar
        else this.renderSidebar();                // first: it resets a filter whose category is gone
        this.renderMainContent();
    }

    // A fresh node: a container (phase, subphase, group) or a checkable leaf
    _newNode(title, container) {
        return container ? { id: this._uid('p'), title, children: [] } : { id: this._uid('s'), title, completed: false };
    }

    // ===== Recursive node model helpers =====
    // A node is { id, title, completed?, children?: [node] }.
    // Container = has non-empty children (completion derived); leaf = checkable.

    _uid(prefix) {
        return this.library._uid(prefix);
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
    }

    // ===== Appearance =====

    applyTheme() {
        const root = document.documentElement;
        if (this.theme === 'system') delete root.dataset.theme;
        else root.dataset.theme = this.theme;
        const dark = this.theme === 'dark' || (this.theme === 'system' && this._darkMQ.matches);
        // The favicon stays flat (the 3D mark is too detailed at tab size) and follows the theme.
        if (this.els.favicon) this.els.favicon.href = `img/logo/flowtracker-flat-${dark ? 'dark' : 'light'}.svg`;
    }

    _appearanceMenuItems() {
        return ['system', 'light', 'dark'].map(t => ({
            label: FT_THEME_NAMES[t], icon: FT_THEME_ICONS[t], checked: this.theme === t,
            run: () => {
                this.theme = t;
                try { localStorage.setItem('flowtracker_theme', t); } catch (_) {}
                this.applyTheme();
                this.renderSidebar();
            }
        }));
    }

    // ===== Focus return =====
    // After a re-render, the element that had focus may have been replaced; find its twin by its data key.

    _focusSel(el) {
        if (!el || !el.dataset) return null;
        if (el.closest && el.closest('#app .card')) el = el.closest('#app .card');   // a card's title or ⋯ button
        const row = el.matches && el.matches('.side-more') && el.closest('[data-cat-row]');
        if (row) return `[data-cat-row="${CSS.escape(row.dataset.catRow)}"] .side-more`;
        const keys = ['open', 'filter', 'appearance', 'more', 'sheet', 'toggleSide', 'export', 'collapse', 'nodeId',
            'addStep', 'addSub', 'flowAction', 'mode', 'eye', 'back', 'step'];
        const k = keys.find(key => key in el.dataset);
        if (!k) return null;
        return `[data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(el.dataset[k])}"]`;
    }

    _refocus(el, sel = this._focusSel(el)) {
        const canFocus = x => x && x.isConnected && x.offsetParent !== null && !x.closest('.menu');
        let t = canFocus(el) ? el : (sel ? [...document.querySelectorAll(sel)].find(canFocus) : null);
        if (t && t.matches('.card')) t = t.querySelector('.card-link');
        if (t && t.focus) t.focus({ preventScroll: true });
    }

    // An action that re-renders (move, delete…) may replace the element it returned focus to;
    // once it is done, find that element's twin, unless a sheet or something else has taken focus.
    _refocusSoon(el, sel) {
        setTimeout(() => {
            const a = document.activeElement;
            if (!this._sheetOpen() && (!a || a === document.body || !a.isConnected)) this._refocus(el, sel);
        }, 0);
    }

    // ===== Sheets (dialogs) =====
    // One scrim holds every sheet. openSheet(id, cfg) shows one; cfg.onClose(result) runs when it closes
    // (result is undefined when cancelled). showCustomModal wraps this in a Promise for the older call sites.

    _sheet(id) {
        return this.els.scrim.querySelector(`[data-sheet-id="${id}"]`);
    }

    _sheetOpen() {
        return this.els.scrim.classList.contains('open');
    }

    openSheet(id, cfg = {}) {
        const sh = this._sheet(id);
        if (!sh) return;
        if (this._sheetOpen()) this.closeSheet();   // one sheet at a time; the earlier one counts as cancelled
        document.body.classList.remove('side-open');
        this.closeMenu();
        this._lastFocus = cfg.returnTo || document.activeElement;
        this._lastFocusSel = this._focusSel(this._lastFocus);
        this._sheetCfg = cfg;
        this.els.scrim.querySelectorAll('.sheet').forEach(s => s.classList.toggle('active', s === sh));
        if (!cfg.keep) sh.reset();    // keep: reopen with what was typed (after the AI's replace check)

        if (id === 'category') {
            const c = cfg.edit, count = c ? this.library.getFlowcharts().filter(f => f.categoryId === c.id).length : 0;
            this._catEdit = c ? c.id : null;
            this._catPick = c ? this._catColor(c) : FT_SWATCHES[this.library.getCategories().length % FT_SWATCHES.length];
            this._paintSwatches();
            sh.querySelector('#sh-cat').textContent = c ? 'Edit Category' : 'New Category';
            sh.querySelector('[data-submit]').textContent = c ? 'Save' : 'Create';
            sh.elements.name.value = c ? c.name : '';
            sh.querySelector('[data-cat-name]').textContent = c ? c.name : 'New Category';
            sh.querySelector('[data-cat-count]').textContent = count;
        }
        if (id === 'flowchart') {
            this._fcCat = FT_FILTERS[this.state.filter] ? '' : this.state.filter;
            sh.querySelector('[data-cat-chips]').innerHTML = this._catChips(this._fcCat);
        }
        if (id === 'import') this._setImportMode('file');
        if (id === 'ai' && !cfg.keep) this._resetAiSheet();
        if (id === 'json') {
            const fc = this._currentFc(), t = sh.querySelector('[data-json]');
            t.value = JSON.stringify(fc ? fc.phases : [], null, 2);
            this._checkJSON();
        }
        if (id === 'confirm') {
            sh.querySelector('[data-confirm-title]').textContent = cfg.title || 'Are you sure?';
            sh.querySelector('[data-confirm-msg]').textContent = cfg.message || '';
            sh.querySelector('[data-confirm-btn]').textContent = cfg.button || 'Delete';
        }
        if (id === 'name') {
            sh.querySelector('[data-name-title]').textContent = cfg.title || 'Name';
            sh.querySelector('[data-name-label]').textContent = cfg.label || 'Name';
            sh.querySelector('[data-name-btn]').textContent = cfg.button || 'Save';
            sh.elements.name.placeholder = cfg.placeholder || '';
            sh.elements.name.value = cfg.value || '';
        }
        if (id === 'move') {
            this._fcCat = cfg.value || '';
            sh.querySelector('[data-move-title]').textContent = cfg.title || 'Move to Category';
            sh.querySelector('[data-move-name]').textContent = cfg.subtitle || '';
            sh.querySelector('[data-move-name]').hidden = !cfg.subtitle;
            sh.querySelector('[data-move-btn]').textContent = cfg.button || 'Move';
            sh.querySelector('[data-move-chips]').innerHTML = this._catChips(this._fcCat);
        }
        this._syncSubmit(sh);
        this.els.scrim.classList.add('open');
        setTimeout(() => {
            if (id === 'ai') { this._focusAiStart(); return; }
            if (id === 'json') { const t = sh.querySelector('[data-json]'); t.focus(); t.setSelectionRange(0, 0); t.scrollTop = 0; return; }
            const input = sh.querySelector('.input:not([type=password])');
            if (input) { input.focus(); if (id === 'name' && input.value) input.select(); }
            else (sh.querySelector('[aria-checked="true"]') || sh.querySelector('[data-submit]:not(:disabled)') || sh.querySelector('[data-close]')).focus();
        }, 50);
    }

    closeSheet(result) {
        if (!this._sheetOpen()) return;
        this._closeDD();
        this.els.scrim.classList.remove('open');
        const cfg = this._sheetCfg, last = this._lastFocus, sel = this._lastFocusSel;
        this._sheetCfg = null;
        this._refocus(last, sel);
        if (cfg && cfg.onClose) cfg.onClose(result);
        this._refocusSoon(last, sel);   // callers awaiting showCustomModal re-render after this returns
    }

    // A name made only of spaces is not a name: the submit button stays disabled until there is real text.
    _syncSubmit(sh) {
        const input = sh.elements.name;
        if (!input) return;
        sh.querySelector('[data-submit]').disabled = !input.value.trim();
    }

    // Promise-based prompt used across the app: { type: 'text' | 'confirm', title, message,
    // initialValue, placeholder, confirmLabel, label, button }. Resolves to the text / true, or null.
    showCustomModal(options) {
        return new Promise(resolve => {
            if (options.type === 'text') {
                this.openSheet('name', {
                    title: options.title, label: options.label || 'Name', value: options.initialValue || '',
                    placeholder: options.placeholder || '', button: options.button || (options.initialValue ? 'Save' : 'Add'),
                    onClose: r => resolve(typeof r === 'string' ? r : null)
                });
            } else if (options.type === 'confirm') {
                this.openSheet('confirm', {
                    title: options.title, message: options.message, button: options.confirmLabel || 'Delete',
                    onClose: r => resolve(r === true)
                });
            } else {
                resolve(null);
            }
        });
    }

    _safeColor(c) {
        return typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : null;
    }

    _catColor(cat) {
        if (!cat) return 'var(--accent-fill)';
        const saved = this._safeColor(cat.color);
        if (saved) return saved;
        const i = this.library.getCategories().indexOf(cat);
        return FT_SWATCHES[(Math.max(i, 0) + 1) % FT_SWATCHES.length];
    }

    _catChips(selected) {
        const cats = this.library.getCategories();
        return cats.map(c => `<button type="button" role="radio" aria-checked="${c.id === selected}" data-pick-cat="${this._escapeHtml(c.id)}" style="--c:${this._catColor(c)}"><span class="dot"></span>${this._escapeHtml(c.name)}</button>`).join('')
            + `<button type="button" role="radio" class="none" aria-checked="${!selected}" data-pick-cat=""><span class="dot"></span>No Category</button>`;
    }

    _paintSwatches() {
        const sh = this._sheet('category');
        sh.querySelector('[data-swatches]').innerHTML = FT_SWATCHES.map(c =>
            `<button type="button" class="swatch" role="radio" aria-checked="${c === this._catPick}" aria-label="Colour ${c}" data-swatch="${c}" style="--sw:${c}">${this.I.circleTick}</button>`).join('');
        sh.querySelector('[data-cat-preview]').style.setProperty('--c', this._catPick);
    }

    // ===== Import =====

    _setImportMode(mode) {
        const sh = this._sheet('import');
        sh.querySelectorAll('[data-imp]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.imp === mode)));
        sh.querySelectorAll('[data-imp-pane]').forEach(p => { p.hidden = p.dataset.impPane !== mode; });
        this._showImportResult(null);
        this._renderImportFile(null);
        if (this.els.importInput) this.els.importInput.value = '';
    }

    // The import box takes one file: the chosen one shows below it, marked Ready when it parsed.
    _renderImportFile(file, ok) {
        this._importFile = file;
        this._sheet('import').querySelector('[data-imp-file]').innerHTML = file ? this._fileRowHTML(file, 'data-rm-import', ok) : '';
    }

    // A list of phase nodes: objects, whose children (or legacy steps) are lists of nodes too.
    _validNodes(arr) {
        return Array.isArray(arr) && arr.every(n => n && typeof n === 'object' && !Array.isArray(n)
            && (n.children === undefined || this._validNodes(n.children)) && (n.steps === undefined || this._validNodes(n.steps)));
    }

    // Accepts a FlowTracker backup ({ flowcharts, categories }) or one flowchart's phases (an array of nodes).
    _parseImport(text, name) {
        let data;
        try { data = JSON.parse(text); }
        catch (err) {
            const at = String(err.message).match(/line (\d+) column (\d+)/);
            return { error: `This isn't valid JSON${at ? ` (line ${at[1]}, column ${at[2]})` : ''}.` };
        }
        if (data && !Array.isArray(data) && typeof data === 'object' && Array.isArray(data.flowcharts)) {
            const fcs = data.flowcharts.length, cats = Array.isArray(data.categories) ? data.categories.length : 0;
            return { kind: 'backup', data, name, count: `${this._plural(fcs, 'flowchart')}, ${this._plural(cats, 'category', 'categories')}`,
                hint: 'Replaces all flowcharts and categories in this browser. Export first if you want to keep them.' };
        }
        if (this._validNodes(data)) {
            const { total } = this._progress(this.library.normalizeNodes(JSON.parse(text)));
            return { kind: 'phases', data, name, count: `${this._plural(data.length, 'phase')}, ${this._plural(total, 'step')}`,
                hint: `Adds a new flowchart named “${name}”.` };
        }
        return { error: 'This isn’t a FlowTracker backup or a list of phases.' };
    }

    _showImportResult(res) {
        const sh = this._sheet('import');
        const row = sh.querySelector('[data-imp-result]'), hint = sh.querySelector('[data-imp-hint]');
        this._importPending = res && !res.error ? res : null;
        row.hidden = !this._importPending;
        if (this._importPending) {
            sh.querySelector('[data-imp-name]').textContent = res.name;
            sh.querySelector('[data-imp-count]').textContent = res.count;
        }
        hint.hidden = !res;
        hint.textContent = res ? (res.error || res.hint) : '';
        hint.classList.toggle('warn', !!res && (!!res.error || res.kind === 'backup'));
        sh.querySelector('[data-imp-go]').disabled = !this._importPending;
    }

    // Takes a FileList (picked or dropped) and reads its first .json file
    _readImportFile(files) {
        const all = [...(files || [])];
        if (!all.length) return;
        const file = all.find(f => /\.json$/i.test(f.name) || f.type === 'application/json');
        const show = (res, f = file) => { this._showImportResult(res); this._renderImportFile(f, !res.error); };
        if (!file) { show({ error: `“${all[0].name}” isn’t a .json file. Choose a FlowTracker backup or a phases file.` }, null); return; }
        this._fileToText(file).then(
            text => show(this._parseImport(String(text), file.name.replace(/\.json$/i, '') || 'Imported Flowchart')),
            () => show({ error: 'That file could not be read.' }));
    }

    _runImport() {
        const res = this._importPending;
        if (!res) return;
        if (res.kind === 'backup') {
            if (!this.library.importFromJSON(JSON.stringify(res.data))) {
                this._showImportResult({ error: 'Import failed: the backup could not be read.' });
                return;
            }
            this.state.filter = 'all';
            this._doneShown.clear();
            this.toast(`Imported ${res.count}`);
        } else {
            const fc = this.library.createFlowchart(res.name, null);
            this.library.updateFlowchartData(fc.id, this.library.normalizeNodes(res.data));
            this.toast(`Added “${this._escapeHtml(res.name)}”`);
        }
        this._refreshLibrary();
        this.closeSheet();
    }

    _export() {
        const json = this.library.exportToJSON();
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'flowtracker-backup.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.toast(`Exported ${this._plural(this.library.getFlowcharts().length, 'flowchart')}`);
    }

    // `html` must already be escaped; callers only pass fixed text and escaped names.
    toast(html) {
        const el = this.els.toast;
        el.innerHTML = this.I.done + `<span>${html}</span>`;
        el.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }

    // ===== Menus (right-click, Appearance) =====
    // items: { label, icon?, run, danger?, checked? } or 'sep'. Separators at the ends or doubled are dropped.

    _menuOpen() {
        return this.els.menu.classList.contains('open');
    }

    openMenu(x, y, head, items, anchor, owner) {
        const menu = this.els.menu, I = this.I;
        const clean = [];
        items.filter(Boolean).forEach(it => {
            if (it === 'sep' && (!clean.length || clean[clean.length - 1] === 'sep')) return;
            clean.push(it);
        });
        while (clean[clean.length - 1] === 'sep') clean.pop();
        this._menuItems = clean;
        this._menuOwner?.removeAttribute('aria-expanded');
        this._menuOwner = owner || null;
        if (owner && owner.hasAttribute('aria-haspopup')) owner.setAttribute('aria-expanded', 'true');   // keeps a hover-only ⋯ shown
        menu.innerHTML = (head ? `<div class="menu-h">${this._escapeHtml(head)}</div>` : '') + clean.map((it, i) => it === 'sep' ? '<hr>'
            : `<button role="${it.checked === undefined ? 'menuitem' : 'menuitemradio'}"${it.checked === undefined ? '' : ` aria-checked="${it.checked}"`} data-mi="${i}" class="${it.danger ? 'danger' : ''}">${I[it.icon] || ''}${this._escapeHtml(it.label)}${it.checked ? `<span class="mi-check">${I.check}</span>` : ''}</button>`).join('');
        menu.classList.add('open');
        const r = menu.getBoundingClientRect();
        let left = Math.min(x, innerWidth - r.width - 8), top = Math.min(y, innerHeight - r.height - 8);
        if (anchor) { // below the button when it fits (toolbar, cards, sidebar rows), otherwise above it (sidebar footer)
            const above = anchor.bottom + 8 + r.height > innerHeight - 8 && anchor.top - r.height - 8 >= 8;
            left = Math.max(8, Math.min(above ? anchor.left : anchor.right - r.width, innerWidth - r.width - 8));
            top = above ? anchor.top - r.height - 8 : Math.min(anchor.bottom + 8, innerHeight - r.height - 8);
            x = anchor.left + anchor.width / 2; y = above ? anchor.top : anchor.bottom;
        }
        left = Math.max(8, left); top = Math.max(8, top);
        Object.assign(menu.style, { left: left + 'px', top: top + 'px' });
        menu.style.setProperty('--ox', (x - left) + 'px');
        menu.style.setProperty('--oy', (y - top) + 'px');
        const first = menu.querySelector('button');
        if (first) first.focus();
    }

    closeMenu() {
        this.els.menu.classList.remove('open');
        this._menuOwner?.removeAttribute('aria-expanded');
    }

    _cardMenu(f) {
        return [f.name, [
            { label: 'Open', icon: 'open', run: () => this.openFlowchartView(f) },
            { label: 'Rename', icon: 'edit', run: async () => {
                const name = await this.showCustomModal({ type: 'text', title: 'Rename Flowchart', initialValue: f.name });
                const t = name && name.replace(/\s+/g, ' ').trim();
                if (t && t !== f.name) { this.library.renameFlowchart(f.id, t); this._refreshLibrary(); }
            } },
            { label: 'Move to Category…', icon: 'folder', run: () => this.openSheet('move', {
                subtitle: `“${f.name}”`, value: f.categoryId || '',
                onClose: r => {
                    if (typeof r !== 'string') return;
                    this.library.assignFlowchartToCategory(f.id, r || null);
                    this._refreshLibrary();
                }
            }) },
            'sep',
            { label: 'Delete Flowchart', icon: 'trash', danger: true, run: async () => {
                const ok = await this.showCustomModal({ type: 'confirm', title: `Delete “${f.name}”?`,
                    message: 'The flowchart and all its steps will be deleted. This can’t be undone.', confirmLabel: 'Delete' });
                if (ok) { this.library.deleteFlowchart(f.id); this._refreshLibrary(); }
            } }
        ]];
    }

    // The one menu definition for a flowchart card or a sidebar category, used by right-click and by ⋯
    _itemMenu(el) {
        if (!el) return null;
        if ('open' in el.dataset) { const fc = this.library.getFlowchart(el.dataset.open); return fc && this._cardMenu(fc); }
        const c = this.library.getCategory(el.dataset.catRow);
        return c && this._catMenu(c);
    }

    _catMenu(c) {
        const n = this.library.getFlowcharts().filter(f => f.categoryId === c.id).length;
        return [c.name, [
            { label: 'Edit Name & Colour', icon: 'edit', run: () => this.openSheet('category', { edit: c }) },
            'sep',
            { label: 'Delete Category', icon: 'trash', danger: true, run: async () => {
                const ok = await this.showCustomModal({ type: 'confirm', title: `Delete “${c.name}”?`,
                    message: n ? `Its ${this._plural(n, 'flowchart')} won’t be deleted; they’ll have no category.` : 'This category is empty.',
                    confirmLabel: 'Delete' });
                if (!ok) return;
                this.library.deleteCategory(c.id);
                if (this.state.filter === c.id) this.state.filter = 'all';
                this._refreshLibrary();
            } }
        ]];
    }

    _closeFlowchartView(focusCard = false) {
        const id = this.state.viewingFlowchartId;
        if (!id) return;
        this.state.viewingFlowchartId = null;
        this._cancelPendingHide();
        this.closeMenu();
        this.els.main.dataset.view = 'grid';
        this.els.flowBody.innerHTML = '';
        this._mapKey = null;
        this._refreshLibrary();
        if (focusCard) this._refocus(null, `#app [data-open="${CSS.escape(id)}"]`);
    }

    attachListeners() {
        this._attachShellListeners();

        this._attachFlowListeners();
    }

    // Right-click position, or for the keyboard menu key (no pointer) a point just inside the element
    _menuPoint(e, el) {
        let { clientX: x, clientY: y } = e;
        if (!x && !y && el) { const r = el.getBoundingClientRect(); x = r.left + 16; y = r.bottom - 8; }
        return [x, y];
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
        const all = [];
        const walk = arr => (arr || []).forEach(n => { all.push(n); if (this._isContainer(n)) walk(n.children); });
        walk(fc.phases);
        const before = new Map(all.map(n => [n.id, this._isComplete(n)]));
        found.node.completed = !found.node.completed;
        this._changed = new Set(all.filter(n => this._isComplete(n) !== before.get(n.id)).map(n => n.id));
        this.library.saveData();
        if (this.state.hideCompleted) {
            // Keep a just-checked item visible for a moment so the tick registers, then hide it.
            // Each check restarts the delay, so quickly ticking several items hides them together.
            if (found.node.completed) this.state.pendingHide.add(nodeId);
            else this.state.pendingHide.delete(nodeId);
            clearTimeout(this._pendingHideTimer);
            if (this.state.pendingHide.size) {
                this._pendingHideTimer = setTimeout(() => this._flushPendingHide(), 900);
            }
        }
        this.renderFlowchartCanvas(fc);
        this._changed = new Set();
    }

    _cancelPendingHide() {
        clearTimeout(this._pendingHideTimer);
        this.state.pendingHide.clear();
    }

    // Hide the items whose delay has ended. Whatever disappears (a step, or a whole
    // subphase/phase it just completed) fades out while the rest glides into place.
    _flushPendingHide() {
        const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
        this.state.pendingHide.clear();
        if (!fc) return;
        this._renderWithTransition(fc);
    }

    // Re-render the canvas through a View Transition: the browser snapshots every named node
    // before and after, then morphs between the two layouts in one motion (no height
    // collapsing, so gaps and connectors never snap). Falls back to a plain re-render.
    _renderWithTransition(fc) {
        if (!document.startViewTransition || this._reduceMotion.matches || !this.state.viewingFlowchartId || document.hidden) {
            this.renderFlowchartCanvas(fc);
            return;
        }
        this._nameTransitionNodes(true);
        const transition = document.startViewTransition(() => {
            this.renderFlowchartCanvas(fc);
            this._nameTransitionNodes(true);
        });
        this._activeTransition = transition;
        // A transition is skipped (its promises reject) when another starts or the tab is
        // hidden; the DOM update still happens, so there is nothing to recover.
        transition.ready.catch(() => {});
        transition.finished.catch(() => {}).finally(() => {
            // Only the latest transition clears names; an older one must not strip a newer one's.
            if (this._activeTransition === transition) this._nameTransitionNodes(false);
        });
    }

    // Give each node a unique view-transition-name only for the duration of a transition
    // (a name makes its element a stacking context, so it isn't left on permanently).
    _nameTransitionNodes(on) {
        const root = this.els.flowBody;
        // Snapshots normally escape their scroll container, so nest them inside groups that clip them
        // (see ::view-transition-group-children in the CSS): the scroller, and inside it the columns or the map.
        root.style.viewTransitionName = on ? 'ft-canvas' : '';
        // The map also holds its connector lines, so naming it gives the lines a layer of their own:
        // old lines clear before new ones draw in, instead of cross-fading.
        const inner = root.querySelector('.columns, .map');
        const innerName = inner?.classList.contains('map') ? 'ft-map-lines' : 'ft-columns';
        if (inner) {
            inner.style.viewTransitionName = on ? innerName : '';
            inner.style.viewTransitionGroup = on ? 'ft-canvas' : '';
        }
        const view = root.getBoundingClientRect();
        // Map nodes are fixed-width pills, so they are named rather than their <li> branches,
        // whose width changes with the subtree and would make the snapshot scale and ghost.
        const named = root.querySelectorAll('.phase[data-node-id], li.group[data-node-id], .step[data-node-id], .node[data-map-node], .node[data-map-root]');
        named.forEach(el => {
            el.style.viewTransitionName = '';
            el.style.viewTransitionGroup = '';
            if (!on) return;
            // Nodes scrolled fully out of view stay in their container's snapshot instead.
            const r = el.getBoundingClientRect();
            if (r.bottom <= view.top || r.top >= view.bottom || r.right <= view.left || r.left >= view.right) return;
            // User ids get their own "ft-n-" prefix, so no id can take the root's or the view's names
            const id = el.dataset.mapNode || el.dataset.nodeId;
            if (!id && !('mapRoot' in el.dataset)) return;
            el.style.viewTransitionName = id ? `ft-n-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}` : 'ft-root';
            el.style.viewTransitionGroup = inner ? innerName : 'ft-canvas';
        });
    }

    // Nodes to draw: everything, or (when completed items are hidden) only unfinished ones,
    // plus anything still in its brief "just checked" window.
    _visibleNodes(nodes) {
        if (!this.state.hideCompleted) return nodes || [];
        return (nodes || []).filter(n => !this._isComplete(n) || this._hasPendingHide(n));
    }

    _hasPendingHide(node) {
        if (this.state.pendingHide.has(node.id)) return true;
        return this._isContainer(node) && node.children.some(c => this._hasPendingHide(c));
    }

    // Push a new leaf into a container (or an empty phase). Turns a leaf into a
    // container if needed — this is how optional nesting is created.
    _addChildLeaf(nodeId, promptTitle = 'New Step') {
        return this._addChild(nodeId, false, { title: promptTitle, label: 'Step', placeholder: 'e.g. Write launch copy' });
    }

    // Add a container (subphase/group) child.
    _addChildContainer(nodeId, typeName) {
        return this._addChild(nodeId, true, { title: `New ${typeName}`, label: `${typeName} name`, placeholder: 'e.g. Review' });
    }

    async _addChild(nodeId, container, prompt) {
        const fc = this.library.getFlowchart(this.state.viewingFlowchartId);
        const found = this._findNode(fc.phases, nodeId);
        if (!found) return;
        const node = found.node;
        const name = await this.showCustomModal({ ...prompt, title: `${prompt.title} in “${node.title}”`, button: 'Add', type: 'text' });
        if (!name || !name.trim()) return;
        if (!Array.isArray(node.children)) { node.children = []; delete node.completed; }
        node.children.push(this._newNode(name.trim(), container));
        this.state.collapsedNodes.delete(nodeId); // reveal the newly added child
        this.library.saveData();
        this.renderFlowchartCanvas(fc);
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

        const rerender = () => {
            this.library.saveData();
            this.renderFlowchartCanvas(fc);
        };

        const insertSibling = async (insertAt) => {
            const name = await this.showCustomModal({ title: `New ${typeName}`, label: isContainer ? `${typeName} name` : 'Step', button: 'Add', type: "text" });
            if (!name || !name.trim()) return;
            parentArray.splice(insertAt, 0, this._newNode(name.trim(), isContainer));
            rerender();
        };

        const items = [
            { label: `Rename ${typeName}`, icon: 'edit', run: async () => {
                const newName = await this.showCustomModal({
                    title: `Rename ${typeName}`,
                    initialValue: node.title, type: "text"
                });
                if (newName && newName.trim() && newName.trim() !== node.title) {
                    node.title = newName.trim();
                    rerender();
                }
            }},
            'sep',
        ];

        const upLabel = isTopLevel ? `Move ${typeName} Left` : `Move ${typeName} Up`;
        const downLabel = isTopLevel ? `Move ${typeName} Right` : `Move ${typeName} Down`;
        if (index > 0) items.push({ label: upLabel, icon: isTopLevel ? 'left' : 'up', run: () => this._moveNode(fc, nodeId, -1) });
        if (index < parentArray.length - 1) items.push({ label: downLabel, icon: isTopLevel ? 'right' : 'down', run: () => this._moveNode(fc, nodeId, 1) });

        items.push('sep');

        if (isContainer) {
            // Containers can hold both leaves and sub-containers.
            const childContainerName = this._nodeTypeName(depth + 1, true);
            items.push(
                { label: "Add Step", icon: 'plusCircle', run: () => this._addChildLeaf(nodeId) },
                { label: `Add ${childContainerName}`, icon: 'addSub', run: () => this._addChildContainer(nodeId, childContainerName) }
            );
        } else {
            // A leaf becomes a container the moment it gets a child.
            items.push({ label: "Add Substep", icon: 'addSub', run: () => this._addChildLeaf(nodeId, "New Substep") });
        }

        // Sibling insertion (skip for top-level phases — use the New Phase button).
        if (!isTopLevel) {
            items.push(
                'sep',
                { label: `Add ${typeName} Before`, icon: 'up', run: () => insertSibling(index) },
                { label: `Add ${typeName} After`, icon: 'down', run: () => insertSibling(index + 1) }
            );
        }

        items.push(
            'sep',
            { label: `Delete ${typeName}`, icon: 'trash', danger: true, run: async () => {
                const { total } = this._progress(node.children || []);
                const kind = typeName.toLowerCase();
                const confirmed = await this.showCustomModal({
                    title: `Delete “${node.title}”?`,
                    message: `${isContainer && total > 0 ? `This ${kind} and its ${this._plural(total, 'step')} will be removed.` : `This ${kind} will be removed.`} This can’t be undone.`,
                    type: "confirm", confirmLabel: 'Delete'
                });
                if (!confirmed) return;
                parentArray.splice(index, 1);
                rerender();
            }}
        );

        const owner = e.target.closest('[data-node-id]');
        const [x, y] = this._menuPoint(e, owner);
        this.openMenu(x, y, `${typeName}: ${node.title}`, items, null, owner);
    }

    // ===== Landing page: sidebar, cards and their events =====

    _attachShellListeners() {
        const scrim = this.els.scrim, menu = this.els.menu;

        // Clicks in the shell (sidebar, toolbar, cards)
        document.addEventListener('click', (e) => {
            if (scrim.contains(e.target) || menu.contains(e.target)) return;

            const menuBtn = e.target.closest('[data-menu-btn]');
            if (menuBtn) {
                if (this._menuOpen() && this._menuOwner === menuBtn) { this.closeMenu(); return; }
                // ⋯ on a card or category row: the same menu as right-clicking it, placed at the button.
                // Handled (and returned) before the card/row click, so the card or list doesn't open too.
                if ('itemMenu' in menuBtn.dataset) {
                    e.stopPropagation();
                    const spec = this._itemMenu(menuBtn.closest('[data-open], [data-cat-row]'));
                    if (spec) this.openMenu(0, 0, spec[0], spec[1], menuBtn.getBoundingClientRect(), menuBtn);
                    return;
                }
                const fc = this._currentFc();
                if ('more' in menuBtn.dataset) { if (fc) this.openMenu(0, 0, fc.name, this._moreMenuItems(), menuBtn.getBoundingClientRect(), menuBtn); }
                else this.openMenu(0, 0, 'Appearance', this._appearanceMenuItems(), menuBtn.getBoundingClientRect(), menuBtn);
                return;
            }
            const sheetBtn = e.target.closest('[data-sheet]');
            if (sheetBtn) { this.openSheet(sheetBtn.dataset.sheet); return; }

            if (e.target.closest('[data-export]')) { this._export(); return; }

            const filter = e.target.closest('[data-filter]');
            if (filter) {
                this.state.filter = filter.dataset.filter;
                document.body.classList.remove('side-open');
                // Picking a list in the sidebar always shows that list, even from inside an open flowchart
                if (this.state.viewingFlowchartId) this._closeFlowchartView();
                else this._refreshLibrary();
                return;
            }
            const open = e.target.closest('#app [data-open]');
            if (open) {
                const fc = this.library.getFlowchart(open.dataset.open);
                if (fc) this.openFlowchartView(fc);
                return;
            }
            if (e.target.closest('[data-toggle-side]')) {
                document.body.classList.toggle(this._phoneMQ.matches ? 'side-open' : 'side-hidden');
                return;
            }
            if (e.target.closest('[data-side-scrim]')) document.body.classList.remove('side-open');
        });

        // Searching always shows the results, even from inside an open flowchart
        document.addEventListener('input', (e) => {
            if (!e.target.matches('[data-search]')) return;
            this.state.query = e.target.value;
            this._closeFlowchartView();
            this.renderMainContent();
        });

        // ---- Sheets ----
        scrim.addEventListener('click', (e) => {
            if (e.target === scrim || e.target.closest('[data-close]')) { this.closeSheet(); return; }
            const sw = e.target.closest('[data-swatch]');
            if (sw) {
                this._catPick = sw.dataset.swatch;
                this._paintSwatches();   // re-renders the swatches, so focus the new twin of the clicked one
                this._sheet('category').querySelector(`[data-swatch="${this._catPick}"]`)?.focus();
            }
            const pick = e.target.closest('[data-pick-cat]');
            if (pick) {
                this._fcCat = pick.dataset.pickCat;
                pick.parentElement.querySelectorAll('[data-pick-cat]').forEach(b => b.setAttribute('aria-checked', String(b === pick)));
            }
            const imp = e.target.closest('[data-imp]');
            if (imp) this._setImportMode(imp.dataset.imp);
            const drop = e.target.closest('[data-drop]');
            if (drop) (drop.dataset.drop === 'ai' ? this._sheet('ai').querySelector('[data-ai-files]') : this.els.importInput).click();
            if (e.target.closest('[data-dd]')) { this._ddOpen() ? this._closeDD() : this._openDD(); return; }
            if (e.target.closest('[data-key-change]')) this._showKeyEdit(true);
            if (e.target.closest('[data-key-save]')) this._saveKey();
            if (e.target.closest('[data-key-remove]')) { this._clearGeminiKey(); this._refreshKeyUI(); this._sheet('ai').querySelector('[data-key-input]').focus(); }
            const rm = e.target.closest('[data-rm-file]');
            if (rm) {
                const i = +rm.dataset.rmFile;
                this._aiFiles.splice(i, 1);
                this._renderAiFileList();
                const left = this._sheet('ai').querySelectorAll('[data-rm-file]');
                (left[Math.min(i, left.length - 1)] || this._sheet('ai').querySelector('[data-drop="ai"]')).focus();
            }
            if (e.target.closest('[data-rm-import]')) {
                this._showImportResult(null);
                this._renderImportFile(null);
                this._sheet('import').querySelector('[data-drop="import"]').focus();
            }
        });

        scrim.addEventListener('input', (e) => {
            const form = e.target.form;
            if (form && form.dataset.sheetId === 'category' && e.target.name === 'name') {
                form.querySelector('[data-cat-name]').textContent = e.target.value.trim() || 'New Category';
            }
            if (form && e.target.name === 'name') this._syncSubmit(form);
            if (e.target.matches('[data-json]')) this._checkJSON();
            if (e.target.matches('[data-ai-text]')) this._showAiError('');
            if (e.target.matches('[data-imp-text]')) {
                const t = e.target.value.trim();
                this._showImportResult(t ? this._parseImport(t, 'Pasted Flowchart') : null);
            }
        });

        const impInput = this.els.importInput;
        impInput.addEventListener('change', () => { this._readImportFile(impInput.files); impInput.value = ''; });
        const aiFiles = scrim.querySelector('[data-ai-files]');
        aiFiles.addEventListener('change', () => { this._addAiFiles(aiFiles.files); aiFiles.value = ''; });
        // Upload boxes: a click (or Enter/Space, it's a button) browses; dropped files go to the same handlers.
        // Entering and leaving child elements fires drag events too, so a depth count keeps the state steady.
        scrim.querySelectorAll('[data-drop]').forEach(drop => {
            const head = drop.querySelector('.drop-t'), title = head.textContent;
            let depth = 0;
            const setOver = on => { drop.classList.toggle('over', on); head.textContent = on ? head.dataset.over : title; };
            drop.addEventListener('dragenter', (e) => { e.preventDefault(); if (!depth++) setOver(true); });
            drop.addEventListener('dragleave', () => { if (depth && !--depth) setOver(false); });
            drop.addEventListener('dragover', (e) => e.preventDefault());
            drop.addEventListener('drop', (e) => {
                e.preventDefault();
                depth = 0;
                setOver(false);
                if (drop.dataset.drop === 'ai') this._addAiFiles(e.dataTransfer.files);
                else this._readImportFile(e.dataTransfer.files);
            });
        });
        // Enter in the key field saves the key instead of submitting the whole sheet
        scrim.querySelector('[data-key-input]').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this._saveKey(); }
        });
        this.els.ddPop.addEventListener('click', (e) => {
            const o = e.target.closest('[data-opt]');
            if (o) this._pickModel(o.dataset.opt);
        });
        this.els.ddPop.addEventListener('pointermove', (e) => {
            const o = e.target.closest('[data-opt]');
            if (!o || o.dataset.opt === this._ddHl) return;
            this._ddHl = o.dataset.opt;   // move the highlight without rebuilding the list under the pointer
            this.els.ddPop.querySelectorAll('.dd-opt').forEach(b => b.classList.toggle('hl', b === o));
            this._sheet('ai').querySelector('[data-dd]').setAttribute('aria-activedescendant', o.id);
        });
        document.addEventListener('pointerdown', (e) => {
            if (this._ddOpen() && !this.els.ddPop.contains(e.target) && !e.target.closest('[data-dd]')) this._closeDD();
        }, true);
        document.addEventListener('scroll', (e) => { if (this._ddOpen() && !this.els.ddPop.contains(e.target)) this._closeDD(); }, true);
        window.addEventListener('resize', () => this._closeDD());

        scrim.addEventListener('submit', (e) => {
            e.preventDefault();
            const sh = e.target, id = sh.dataset.sheetId;
            const name = sh.elements.name ? sh.elements.name.value.replace(/\s+/g, ' ').trim() : '';
            if (sh.elements.name && !name) { this._syncSubmit(sh); return; }
            if (id === 'category' && this._catEdit) {
                this.library.updateCategory(this._catEdit, { name, color: this._catPick });
                this._refreshLibrary();
                this.closeSheet();
            } else if (id === 'category') {
                const cat = this.library.createCategory(name, this._catPick);
                this.state.filter = cat.id;
                this._refreshLibrary();
                this.closeSheet();
            } else if (id === 'flowchart') {
                const fc = this.library.createFlowchart(name, this._fcCat || null);
                this._refreshLibrary();
                this.closeSheet();
                this.openFlowchartView(fc);
            } else if (id === 'import') {
                this._runImport();
            } else if (id === 'ai') {
                this._runAi();
            } else if (id === 'json') {
                this._saveJSON();
            } else if (id === 'confirm') {
                this.closeSheet(true);
            } else if (id === 'name') {
                this.closeSheet(name);
            } else if (id === 'move') {
                this.closeSheet(this._fcCat || '');
            }
        });

        // ---- Menus ----
        menu.addEventListener('click', (e) => {
            const b = e.target.closest('[data-mi]');
            if (!b) return;
            const it = this._menuItems[+b.dataset.mi], owner = this._menuOwner, sel = this._focusSel(owner);
            this.closeMenu();
            this._refocus(owner, sel);      // a sheet opened by the item then returns focus to the owner
            if (it && it.run) it.run();
            this._refocusSoon(owner, sel);
        });

        // Right-click: flowchart cards and categories (flowchart-view nodes have their own handler)
        this.els.app.addEventListener('contextmenu', (e) => {
            if (this._sheetOpen() || e.target.closest('#app .flow')) return;
            const el = e.target.closest('[data-open], [data-cat-row]'), spec = el && this._itemMenu(el);
            if (!spec) { this.closeMenu(); return; }
            e.preventDefault();
            const owner = el.querySelector(':scope > .side-item') || el, [x, y] = this._menuPoint(e, owner);
            this.openMenu(x, y, spec[0], spec[1], null, owner);
        });

        document.addEventListener('pointerdown', (e) => {
            if (this._menuOpen() && !menu.contains(e.target) && !e.target.closest('[data-menu-btn]')) this.closeMenu();
        }, true);
        window.addEventListener('blur', () => this.closeMenu());
        document.addEventListener('scroll', (e) => { if (!menu.contains(e.target)) this.closeMenu(); }, true);
        window.addEventListener('resize', () => {
            this.closeMenu();
            if (!this._phoneMQ.matches) document.body.classList.remove('side-open');
        });

        // ---- Keyboard: menus first, then sheets, then the phone sidebar ----
        document.addEventListener('keydown', (e) => {
            if (this._ddKey(e)) return;
            if (this._menuOpen()) {
                const bs = [...menu.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
                if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.closeMenu(); this._refocus(this._menuOwner); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
                else if (e.key === 'Tab') this.closeMenu();
                return;
            }
            if (this._sheetOpen()) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.closeSheet(); return; }
                if (e.key === 'Tab') { // keep focus inside the open sheet
                    const f = [...scrim.querySelector('.sheet.active').querySelectorAll('button:not([disabled]), input:not([hidden]), textarea, a')].filter(x => x.offsetParent);
                    if (!f.length) return;
                    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
                    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
                }
                return;
            }
            if (e.key === 'Escape' && document.body.classList.contains('side-open')) {
                document.body.classList.remove('side-open');
                document.querySelector('[data-toggle-side]').focus();
            }
        }, true);

        this.attachDragAndDrop();
    }

    // Drag a flowchart card onto a category in the sidebar to move it there.
    attachDragAndDrop() {
        let draggedId = null;
        const grid = this.els.mainContent, side = this.els.sidebar;
        const clear = () => side.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

        grid.addEventListener('dragstart', (e) => {
            const card = e.target.closest('[data-open]');
            if (!card) return;
            draggedId = card.dataset.open;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedId);
            card.classList.add('dragging');
        });
        grid.addEventListener('dragend', (e) => {
            e.target.closest('[data-open]')?.classList.remove('dragging');
            draggedId = null;
            clear();
        });
        side.addEventListener('dragover', (e) => {
            const target = draggedId && e.target.closest('[data-cat-drop]');
            if (!target) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!target.classList.contains('drop-target')) { clear(); target.classList.add('drop-target'); }
        });
        side.addEventListener('dragleave', (e) => {
            const target = e.target.closest('[data-cat-drop]');
            if (target && !target.contains(e.relatedTarget)) target.classList.remove('drop-target');
        });
        side.addEventListener('drop', (e) => {
            const target = draggedId && e.target.closest('[data-cat-drop]');
            if (!target) return;
            e.preventDefault();
            this.library.assignFlowchartToCategory(draggedId, target.dataset.catRow);
            const fc = this.library.getFlowchart(draggedId), cat = this.library.getCategory(target.dataset.catRow);
            draggedId = null;
            clear();
            this._refreshLibrary();
            if (fc && cat) this.toast(`Moved “${this._escapeHtml(fc.name)}” to ${this._escapeHtml(cat.name)}`);
        });
    }

    // ---- Flowchart summaries ----

    _stats(f) {
        let total = 0, done = 0, next = null;
        const walk = (arr) => (arr || []).forEach(n => {
            if (this._isContainer(n)) { walk(n.children); return; }
            total++;
            if (n.completed) done++;
            else if (next === null) next = String(n.title ?? '').trim();
        });
        walk(f.phases);
        return { total, done, next, isDone: total > 0 && done === total };
    }

    _filterTest(id) {
        if (id === 'all') return () => true;
        if (id === 'progress') return f => !this._stats(f).isDone;
        if (id === 'done') return f => this._stats(f).isDone;
        return f => f.categoryId === id;
    }

    _visibleFlowcharts() {
        const q = this.state.query.trim().toLowerCase();
        return this.library.getFlowcharts()
            .filter(this._filterTest(this.state.filter))
            .filter(f => !q || String(f.name ?? '').toLowerCase().includes(q));
    }

    // ---- Sidebar ----

    renderSidebar() {
        const I = this.I, esc = s => this._escapeHtml(s);
        const all = this.library.getFlowcharts(), cats = this.library.getCategories();
        if (!FT_FILTERS[this.state.filter] && !cats.some(c => c.id === this.state.filter)) this.state.filter = 'all';

        // A category row wraps its button with a ⋯ button beside it (a button can't hold another button)
        const item = (id, label, lead, count, isCat) => {
            const btn = `<button class="side-item ${this.state.filter === id ? 'active' : ''}" data-filter="${esc(id)}"${this.state.filter === id ? ' aria-current="true"' : ''}>${lead}<span class="side-label">${esc(label)}</span><span class="count">${count}</span></button>`;
            return isCat ? `<div class="side-row" data-cat-drop data-cat-row="${esc(id)}">${btn}<button type="button" class="side-more" data-menu-btn data-item-menu aria-haspopup="menu" aria-label="Options for ${esc(label)}" title="Options">${I.more}</button></div>` : btn;
        };

        // Keep the search field (and its caret) when the sidebar re-renders while someone is typing in it
        const active = document.activeElement;
        const searchFocused = active && this.els.sidebar.contains(active) && active.matches('[data-search]');
        const caret = searchFocused ? [active.selectionStart, active.selectionEnd] : null;
        const navScroll = this.els.sidebar.querySelector('nav')?.scrollTop || 0;

        this.els.sidebar.innerHTML = `
            <div class="brand"><span class="mark"><img class="logo-light" src="img/logo/flowtracker-3d-light.svg" alt=""><img class="logo-dark" src="img/logo/flowtracker-3d-dark.svg" alt=""></span>FlowTracker</div>
            <label class="search">${I.search}<input type="text" placeholder="Search" aria-label="Search flowcharts" data-search value="${esc(this.state.query)}"></label>
            <nav aria-label="Filters">
                <p class="side-h">Library</p>
                ${Object.entries(FT_FILTERS).map(([id, f]) => item(id, f.name, I[f.icon], all.filter(this._filterTest(id)).length)).join('')}
                ${cats.length ? '<p class="side-h">Categories</p>' : ''}
                ${cats.map(c => item(c.id, c.name, `<span class="dot" style="--c:${this._catColor(c)}"></span>`, all.filter(f => f.categoryId === c.id).length, true)).join('')}
            </nav>
            <div class="side-foot">
                <button class="text-btn" data-sheet="category">${I.plusCircle}New Category</button>
                <button class="glass-btn lg" data-appearance data-menu-btn title="Appearance" aria-label="Appearance: ${FT_THEME_NAMES[this.theme]}" aria-haspopup="menu">${I[FT_THEME_ICONS[this.theme]]}</button>
            </div>`;

        const nav = this.els.sidebar.querySelector('nav');
        if (nav) nav.scrollTop = navScroll;
        if (caret) {
            const input = this.els.sidebar.querySelector('[data-search]');
            input.focus({ preventScroll: true });
            input.setSelectionRange(caret[0], caret[1]);
        }
    }

    // ---- Main grid ----

    renderMainContent() {
        const esc = s => this._escapeHtml(s);
        const list = this._visibleFlowcharts();
        const doneCount = list.filter(f => this._stats(f).isDone).length;
        const cat = FT_FILTERS[this.state.filter] ? null : this.library.getCategory(this.state.filter);
        this.els.pageTitle.textContent = cat ? cat.name : FT_FILTERS[this.state.filter].name;
        this.els.pageSub.textContent = `${this._plural(list.length, 'flowchart')}, ${doneCount} completed`;

        const q = this.state.query.trim();
        let empty = 'No flowcharts here yet.';
        if (q) empty = `No flowcharts match “${esc(q)}”.`;
        else if (!this.library.getFlowcharts().length) empty = 'No flowcharts yet. Create one with New Flowchart.';
        this.els.mainContent.innerHTML = list.length ? list.map(f => this._cardHTML(f)).join('') : `<p class="empty">${empty}</p>`;
    }

    _cardHTML(f) {
        const I = this.I, esc = s => this._escapeHtml(s);
        const s = this._stats(f), cat = f.categoryId ? this.library.getCategory(f.categoryId) : null;
        const next = s.isDone ? 'All steps complete' : s.next ? `Next: <b>${esc(s.next)}</b>` : 'No steps yet';
        return `<article class="card" data-open="${esc(f.id)}" draggable="true" style="--c:${this._catColor(cat)}">
            <div class="card-top"><span class="tile" aria-hidden="true">${I.cardIcon}</span>${this._leftHTML(f, 'card', s)}</div>
            <button type="button" class="card-more" data-menu-btn data-item-menu aria-haspopup="menu" aria-label="Options for ${esc(f.name)}" title="Options">${I.more}</button>
            <h2><button type="button" class="card-link">${esc(f.name)}</button></h2>
            <p class="meta">${esc(cat ? cat.name : 'No Category')}</p>
            <p class="next">${next}</p>
        </article>`;
    }

    // Option C (Reminders list style): the number of steps left, large; a finished flowchart shows the
    // Notes-style check instead, which pops in when it has just been finished.
    _leftHTML(f, where, s = this._stats(f)) {
        const key = `${where}:${f.id}`, was = this._doneShown.get(key);
        this._doneShown.set(key, s.isDone);
        if (!s.total) return '';
        if (s.isDone) return `<span class="done-mark${was === false ? ' just' : ''}" role="img" aria-label="Complete">${this.I.done}</span>`;
        const left = s.total - s.done;
        return `<span class="left-count" role="img" aria-label="${left} of ${this._plural(s.total, 'step')} left"><strong>${left}</strong>${where === 'head' ? `<small>of ${s.total} left</small>` : ''}</span>`;
    }

    // ===== Flowchart view =====
    // Lives inside the main area (the sidebar stays). List: phases as glass columns with Reminders-style
    // rows. Map: pill nodes with SVG connectors that turn green where they lead to finished work.

    _currentFc() {
        return this.state.viewingFlowchartId ? this.library.getFlowchart(this.state.viewingFlowchartId) : null;
    }

    // The pager walks the flowcharts on the grid behind (current filter and search), wrapping round.
    _pagerList() {
        const list = this._visibleFlowcharts();
        return list.some(f => f.id === this.state.viewingFlowchartId) ? list : this.library.getFlowcharts();
    }

    stepFlowchart(dir) {
        if (!this.state.viewingFlowchartId) return;
        const list = this._pagerList();
        if (list.length < 2) return;
        const i = list.findIndex(f => f.id === this.state.viewingFlowchartId);
        this.openFlowchartView(list[(i + dir + list.length) % list.length], { fromPager: true });
    }

    openFlowchartView(fc, { fromPager = false } = {}) {
        if (!fc) return;
        const wasOpen = !!this.state.viewingFlowchartId;
        this.state.viewingFlowchartId = fc.id;
        this._collapsedByMode.list.clear();
        this._collapsedByMode.map.clear();
        this._cancelPendingHide();
        this._changed = new Set();
        this._mapKey = null;
        this.closeMenu();
        document.body.classList.remove('side-open');
        this.els.main.dataset.view = 'flow';
        this.els.flowBody.scrollTop = 0;
        this.els.flowBody.scrollLeft = 0;
        this.renderFlowchartCanvas(fc);
        // Keyboard users land on Back, not on the card that just disappeared
        if (!wasOpen && !fromPager) this.els.flow.querySelector('[data-back]').focus({ preventScroll: true });
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

    renderFlowchartCanvas(fc) {
        if (!fc) return;
        const I = this.I, mode = this.state.viewMode;
        const s = this._stats(fc), seq = this._buildNodeSequenceNumbers(fc.phases);
        const cat = fc.categoryId ? this.library.getCategory(fc.categoryId) : null;

        // Header (Option C): title in the category colour (renamed in place), category below, steps left on the right
        if (document.activeElement !== this.els.flowTitle) this.els.flowTitle.textContent = fc.name;
        this.els.flowTitle.parentElement.parentElement.style.setProperty('--c', cat ? this._catColor(cat) : 'var(--ink)');
        this.els.flowSub.textContent = cat ? cat.name : 'No Category';
        this.els.flowRing.innerHTML = this._leftHTML(fc, 'head', s);

        // Pager
        const list = this._pagerList(), idx = list.findIndex(f => f.id === fc.id);
        this.els.pagerCount.textContent = `${idx + 1} of ${list.length}`;
        this.els.flow.querySelectorAll('[data-step]').forEach(b => { b.disabled = list.length < 2; });

        // View mode switch
        this.els.flow.querySelectorAll('[data-mode]').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === mode);
            b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
        });
        this._slideThumb();

        // Collapse all: Map only (greyed out in List so the toolbar never shifts); label follows the state
        const ca = this.els.flow.querySelector('[data-collapse-all]');
        const expandable = this._getExpandableNodeIds(fc.phases);
        const anyClosed = expandable.some(id => this.state.collapsedNodes.has(id));
        const caLabel = mode === 'list' ? 'Collapse all branches (Map view only)' : anyClosed ? 'Expand all branches' : 'Collapse all branches';
        ca.disabled = mode === 'list' || !expandable.length;
        ca.innerHTML = I[mode === 'map' && anyClosed ? 'expandAll' : 'collapseAll'];
        ca.title = caLabel;
        ca.setAttribute('aria-label', caLabel);

        // Show / hide completed
        const eye = this.els.flow.querySelector('[data-eye]');
        const hidden = this.state.hideCompleted;
        eye.innerHTML = hidden ? I.eyeOff : I.eye;
        eye.setAttribute('aria-pressed', String(!hidden));
        eye.title = hidden ? 'Show completed' : 'Hide completed';
        eye.setAttribute('aria-label', eye.title);

        // Body, keeping the scroll position so ticking a step never jumps back to Phase 1
        const body = this.els.flowBody, top = body.scrollTop, left = body.scrollLeft;
        body.innerHTML = mode === 'list' ? this._listView(fc, seq) : this._mapView(fc, seq, s);
        body.scrollTop = top;
        body.scrollLeft = left;
        this._fitMap(fc);
        this.renderSidebar();   // status counts (In Progress / Completed) follow the ticks
    }

    _slideThumb() {
        const thumb = this.els.flow.querySelector('.seg-thumb');
        const b = this.els.flow.querySelector(`[data-mode="${this.state.viewMode}"]`);
        if (!thumb || !b || !b.offsetWidth) return;
        thumb.style.setProperty('--tx', b.offsetLeft + 'px');
        thumb.style.setProperty('--tw', b.offsetWidth + 'px');
        if (thumb.classList.contains('instant')) requestAnimationFrame(() => requestAnimationFrame(() => thumb.classList.remove('instant')));
    }

    _nodeLabel(node, depth, seq) {
        const s = seq.get(node.id);
        const label = s ? s.label : this._nodeTypeName(depth, this._isContainer(node));
        return { label, title: this._displayNodeTitle(node.title, label) };
    }

    _countText(node) {
        const { total, completed } = this._progress(node.children);
        if (!total) return '';
        if (completed === total) return `<span role="img" aria-label="Complete">${this.I.done}</span>`;
        return `<span aria-label="${total - completed} of ${total} left">${total - completed}</span>`;
    }

    _emptyFlowHTML() {
        const I = this.I;
        return `<div class="all-done empty-flow">${I.flow}<h2>No phases yet</h2><p>Add a phase, or let AI draft the flowchart from your notes.</p>
            <div class="empty-actions"><button class="btn-secondary lg" data-flow-action="phase">${I.plus}Add Phase</button><button class="btn-primary lg" data-flow-action="ai">${I.sparkle}Generate with AI</button></div></div>`;
    }

    _allDoneHTML() {
        return `<div class="all-done"><span class="done-mark" aria-hidden="true">${this.I.done}</span><h2>All steps complete</h2><p>Completed steps are hidden.</p><button class="text-btn" data-eye>Show completed</button></div>`;
    }

    // ---- List ----

    _listItems(nodes, depth, seq) {
        const I = this.I, esc = s => this._escapeHtml(s);
        return this._visibleNodes(nodes).map(n => {
            const { label, title } = this._nodeLabel(n, depth, seq);
            if (this._isContainer(n)) {
                const collapsed = this.state.collapsedNodes.has(n.id);
                const done = this._isComplete(n);
                return `<li class="group ${collapsed ? 'collapsed' : ''} ${done ? 'done' : ''}" data-node-id="${esc(n.id)}">
                    <button class="group-head" data-collapse="${esc(n.id)}" aria-expanded="${!collapsed}">${I.chev}<span><span class="role">${esc(label)}</span><span class="group-title">${esc(title)}</span></span><span class="phase-count">${this._countText(n)}</span></button>
                    <ul class="steps nested">${this._listItems(n.children, depth + 1, seq)}${n.children.length ? '' : `<li><button class="add-row" data-add-step="${esc(n.id)}">${I.plusCircle}Add Step</button></li>`}</ul></li>`;
            }
            const anim = this._changed.has(n.id) ? (n.completed ? 'fill' : 'unfill') : '';
            return `<li><button class="step ${n.completed ? 'done' : ''} ${anim}" data-leaf="${esc(n.id)}" data-node-id="${esc(n.id)}" role="checkbox" aria-checked="${!!n.completed}"><span class="check">${I.circleTick}</span>
                <span><span class="step-title">${esc(title)}</span><span class="role">${esc(label)}</span></span></button></li>`;
        }).join('');
    }

    _listView(fc, seq) {
        const I = this.I, esc = s => this._escapeHtml(s);
        if (!fc.phases.length) return this._emptyFlowHTML();
        const cols = this._visibleNodes(fc.phases).map(p => {
            const { label, title } = this._nodeLabel(p, 0, seq);
            return `<section class="phase panel ${this._isComplete(p) ? 'done' : ''}" data-node-id="${esc(p.id)}" aria-label="${esc(label)}: ${esc(title)}">
                <header class="phase-head"><div><span class="role">${esc(label)}</span><h2>${esc(title)}</h2></div><span class="phase-count">${this._countText(p)}</span></header>
                <ul class="steps">${this._listItems(p.children, 1, seq)}</ul>
                <div class="add-rows"><button class="add-row" data-add-step="${esc(p.id)}">${I.plusCircle}Add Step</button><button class="add-row" data-add-sub="${esc(p.id)}">${I.addSub}Add Subphase</button></div></section>`;
        }).join('');
        return cols ? `<div class="columns">${cols}</div>` : this._allDoneHTML();
    }

    // ---- Map ----

    _mapView(fc, seq, s) {
        const I = this.I, esc = s => this._escapeHtml(s);
        const node = (n, depth) => {
            const { label, title } = this._nodeLabel(n, depth, seq);
            const done = this._isComplete(n);
            if (!this._isContainer(n)) {
                const anim = this._changed.has(n.id) ? (done ? 'fill' : 'unfill') : '';
                return `<li class="${done ? 'done' : ''}"><button class="node leaf ${done ? 'done' : ''} ${anim}" data-leaf="${esc(n.id)}" data-node-id="${esc(n.id)}" data-map-node="${esc(n.id)}" role="checkbox" aria-checked="${done}">
                    <span class="check">${I.circleTick}</span><span class="node-text"><span class="role">${esc(label)}</span>${esc(title)}</span></button></li>`;
            }
            const kids = this._visibleNodes(n.children), closed = this.state.collapsedNodes.has(n.id);
            const leaves = kids.filter(k => !this._isContainer(k)), groups = kids.filter(k => this._isContainer(k));
            // Steps always stack in one column; sub-groups branch out beside that column.
            const inner = !groups.length ? `<ul class="stack">${leaves.map(k => node(k, depth + 1)).join('')}</ul>`
                : `<ul>${leaves.length ? `<li class="leafcol ${leaves.every(k => this._isComplete(k)) ? 'done' : ''}"><ul class="stack">${leaves.map(k => node(k, depth + 1)).join('')}</ul></li>` : ''}${groups.map(k => node(k, depth + 1)).join('')}</ul>`;
            return `<li class="${done ? 'done' : ''}"><button class="node branch ${done ? 'done' : ''}" data-collapse="${esc(n.id)}" data-node-id="${esc(n.id)}" data-map-node="${esc(n.id)}"${kids.length ? ` aria-expanded="${!closed}"` : ''}>
                <span class="node-text"><span class="role">${esc(label)}</span>${esc(title)}</span><span class="count">${this._countText(n)}</span>
                ${kids.length ? `<span class="chev ${closed ? '' : 'open'}">${I.chev}</span>` : ''}</button>
                ${kids.length && !closed ? inner : ''}</li>`;
        };
        if (!fc.phases.length) return this._emptyFlowHTML();
        const phases = this._visibleNodes(fc.phases);
        if (!phases.length) return this._allDoneHTML();
        return `<div class="map"><ul class="tree"><li><div class="node root" data-map-root><span class="node-text">${esc(fc.name)}</span><span class="count">${this._countText({ children: fc.phases })}</span></div>
            <ul>${phases.map(p => node(p, 0)).join('')}</ul></li></ul></div>`;
    }

    // Shrink a wide map to fit the screen (down to 80%), then let it scroll sideways beyond that.
    // When a map first appears (new flowchart or switching to Map), centre it on the root.
    _fitMap(fc = this._currentFc()) {
        const body = this.els.flowBody, tree = body.querySelector('.tree');
        if (!fc || !tree || this.state.viewMode !== 'map') return;
        tree.style.zoom = 1;
        const pad = parseFloat(getComputedStyle(body).paddingLeft) * 2;
        const avail = body.clientWidth - pad, need = tree.offsetWidth;
        tree.style.zoom = need > avail ? Math.max(0.8, avail / need) : 1;
        this._drawLinks(fc);
        const key = fc.id + ':map';
        if (key !== this._mapKey) {
            this._mapKey = key;
            const root = tree.querySelector('.node.root').getBoundingClientRect(), br = body.getBoundingClientRect();
            body.scrollLeft += root.left + root.width / 2 - (br.left + body.clientWidth / 2);
        }
    }

    // Map connectors. A line is green only where it leads to completed work. Green lines are drawn
    // first and grey on top, so a shared stretch that also leads somewhere unfinished stays grey.
    _drawLinks(fc) {
        const map = this.els.flowBody.querySelector('.map');
        if (!map) return;
        map.querySelector('svg.links')?.remove();
        const mr = map.getBoundingClientRect();
        // The root is keyed by a Symbol, so a step whose id is "root" can never stand in for it
        const ROOT = Symbol('root');
        const nodes = new Map([...map.querySelectorAll('[data-map-node]')].map(n => [n.dataset.mapNode, n]));
        nodes.set(ROOT, map.querySelector('[data-map-root]'));
        const el = id => nodes.get(id);
        const at = (e, top) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2 - mr.left, y: (top ? r.top : r.bottom) - mr.top }; };
        const elbow = (x1, y1, x2, y2) => {
            if (Math.abs(x2 - x1) < 1) return `M${x1},${y1}V${y2}`;
            const my = y1 + (y2 - y1) / 2, sg = Math.sign(x2 - x1), r = Math.min(12, Math.abs(x2 - x1) / 2, (y2 - y1) / 4);
            return `M${x1},${y1}V${my - r}Q${x1},${my} ${x1 + sg * r},${my}H${x2 - sg * r}Q${x2},${my} ${x2},${my + r}V${y2}`;
        };
        const edges = [];
        const link = (from, to, done, straight) => {
            const a = el(from), b = el(to);
            if (!a || !b) return;
            const p = at(a, false), q = at(b, true);
            edges.push({ d: straight ? `M${q.x},${p.y}V${q.y}` : elbow(p.x, p.y, q.x, q.y), done, grow: this._changed.has(to) });
        };
        const walk = (id, kids) => {
            const leaves = kids.filter(k => !this._isContainer(k)), groups = kids.filter(k => this._isContainer(k));
            if (leaves.length) {
                link(id, leaves[0].id, this._isComplete(leaves[0]), !groups.length);
                for (let i = 1; i < leaves.length; i++) link(leaves[i - 1].id, leaves[i].id, this._isComplete(leaves[i]), true);
            }
            groups.forEach(g => {
                link(id, g.id, this._isComplete(g));
                if (!this.state.collapsedNodes.has(g.id)) walk(g.id, this._visibleNodes(g.children));
            });
        };
        walk(ROOT, this._visibleNodes(fc.phases));
        edges.sort((a, b) => b.done - a.done);
        map.insertAdjacentHTML('afterbegin', `<svg class="links" width="${map.scrollWidth}" height="${map.scrollHeight}" aria-hidden="true">${
            edges.map(e => !e.grow ? `<path d="${e.d}"${e.done ? ' class="done"' : ''}/>`
                // newly done: the green line draws in. Newly undone: grey draws back over a green underlay.
                : e.done ? `<path d="${e.d}" class="done grow" pathLength="1"/>`
                : `<path d="${e.d}" class="done"/><path d="${e.d}" class="grow" pathLength="1"/>`).join('')}</svg>`);
    }

    // ---- Toolbar actions ----

    _moreMenuItems() {
        return [
            { label: 'Generate with AI', icon: 'sparkle', run: () => this._flowAction('ai') },
            { label: 'New Phase', icon: 'addPhase', run: () => this._flowAction('phase') },
            { label: 'Edit JSON', icon: 'edit', run: () => this._flowAction('json') },
            'sep',
            { label: 'Clear Flowchart', icon: 'trash', danger: true, run: () => this._flowAction('clear') }
        ];
    }

    async _flowAction(action) {
        const fc = this._currentFc();
        if (!fc) return;
        if (action === 'ai') { this.openSheet('ai'); return; }
        if (action === 'json') { this.openSheet('json'); return; }
        if (action === 'phase') {
            const name = await this.showCustomModal({ type: 'text', title: 'New Phase', label: 'Phase name', placeholder: 'e.g. Research', button: 'Add' });
            const t = name && name.replace(/\s+/g, ' ').trim();
            if (!t) return;
            fc.phases.push(this._newNode(t, true));
            this.library.saveData();
            this.renderFlowchartCanvas(fc);
            return;
        }
        if (action === 'clear') {
            const ok = await this.showCustomModal({ type: 'confirm', title: `Clear “${fc.name}”?`,
                message: 'All phases and steps will be removed. This can’t be undone.', confirmLabel: 'Clear' });
            if (!ok) return;
            this.library.updateFlowchartData(fc.id, []);
            this._cancelPendingHide();
            this.renderFlowchartCanvas(this._currentFc());
        }
    }

    _attachFlowListeners() {
        const flow = this.els.flow, body = this.els.flowBody, title = this.els.flowTitle;

        flow.addEventListener('click', (e) => {
            const fc = this._currentFc();
            if (!fc) return;
            if (e.target.closest('[data-back]')) { this._closeFlowchartView(true); return; }
            const step = e.target.closest('[data-step]');
            if (step) { this.stepFlowchart(+step.dataset.step); return; }
            const mode = e.target.closest('[data-mode]');
            if (mode) {
                if (mode.dataset.mode !== this.state.viewMode) {
                    this.state.viewMode = mode.dataset.mode;
                    this._cancelPendingHide();
                    this.renderFlowchartCanvas(fc);
                }
                return;
            }
            if (e.target.closest('[data-eye]')) {
                this.state.hideCompleted = !this.state.hideCompleted;
                try { localStorage.setItem('flowtracker_hide_completed', String(this.state.hideCompleted)); } catch (_) {}
                this._cancelPendingHide();
                this._renderWithTransition(fc);
                return;
            }
            if (e.target.closest('[data-collapse-all]')) {
                if (this.state.viewMode !== 'map') return;
                const ids = this._getExpandableNodeIds(fc.phases);
                const anyClosed = ids.some(id => this.state.collapsedNodes.has(id));
                ids.forEach(id => anyClosed ? this.state.collapsedNodes.delete(id) : this.state.collapsedNodes.add(id));
                this.renderFlowchartCanvas(fc);
                return;
            }
            const action = e.target.closest('[data-flow-action]');
            if (action) { this._flowAction(action.dataset.flowAction); return; }
            const addStep = e.target.closest('[data-add-step]');
            if (addStep) { this._addChildLeaf(addStep.dataset.addStep); return; }
            const addSub = e.target.closest('[data-add-sub]');
            if (addSub) { this._addChildContainer(addSub.dataset.addSub, 'Subphase'); return; }
            const leaf = e.target.closest('[data-leaf]');
            if (leaf) { this._toggleLeafCompletion(leaf.dataset.leaf); return; }
            const col = e.target.closest('[data-collapse]');
            if (col) this._toggleCollapse(col.dataset.collapse);
        });

        // Right-click any phase, group or step (List and Map)
        body.addEventListener('contextmenu', (e) => {
            const el = e.target.closest('[data-node-id]');
            if (!el || this._sheetOpen()) return;
            e.preventDefault();
            this._openNodeContextMenu(e, el.dataset.nodeId);
        });

        // Rename the flowchart from its title
        title.setAttribute('contenteditable', 'plaintext-only');
        if (title.contentEditable !== 'plaintext-only') title.setAttribute('contenteditable', 'true');
        title.spellcheck = false;
        title.title = 'Click to rename';
        title.addEventListener('focus', () => requestAnimationFrame(() => getSelection().selectAllChildren(title)));
        title.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
            if (e.key === 'Escape') { e.stopPropagation(); const fc = this._currentFc(); if (fc) title.textContent = fc.name; title.blur(); }
        });
        title.addEventListener('paste', (e) => {   // plain text only, even where plaintext-only isn't supported
            e.preventDefault();
            document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s+/g, ' '));
        });
        title.addEventListener('blur', () => {
            const fc = this._currentFc();
            if (!fc) return;
            const t = title.textContent.replace(/\s+/g, ' ').trim();
            if (t && t !== fc.name) this.library.renameFlowchart(fc.id, t);
            this.renderFlowchartCanvas(this._currentFc());
        });

        // Pager on ← / → when nothing else wants the keys
        document.addEventListener('keydown', (e) => {
            if (!this.state.viewingFlowchartId || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
            if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            if (this._sheetOpen() || this._menuOpen()) return;
            if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
            e.preventDefault();
            this.stepFlowchart(e.key === 'ArrowLeft' ? -1 : 1);
        });

        // Refit the map once per frame while resizing, not once per resize event
        window.addEventListener('resize', () => {
            if (this._resizeRaf) return;
            this._resizeRaf = requestAnimationFrame(() => { this._resizeRaf = 0; this._fitMap(); this._slideThumb(); });
        });
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
        const stored = localStorage.getItem('flowtracker_gemini_model');
        // A model saved before the list changed may no longer be offered; use the default then.
        const offered = FT_MODELS.some(m => m.id && m.id === stored);
        return stored && offered ? stored : 'gemini-3.8-flash';
    }

    // Free models in list order (best first); each has its own quota, so they form the fallback chain.
    _getFreeGeminiModels() {
        return FT_MODELS.filter(m => m.free).map(m => m.id);
    }

    _setGeminiModel(model) {
        localStorage.setItem('flowtracker_gemini_model', model);
    }

    // ---- AI sheet ----

    _resetAiSheet() {
        const sh = this._sheet('ai');
        this._aiFiles = [];
        this._renderAiFileList();
        this._showAiError('');
        this._setAiLoading(false);
        this._refreshKeyUI();
        this._model = this._getGeminiModel();
        this._paintDD();
        sh.querySelector('.sheet-body').scrollTop = 0;
    }

    _focusAiStart() {
        const sh = this._sheet('ai');
        (this._getGeminiKey() ? sh.querySelector('[data-ai-text]') : sh.querySelector('[data-key-input]')).focus();
    }

    _refreshKeyUI() {
        const sh = this._sheet('ai'), key = this._getGeminiKey();
        sh.querySelector('[data-key-label]').innerHTML = key ? `••••${this._escapeHtml(key.slice(-4))}` : '';
        this._showKeyEdit(!key, false);
    }

    // Shows the key field (Change, or no key yet) or the "saved" row
    _showKeyEdit(edit, focus = true) {
        const sh = this._sheet('ai'), input = sh.querySelector('[data-key-input]');
        sh.querySelector('[data-key-saved]').hidden = edit;
        sh.querySelector('[data-key-edit]').hidden = !edit;
        input.value = '';
        if (edit && focus) input.focus();
    }

    _saveKey() {
        const sh = this._sheet('ai'), key = sh.querySelector('[data-key-input]').value.trim();
        if (!key) {
            if (this._getGeminiKey()) { this._refreshKeyUI(); sh.querySelector('[data-key-change]').focus(); return; } // empty Save = keep the old key
            this._showAiError('Paste an API key first.');
            sh.querySelector('[data-key-input]').focus();
            return;
        }
        this._setGeminiKey(key);
        this._showAiError('');
        this._refreshKeyUI();
        sh.querySelector('[data-key-change]').focus();
    }

    _renderAiFileList() {
        const files = this._aiFiles || [];
        // Image previews are object URLs: release the ones whose file was removed
        this._thumbs = this._thumbs || new Map();
        this._thumbs.forEach((url, f) => { if (!files.includes(f)) { URL.revokeObjectURL(url); this._thumbs.delete(f); } });
        this._sheet('ai').querySelector('[data-files]').innerHTML = files.map((f, i) => this._fileRowHTML(f, `data-rm-file="${i}"`, true)).join('');
    }

    // One chosen file: preview (image) or file icon, name, kind and size, a Ready pill, and a remove button
    _fileRowHTML(f, rmAttr, ready) {
        const I = this.I, esc = s => this._escapeHtml(s), isImg = f.type.startsWith('image/');
        if (isImg && !this._thumbs?.has(f)) (this._thumbs = this._thumbs || new Map()).set(f, URL.createObjectURL(f));
        const kind = isImg ? 'Image' : f.type === 'application/pdf' ? 'PDF' : ((f.name.match(/\.(\w+)$/) || [])[1] || 'File').toUpperCase();
        const thumb = isImg ? `<span class="file-thumb" style="background-image:url('${this._thumbs.get(f)}')"></span>` : `<span class="file-thumb">${I.file}</span>`;
        return `<div class="file-row">${thumb}<span class="file-meta"><span class="file-name" title="${esc(f.name)}">${esc(f.name)}</span>`
            + `<span class="file-sub">${esc(kind)}, ${this._fmtBytes(f.size)}</span></span>${ready ? '<span class="file-ready">Ready</span>' : ''}`
            + `<button type="button" class="file-x" aria-label="Remove ${esc(f.name)}" ${rmAttr}>${I.x}</button></div>`;
    }

    _fmtBytes(b) {
        if (b < 1024) return `${b} B`;
        const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), 3);
        return `${(b / 1024 ** i).toFixed(1).replace(/\.0$/, '')} ${['B', 'KB', 'MB', 'GB'][i]}`;
    }

    _isTextFile(f) {
        return f.type.startsWith('text/') || /\.(md|markdown|txt)$/i.test(f.name);
    }

    _addAiFiles(fileList) {
        if (!this._aiFiles) this._aiFiles = [];
        const skipped = [], tooBig = [];
        for (const f of fileList) {
            if (f.type !== 'application/pdf' && !f.type.startsWith('image/') && !this._isTextFile(f)) { skipped.push(f.name); continue; }
            if (f.size > FT_AI_MAX_BYTES) { tooBig.push(f.name); continue; }
            if (!this._aiFiles.some(x => x.name === f.name && x.size === f.size)) this._aiFiles.push(f);
        }
        this._renderAiFileList();
        const list = names => names.map(n => `“${n}”`).join(', ');
        this._showAiError([
            tooBig.length ? `${list(tooBig)} ${tooBig.length === 1 ? 'is' : 'are'} larger than 20 MB, so ${tooBig.length === 1 ? 'it' : 'they'} can’t be sent.` : '',
            skipped.length ? `${list(skipped)}: only PDFs, images and text files can be attached.` : ''
        ].filter(Boolean).join(' '));
    }

    _showAiError(msg) {
        const el = this._sheet('ai').querySelector('[data-ai-error]');
        el.textContent = msg || '';
        el.hidden = !msg;
    }

    _setAiLoading(loading) {
        const sh = this._sheet('ai'), btn = sh.querySelector('[data-ai-run]');
        btn.disabled = loading;
        btn.setAttribute('aria-busy', String(loading));
        sh.querySelector('[data-ai-icon]').innerHTML = loading ? '<span class="spinner" aria-hidden="true"></span>' : this.I.sparkle;
        sh.querySelector('[data-ai-label]').textContent = loading ? 'Generating…' : 'Generate';
        sh.querySelector('[data-ai-text]').readOnly = loading;
    }

    // Submit: check the inputs, ask before replacing existing phases, then generate.
    // Closing the sheet while it works cancels the request.
    async _runAi(confirmed = false) {
        if (this._aiCtl) return;
        const sh = this._sheet('ai');
        this._showAiError('');
        const typedKey = sh.querySelector('[data-key-input]').value.trim();
        if (typedKey && sh.querySelector('[data-key-saved]').hidden) this._saveKey();   // typed but not saved yet
        const key = this._getGeminiKey();
        if (!key) { this._showAiError('Save your Gemini API key first.'); sh.querySelector('[data-key-input]').focus(); return; }
        const text = sh.querySelector('[data-ai-text]').value.trim();
        const files = this._aiFiles || [];
        if (!text && !files.length) { this._showAiError('Add some notes or attach at least one file.'); sh.querySelector('[data-ai-text]').focus(); return; }

        const fc = this._currentFc();
        if (!fc) return;
        const opener = this._lastFocus;
        if (fc.phases.length && !confirmed) {
            const n = fc.phases.length;
            this.openSheet('confirm', {
                title: 'Replace existing phases?',
                message: `“${fc.name}” already has ${this._plural(n, 'phase')}. The generated phases replace ${n === 1 ? 'it' : 'them'}.`,
                button: 'Replace', returnTo: opener,
                onClose: r => {
                    this.openSheet('ai', { keep: true, returnTo: opener, onClose: () => this._cancelAi() });
                    if (r === true) this._runAi(true);
                }
            });
            return;
        }

        const ctl = new AbortController();
        this._aiCtl = ctl;
        this._sheetCfg.onClose = () => this._cancelAi();
        this._setAiLoading(true);
        try {
            const phases = await this.generateFlowchartFromAI({ text, files, key, signal: ctl.signal });
            if (ctl.signal.aborted) return;
            if (!Array.isArray(phases) || !phases.length) throw new Error('The AI did not return any phases. Try adding more detail.');
            this.library.updateFlowchartData(fc.id, phases);
            this._aiCtl = null;
            this._cancelPendingHide();
            this.renderFlowchartCanvas(this.library.getFlowchart(fc.id));
            this.closeSheet('done');
            const { total } = this._progress(phases);
            this.toast(`Generated ${this._plural(phases.length, 'phase')} with ${this._plural(total, 'step')}`);
        } catch (err) {
            if (!ctl.signal.aborted) this._showAiError(err.message || 'Something went wrong while generating.');
        } finally {
            if (this._aiCtl === ctl) { this._aiCtl = null; this._setAiLoading(false); }
        }
    }

    _cancelAi() {
        if (!this._aiCtl) return;
        this._aiCtl.abort();
        this._aiCtl = null;
        this._setAiLoading(false);
    }

    // ---- Model pop-up (a listbox under the button, like the mockup) ----

    _ddOpen() {
        return this.els.ddPop.classList.contains('open');
    }

    _paintDD() {
        const btn = this._sheet('ai').querySelector('[data-dd]'), m = FT_MODELS.find(x => x.id === this._model) || FT_MODELS[1];
        btn.querySelector('[data-dd-name]').textContent = m.name;
        btn.querySelector('[data-dd-note]').textContent = m.note;
        this.els.ddPop.innerHTML = FT_MODELS.map((x, i) => x.h
            ? `${i ? '<hr>' : ''}<div class="dd-h" role="presentation">${x.h}</div>`
            : `<button type="button" class="dd-opt${x.id === this._ddHl ? ' hl' : ''}" role="option" tabindex="-1" id="dd-${i}" aria-selected="${x.id === this._model}" data-opt="${x.id}">${this.I.check}<b>${this._escapeHtml(x.name)}</b><small>${this._escapeHtml(x.note)}</small></button>`).join('');
        const hl = this.els.ddPop.querySelector('.dd-opt.hl');
        if (hl && this._ddOpen()) btn.setAttribute('aria-activedescendant', hl.id);
        else btn.removeAttribute('aria-activedescendant');
    }

    // Keeps the highlighted model in view; the first one also shows its "Free" heading.
    _scrollDD() {
        const pop = this.els.ddPop, hl = pop.querySelector('.dd-opt.hl');
        if (!hl) return;
        if (hl === pop.querySelector('.dd-opt')) { pop.scrollTop = 0; return; }
        const top = hl.offsetTop - 6, bottom = hl.offsetTop + hl.offsetHeight + 6;
        if (top < pop.scrollTop) pop.scrollTop = top;
        else if (bottom > pop.scrollTop + pop.clientHeight) pop.scrollTop = bottom - pop.clientHeight;
    }

    _openDD() {
        const btn = this._sheet('ai').querySelector('[data-dd]'), pop = this.els.ddPop;
        this._ddHl = this._model;
        pop.classList.add('open');
        this._paintDD();
        pop.scrollTop = 0;
        this._scrollDD();
        const r = btn.getBoundingClientRect();
        pop.style.width = r.width + 'px';
        pop.style.left = r.left + 'px';
        const h = pop.offsetHeight, below = innerHeight - r.bottom - 8;
        const up = below < h && r.top > below;
        pop.classList.toggle('up', up);
        pop.style.top = Math.max(8, up ? r.top - h - 6 : r.bottom + 6) + 'px';
        btn.setAttribute('aria-expanded', 'true');
    }

    _closeDD(focus) {
        if (!this._ddOpen()) return;
        const btn = this._sheet('ai').querySelector('[data-dd]');
        this.els.ddPop.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        btn.removeAttribute('aria-activedescendant');
        if (focus) btn.focus();
    }

    _pickModel(id) {
        this._model = id;
        this._setGeminiModel(id);
        this._paintDD();
        this._closeDD(true);
    }

    // Keys for the model list; true when the key was handled
    _ddKey(e) {
        const btn = this._sheet('ai').querySelector('[data-dd]');
        if (!this._ddOpen()) {
            if (document.activeElement === btn && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); this._openDD(); return true; }
            return false;
        }
        const ids = FT_MODELS.filter(m => m.id).map(m => m.id), k = ids.indexOf(this._ddHl);
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this._closeDD(true); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this._ddHl = ids[(k + (e.key === 'ArrowDown' ? 1 : -1) + ids.length) % ids.length]; this._paintDD(); this._scrollDD(); }
        else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); this._ddHl = e.key === 'Home' ? ids[0] : ids[ids.length - 1]; this._paintDD(); this._scrollDD(); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._pickModel(this._ddHl); }
        else if (e.key === 'Tab') { this._closeDD(); return false; }
        return true;
    }

    // ---- Edit JSON sheet ----

    // Checks the JSON as it is typed; Save stays off until it is a valid list of phases.
    _checkJSON() {
        const sh = this._sheet('json'), t = sh.querySelector('[data-json]'), note = sh.querySelector('[data-json-note]'), save = sh.querySelector('[data-json-save]');
        let nodes = null, msg;
        try {
            const v = JSON.parse(t.value);
            if (!Array.isArray(v)) msg = 'The top level must be a list of phases: [ … ]';
            else if (!this._validNodes(v)) msg = 'Each phase and step must be an object, like { "title": "Plan" }';
            else nodes = this.library.normalizeNodes(v);
        } catch (err) {
            const at = String(err.message).match(/line (\d+) column (\d+)/);
            msg = `Invalid JSON${at ? ` on line ${at[1]}, column ${at[2]}` : ''}`;
        }
        if (nodes) {
            const { total } = this._progress(nodes);
            note.className = 'note ok';
            note.innerHTML = `${this.I.check}${this._plural(nodes.length, 'phase')}, ${this._plural(total, 'step')}`;
        } else {
            note.className = 'note bad';
            note.textContent = msg;
        }
        t.classList.toggle('bad', !nodes);
        t.setAttribute('aria-invalid', String(!nodes));
        save.disabled = !nodes;
        return nodes;
    }

    _saveJSON() {
        const nodes = this._checkJSON(), fc = this._currentFc();
        if (!nodes || !fc) return;
        // Hand-edited JSON is normalised: ids filled in, steps -> children, completed defaulted on leaves.
        this.library.updateFlowchartData(fc.id, nodes);
        this._cancelPendingHide();
        this.renderFlowchartCanvas(this.library.getFlowchart(fc.id));
        this.closeSheet('saved');
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

    async generateFlowchartFromAI({ text, files, key, signal }) {
        const MODEL = this._getGeminiModel();

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

        const promptText = `You are organizing the provided project overview, notes, Markdown/text files, PDF text, and/or images (which may contain messy handwriting) into a sequential workflow of "Phases", each containing checkable "Steps".

Nesting is OPTIONAL. Only when the material is genuinely hierarchical, a Step may itself contain
sub-steps (put them in that item's "children"). Keep the tree shallow — do not nest just for the
sake of it. A simple project should stay a flat Phase → Step structure.

PRESERVE THE AUTHOR'S WORDING. This is the most important rule:
- Use the author's own words for every item. Transcribe text from images and handwriting exactly as written.
- Correct ONLY spelling, grammar, capitalization, and punctuation mistakes. Leave everything else as is.
- Do NOT paraphrase, summarize, shorten, lengthen, reword, or "improve" text, and do not swap words for synonyms.
- If a sentence is already correct, keep it word for word. If it has minor errors, fix only those errors.
- Rewrite a sentence only when it is so grammatically broken that its meaning is unclear, and even then
  change as few words as possible and keep the intended message.
- Do not invent steps or add detail that is not in the source. Do not drop content from the source.
- If the source already has headings or sections, use them as the Phase titles (with only the same grammar
  fixes). Only when the source has no heading for a group may you write a short, plain Phase title.

Other rules:
1. Order phases and steps in the sequence the work should be performed (keep the source's order when it gives one).
2. A leaf item (no children) is a checkable step. An item with "children" is a group/heading.
3. Output only JSON — no commentary — as an array of phases shaped like:
   [{"title": "...", "children": [{"title": "..."}, {"title": "...", "children": [{"title": "..."}]}]}]

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

        const responseSchema = { type: 'ARRAY', items: phaseItems };
        const isGemma = model => /^gemma-/.test(model);

        // Try the chosen model first, then every free model in order: each has its own daily
        // quota, and a retired model just 404s, so either moves on to the next one.
        const models = Array.from(new Set([MODEL, ...this._getFreeGeminiModels()]));
        let parsed;
        let lastErr;
        for (let i = 0; i < models.length && parsed === undefined; i++) {
            const model = models[i];
            if (i > 0) await new Promise(r => setTimeout(r, 600));
            if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError');

            let res;
            try {
                res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                    body: JSON.stringify({
                        contents: [{ parts }],
                        // Gemma doesn't take a response schema; its JSON is parsed from the text below.
                        generationConfig: isGemma(model) ? {} : { responseMimeType: 'application/json', responseSchema }
                    }),
                    signal
                });
            } catch (e) {
                if (signal && signal.aborted) throw e;
                lastErr = new Error('Network error contacting Google. Check your internet connection.');
                continue;
            }

            if (!res.ok) {
                // Surface Google's actual error message — it's far more specific than the HTTP code
                let detail = '';
                try {
                    const errJson = await res.json();
                    detail = errJson?.error?.message || '';
                } catch (e) { /* body wasn't JSON */ }

                // Gemma accepts fewer request options (and file types) than Gemini, so a Gemma 400
                // says nothing about the key: move on to the next model.
                if (res.status === 400 && isGemma(model)) {
                    lastErr = new Error(`${model} could not handle this request (HTTP 400). ${detail}`);
                    continue;
                }
                if (res.status === 400 || res.status === 403) {
                    throw new Error('API key rejected (HTTP ' + res.status + '). ' + (detail || 'Double-check the key and that the "Generative Language API" is enabled for its project.'));
                }
                if (res.status === 404) {
                    lastErr = new Error('Model not found (HTTP 404). ' + (detail || 'The model name may be unavailable for this key.'));
                } else if (res.status === 429) {
                    lastErr = new Error('Quota/rate limit reached on every free model (HTTP 429). ' + (detail || 'Free tier has per-minute and per-day limits — wait ~60s.'));
                } else {
                    lastErr = new Error(`Gemini request failed (HTTP ${res.status}). ${detail}`);
                }
                continue;
            }

            const json = await res.json();
            let raw = (json?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
            if (!raw) { lastErr = new Error('The AI returned an empty response. Try again.'); continue; }
            // Models without a schema sometimes wrap the JSON in ``` fences.
            raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
            try {
                parsed = JSON.parse(raw);
            } catch (e) {
                lastErr = new Error('The AI returned invalid JSON. Try again or simplify the input.');
            }
        }
        if (parsed === undefined) throw lastErr || new Error('Something went wrong while generating.');

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
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
