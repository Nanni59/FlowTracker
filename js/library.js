class FlowchartLibrary {
    constructor() {
        this.STORAGE_KEY = 'flowchart_tracker_v2';
        this.data = this.loadData();
    }

    loadData() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            try {
                // _cleanData normalizes the nodes and drops anything that isn't FlowTracker's own data
                return this._cleanData(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse storage", e);
                return this.getDefaultSchema();
            }
        }
        return this.getDefaultSchema();
    }

    // ---- Recursive node model ----
    // A node is { id, title, completed?, children?: [node] }.
    // Leaf = no non-empty children (checkable). Container = has children.
    // Older data used phase.steps[]; migrate steps -> children recursively so
    // both existing localStorage and older JSON exports keep working.

    _uid(prefix = 'n') {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }

    // `seen` holds the ids already used in this flowchart. Ids are always strings (the views look nodes up
    // by their data-* attribute) and unique (a repeated id would make two steps tick as one).
    normalizeNode(node, seen = new Set()) {
        if (!node || typeof node !== 'object') return null;
        node.id = node.id == null || node.id === '' ? '' : String(node.id);
        while (!node.id || seen.has(node.id)) node.id = this._uid();
        seen.add(node.id);
        if (typeof node.title !== 'string') node.title = String(node.title || '');

        // Legacy: a phase carried its leaves under `steps` (possibly empty).
        if (Array.isArray(node.steps) && !Array.isArray(node.children)) {
            node.children = node.steps;
        }
        delete node.steps;

        // Container = has a `children` array (even if empty); leaf = no children.
        if (Array.isArray(node.children)) {
            node.children = node.children.map(c => this.normalizeNode(c, seen)).filter(Boolean);
            delete node.completed;   // completion is derived from descendants
        } else {
            node.completed = !!node.completed;
        }
        return node;
    }

    normalizeNodes(nodes) {
        if (!Array.isArray(nodes)) return [];
        const seen = new Set();
        return nodes.map(n => this.normalizeNode(n, seen)).filter(Boolean);
    }

    saveData() {
        this.data.lastUpdated = new Date().toISOString();
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    }

    getDefaultSchema() {
        return {
            version: "2.0",
            lastUpdated: new Date().toISOString(),
            categories: [],
            flowcharts: [
                {
                    id: "f-default",
                    name: "Sample Project",
                    categoryId: null,
                    phases: [
                        {
                            id: 'p1',
                            title: 'Phase 1: Planning',
                            children: [
                                { id: 's1', title: 'Requirements Gathering', completed: true },
                                { id: 's2', title: 'Architecture Design', completed: false }
                            ]
                        },
                        {
                            id: 'p2',
                            title: 'Phase 2: Execution',
                            children: [
                                { id: 's3', title: 'Setup Environment', completed: false },
                                { id: 's4', title: 'Development', completed: false }
                            ]
                        }
                    ]
                }
            ]
        };
    }

    // ---- Flowchart CRUD ----

    getFlowcharts() {
        return this.data.flowcharts;
    }

    getFlowchart(id) {
        return this.data.flowcharts.find(f => f.id === id);
    }

    createFlowchart(name, categoryId = null) {
        const newFlowchart = {
            id: 'f-' + Date.now(),
            name: name,
            categoryId: categoryId,
            phases: []
        };
        this.data.flowcharts.push(newFlowchart);
        this.saveData();
        return newFlowchart;
    }

    renameFlowchart(id, newName) {
        const fc = this.getFlowchart(id);
        if (fc) { fc.name = newName; this.saveData(); return true; }
        return false;
    }

    deleteFlowchart(id) {
        this.data.flowcharts = this.data.flowcharts.filter(f => f.id !== id);
        this.saveData();
    }

    assignFlowchartToCategory(flowchartId, categoryId) {
        const fc = this.getFlowchart(flowchartId);
        if (fc) { fc.categoryId = categoryId; this.saveData(); return true; }
        return false;
    }

    // New phases (import, Edit JSON, AI) keep only FlowTracker's own fields, like a load or a backup
    updateFlowchartData(id, phases) {
        const fc = this.getFlowchart(id);
        if (!fc) return false;
        fc.phases = this.normalizeNodes(phases).map(n => this._cleanNode(n));
        this.saveData();
        return true;
    }

    // ---- Category (Course) CRUD ----

    getCategories() {
        return this.data.categories || [];
    }

    getCategory(id) {
        return this.getCategories().find(c => c.id === id);
    }

    createCategory(name, color = null) {
        if (!this.data.categories) this.data.categories = [];
        const newCat = { id: 'c-' + Date.now(), name: name };
        if (color) newCat.color = color;   // optional Reminders-style colour (hex)
        this.data.categories.push(newCat);
        this.saveData();
        return newCat;
    }

    // Changes a category's name and/or colour (colour is a hex string)
    updateCategory(id, { name, color } = {}) {
        const cat = this.getCategory(id);
        if (!cat) return false;
        if (typeof name === 'string' && name) cat.name = name;
        if (typeof color === 'string' && /^#[0-9a-f]{3,8}$/i.test(color)) cat.color = color;
        this.saveData();
        return true;
    }

    deleteCategory(id) {
        if (!this.data.categories) return;
        this.data.categories = this.data.categories.filter(c => c.id !== id);
        this.data.flowcharts.forEach(f => {
            if (f.categoryId === id) f.categoryId = null;
        });
        this.saveData();
    }

    // ---- Export / Import ----

    // A backup holds only FlowTracker's own fields, whatever else ended up in storage or an imported file.
    _cleanNode(n) {
        const out = { id: String(n.id), title: String(n.title) };
        if (Array.isArray(n.children)) out.children = n.children.map(c => this._cleanNode(c));
        else out.completed = !!n.completed;
        return out;
    }

    _cleanData(data) {
        const okColor = c => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c);
        return {
            version: '2.0',
            lastUpdated: typeof data.lastUpdated === 'string' ? data.lastUpdated : new Date().toISOString(),
            categories: (Array.isArray(data.categories) ? data.categories : []).filter(c => c && c.id != null).map(c => {
                const out = { id: String(c.id), name: String(c.name ?? '') };
                if (okColor(c.color)) out.color = c.color;
                return out;
            }),
            flowcharts: (Array.isArray(data.flowcharts) ? data.flowcharts : []).filter(f => f && f.id != null).map(f => ({
                id: String(f.id),
                name: String(f.name ?? ''),
                categoryId: f.categoryId == null ? null : String(f.categoryId),
                phases: this.normalizeNodes(f.phases || []).map(n => this._cleanNode(n))
            }))
        };
    }

    exportToJSON() {
        return JSON.stringify(this._cleanData(this.data), null, 2);
    }

    importFromJSON(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            if (!parsed.flowcharts) throw new Error("Invalid Format");
            this.data = this._cleanData(parsed);
            this.saveData();
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}

window.FlowchartLibrary = FlowchartLibrary;
