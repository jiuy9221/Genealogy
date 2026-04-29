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
