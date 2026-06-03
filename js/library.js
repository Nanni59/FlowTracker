class FlowchartLibrary {
    constructor() {
        this.STORAGE_KEY = 'flowchart_tracker_v2';
        this.data = this.loadData();
    }

    loadData() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (!parsed.categories) parsed.categories = [];
                if (!parsed.flowcharts || !Array.isArray(parsed.flowcharts)) {
                    parsed.flowcharts = [];
                } else {
                    parsed.flowcharts.forEach(f => {
                        if (f.categoryId === undefined) f.categoryId = null;
                    });
                }
                return parsed;
            } catch (e) {
                console.error("Failed to parse storage", e);
                return this.getDefaultSchema();
            }
        }
        return this.getDefaultSchema();
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
                            steps: [
                                { id: 's1', title: 'Requirements Gathering', completed: true },
                                { id: 's2', title: 'Architecture Design', completed: false }
                            ]
                        },
                        {
                            id: 'p2',
                            title: 'Phase 2: Execution',
                            steps: [
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

    updateFlowchartData(id, phases) {
        const fc = this.getFlowchart(id);
        if (fc) { fc.phases = phases; this.saveData(); return true; }
        return false;
    }

    reorderFlowcharts(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.data.flowcharts.length || toIndex < 0 || toIndex >= this.data.flowcharts.length) return false;
        const [moved] = this.data.flowcharts.splice(fromIndex, 1);
        this.data.flowcharts.splice(toIndex, 0, moved);
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

    createCategory(name) {
        if (!this.data.categories) this.data.categories = [];
        const newCat = { id: 'c-' + Date.now(), name: name };
        this.data.categories.push(newCat);
        this.saveData();
        return newCat;
    }

    renameCategory(id, newName) {
        const cat = this.getCategory(id);
        if (cat) { cat.name = newName; this.saveData(); return true; }
        return false;
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

    exportToJSON() {
        return JSON.stringify(this.data, null, 2);
    }

    importFromJSON(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            if (!parsed.flowcharts) throw new Error("Invalid Format");
            this.data = parsed;
            this.saveData();
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}

window.FlowchartLibrary = FlowchartLibrary;
