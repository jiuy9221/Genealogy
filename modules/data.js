// modules/data.js - 数据加载、保存、格式转换

const STORAGE_KEY = "genealogy_familyData";

const defaultData = () => ({ persons: [], relationships: [], marriages: [] });

function generateId() {
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function loadFromLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function saveToLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearLocal() {
    localStorage.removeItem(STORAGE_KEY);
}

// --- JSON 导出 ---
function exportJSON(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(blob, "family.json");
}

// --- Markdown 导出 ---
function exportMarkdown(data) {
    let md = "# 族谱数据\n\n## 人员列表\n\n";
    data.persons.forEach(p => {
        md += `### ${p.name}\n`;
        md += `- ID: ${p.id}\n`;
        md += `- 性别: ${p.gender === "male" ? "男" : p.gender === "female" ? "女" : "未知"}\n`;
        md += `- 出生: ${p.birth || "不详"}\n`;
        if (p.death) md += `- 死亡: ${p.death}\n`;
        if (p.notes) md += `- 备注: ${p.notes}\n`;
        md += "\n";
    });
    md += "## 亲子关系\n\n";
    data.relationships.forEach(r => {
        const parent = data.persons.find(x => x.id === r.parent);
        const child = data.persons.find(x => x.id === r.child);
        if (parent && child) md += `- ${parent.name} → ${child.name}\n`;
    });
    md += "\n## 婚姻关系\n\n";
    data.marriages.forEach(m => {
        const s1 = data.persons.find(x => x.id === m.spouse1);
        const s2 = data.persons.find(x => x.id === m.spouse2);
        if (s1 && s2) md += `- ${s1.name} ⚭ ${s2.name}\n`;
    });
    const blob = new Blob([md], { type: "text/markdown" });
    downloadBlob(blob, "family.md");
}

// --- Markdown 导入解析 ---
function parseMarkdown(text) {
    const data = defaultData();
    const lines = text.split("\n");
    let currentPerson = null;

    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith("### ")) {
            if (currentPerson) data.persons.push(currentPerson);
            currentPerson = { id: "", name: trimmed.slice(4), gender: "", birth: "", death: "", notes: "" };
        } else if (currentPerson) {
            if (trimmed.startsWith("- ID:")) currentPerson.id = trimmed.slice(5).trim();
            else if (trimmed.startsWith("- 性别:")) {
                const g = trimmed.slice(4).trim();
                currentPerson.gender = g === "男" ? "male" : g === "女" ? "female" : "";
            } else if (trimmed.startsWith("- 出生:")) currentPerson.birth = trimmed.slice(4).trim() === "不详" ? "" : trimmed.slice(4).trim();
            else if (trimmed.startsWith("- 死亡:")) currentPerson.death = trimmed.slice(4).trim();
            else if (trimmed.startsWith("- 备注:")) currentPerson.notes = trimmed.slice(4).trim();
        }
    });
    if (currentPerson) data.persons.push(currentPerson);

    // 修复缺失 ID
    data.persons.forEach(p => { if (!p.id) p.id = generateId(); });

    // 解析亲子关系段
    const relSection = text.match(/## 亲子关系\n([\s\S]*?)(?=\n##|$)/);
    if (relSection) {
        relSection[1].split("\n").forEach(line => {
            const m = line.match(/- (.+?) → (.+)/);
            if (m) {
                const parent = data.persons.find(x => x.name === m[1].trim());
                const child = data.persons.find(x => x.name === m[2].trim());
                if (parent && child) data.relationships.push({ parent: parent.id, child: child.id });
            }
        });
    }

    // 解析婚姻关系段
    const marSection = text.match(/## 婚姻关系\n([\s\S]*?)(?=\n##|$)/);
    if (marSection) {
        marSection[1].split("\n").forEach(line => {
            const m = line.match(/- (.+?) ⚭ (.+)/);
            if (m) {
                const s1 = data.persons.find(x => x.name === m[1].trim());
                const s2 = data.persons.find(x => x.name === m[2].trim());
                if (s1 && s2) data.marriages.push({ spouse1: s1.id, spouse2: s2.id });
            }
        });
    }

    return data;
}

function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

function addPerson(data, fields) {
    const person = { id: generateId(), name: "", gender: "", birth: "", death: "", notes: "", ...fields };
    data.persons.push(person);
    return person;
}

function updatePerson(data, id, fields) {
    const idx = data.persons.findIndex(p => p.id === id);
    if (idx === -1) return false;
    data.persons[idx] = { ...data.persons[idx], ...fields };
    return true;
}

function deletePerson(data, id) {
    data.persons = data.persons.filter(p => p.id !== id);
    data.relationships = data.relationships.filter(r => r.parent !== id && r.child !== id);
    data.marriages = data.marriages.filter(m => m.spouse1 !== id && m.spouse2 !== id);
}

function addRelationship(data, parentId, childId) {
    const exists = data.relationships.some(r => r.parent === parentId && r.child === childId);
    if (!exists) data.relationships.push({ parent: parentId, child: childId });
}

function addMarriage(data, spouse1Id, spouse2Id) {
    const exists = data.marriages.some(m =>
        (m.spouse1 === spouse1Id && m.spouse2 === spouse2Id) ||
        (m.spouse1 === spouse2Id && m.spouse2 === spouse1Id)
    );
    if (!exists) data.marriages.push({ spouse1: spouse1Id, spouse2: spouse2Id });
}

function removeRelationship(data, parentId, childId) {
    data.relationships = data.relationships.filter(r => !(r.parent === parentId && r.child === childId));
}

function removeMarriage(data, spouse1Id, spouse2Id) {
    data.marriages = data.marriages.filter(m =>
        !((m.spouse1 === spouse1Id && m.spouse2 === spouse2Id) ||
          (m.spouse1 === spouse2Id && m.spouse2 === spouse1Id))
    );
}

// --- 祖先路径 ---
// 返回从最高祖先到 personId 的人员数组（含本人）
function getAncestorPath(data, personId) {
    const parentsOf = id => data.relationships.filter(r => r.child === id).map(r => r.parent);

    // DFS 向上找最长路径：返回 [rootId, ..., personId]
    function upPath(id, visited) {
        const parents = parentsOf(id).filter(p => !visited.has(p));
        if (!parents.length) return [id];
        let best = [id];
        for (const pid of parents) {
            const nv = new Set(visited); nv.add(pid);
            const sub = upPath(pid, nv);
            if (sub.length + 1 > best.length) best = [...sub, id];
        }
        return best;
    }

    const pathIds = upPath(personId, new Set([personId]));
    return pathIds.map(id => data.persons.find(p => p.id === id)).filter(Boolean);
}

// ─── 多族谱文件管理 ────────────────────────────────────────────────────────
const FILE_LIST_KEY = "genealogy_file_list";
const ACTIVE_ID_KEY = "genealogy_active_id";
const FILE_DATA_PFX = "genealogy_data_";

function generateFileId() {
    return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function loadFileList() {
    try {
        const raw = localStorage.getItem(FILE_LIST_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveFileList(list) {
    localStorage.setItem(FILE_LIST_KEY, JSON.stringify(list));
}

function getActiveFileId() {
    return localStorage.getItem(ACTIVE_ID_KEY) || null;
}

function setActiveFileId(id) {
    if (id) localStorage.setItem(ACTIVE_ID_KEY, id);
}

function loadGenealogyById(id) {
    try {
        const raw = localStorage.getItem(FILE_DATA_PFX + id);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function saveGenealogyById(id, data) {
    if (!id) return;
    localStorage.setItem(FILE_DATA_PFX + id, JSON.stringify(data));
    const list = loadFileList();
    const entry = list.find(f => f.id === id);
    if (entry) {
        entry.modified = new Date().toISOString().slice(0, 10);
        saveFileList(list);
    }
}

function deleteGenealogyById(id) {
    localStorage.removeItem(FILE_DATA_PFX + id);
    const list = loadFileList().filter(f => f.id !== id);
    saveFileList(list);
}

function createGenealogyFile(name, initialData) {
    const id = generateFileId();
    const now = new Date().toISOString().slice(0, 10);
    const list = loadFileList();
    list.push({ id, name: name || "新族谱", created: now, modified: now });
    saveFileList(list);
    const data = initialData || defaultData();
    localStorage.setItem(FILE_DATA_PFX + id, JSON.stringify(data));
    return id;
}

function renameGenealogyFile(id, newName) {
    const list = loadFileList();
    const entry = list.find(f => f.id === id);
    if (entry) { entry.name = newName; saveFileList(list); }
}

// 将旧版单键存储迁移到多文件系统，返回是否存在已有人员数据
function migrateFromLegacy() {
    if (loadFileList().length > 0) return false;
    let legacyData, hadData = false;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        legacyData = raw ? JSON.parse(raw) : defaultData();
        hadData = legacyData.persons?.length > 0;
    } catch { legacyData = defaultData(); }
    const id = createGenealogyFile("默认族谱", legacyData);
    setActiveFileId(id);
    return hadData;
}

// --- 统计分析 ---
function computeStats(data) {
    const total = data.persons.length;
    if (total === 0) return { total: 0, males: 0, females: 0, unknown: 0, generations: 0, marriages: 0, avgLifespan: null, maxChildrenPerson: null, maxChildren: 0, oldest: null };

    const males   = data.persons.filter(p => p.gender === "male").length;
    const females = data.persons.filter(p => p.gender === "female").length;
    const unknown = total - males - females;
    const marriages = data.marriages.length;

    // BFS 代际数
    const childrenOf = id => data.relationships.filter(r => r.parent === id).map(r => r.child);
    const parentsOf  = id => data.relationships.filter(r => r.child  === id).map(r => r.parent);
    const roots = data.persons.filter(p => parentsOf(p.id).length === 0).map(p => p.id);
    const levelMap = {};
    const queue = roots.map(id => ({ id, level: 0 }));
    const visited = new Set();
    while (queue.length) {
        const { id, level } = queue.shift();
        if (visited.has(id)) { if (level > (levelMap[id] ?? 0)) levelMap[id] = level; continue; }
        visited.add(id);
        levelMap[id] = level;
        childrenOf(id).forEach(cid => queue.push({ id: cid, level: level + 1 }));
    }
    data.persons.forEach(p => { if (levelMap[p.id] === undefined) levelMap[p.id] = 0; });
    const generations = Math.max(...Object.values(levelMap)) + 1;

    // 平均寿命
    const lifespans = data.persons
        .filter(p => p.birth && p.death)
        .map(p => { const b = parseInt(p.birth), d = parseInt(p.death); return (!isNaN(b) && !isNaN(d) && d > b && d - b < 130) ? d - b : null; })
        .filter(n => n !== null);
    const avgLifespan = lifespans.length ? Math.round(lifespans.reduce((a, b) => a + b, 0) / lifespans.length) : null;

    // 子女最多
    const cc = {};
    data.relationships.forEach(r => { cc[r.parent] = (cc[r.parent] || 0) + 1; });
    const top = Object.entries(cc).sort((a, b) => b[1] - a[1])[0];
    const maxChildrenPerson = top ? data.persons.find(p => p.id === top[0]) || null : null;
    const maxChildren = top ? top[1] : 0;

    // 最年长（出生年最早）
    const withBirth = data.persons.filter(p => p.birth && !isNaN(parseInt(p.birth)));
    const oldest = withBirth.slice().sort((a, b) => parseInt(a.birth) - parseInt(b.birth))[0] || null;

    return { total, males, females, unknown, generations, marriages, avgLifespan, maxChildrenPerson, maxChildren, oldest };
}
