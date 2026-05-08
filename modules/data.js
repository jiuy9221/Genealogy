// modules/data.js - 数据加载、保存、格式转换

const STORAGE_KEY = "genealogy_familyData";

// ─── 拼音首字母映射（用于搜索）────────────────────────────────────────────────
const _PINYIN = {
    // 百家姓
    '赵':'z','钱':'q','孙':'s','李':'l','周':'z','吴':'w','郑':'z','王':'w',
    '冯':'f','陈':'c','卫':'w','蒋':'j','沈':'s','韩':'h','杨':'y',
    '朱':'z','秦':'q','尤':'y','许':'x','何':'h','吕':'l','施':'s','张':'z',
    '孔':'k','曹':'c','严':'y','华':'h','金':'j','魏':'w','陶':'t','姜':'j',
    '戚':'q','谢':'x','邹':'z','章':'z','苏':'s','潘':'p','葛':'g','范':'f',
    '彭':'p','郎':'l','鲁':'l','韦':'w','马':'m','方':'f','俞':'y','任':'r',
    '袁':'y','柳':'l','鲍':'b','史':'s','唐':'t','薛':'x','雷':'l','贺':'h',
    '倪':'n','汤':'t','滕':'t','殷':'y','罗':'l','毕':'b','郝':'h','安':'a',
    '常':'c','于':'y','傅':'f','皮':'p','齐':'q','康':'k','伍':'w','余':'y',
    '顾':'g','孟':'m','黄':'h','萧':'x','尹':'y','姚':'y','邵':'s','汪':'w',
    '祁':'q','毛':'m','禹':'y','狄':'d','戴':'d','谈':'t','宋':'s','庞':'p',
    '熊':'x','舒':'s','屈':'q','项':'x','祝':'z','董':'d','梁':'l','杜':'d',
    '蓝':'l','席':'x','季':'j','贾':'j','路':'l','江':'j','童':'t','颜':'y',
    '郭':'g','梅':'m','盛':'s','林':'l','钟':'z','徐':'x','高':'g','夏':'x',
    '蔡':'c','田':'t','胡':'h','凌':'l','霍':'h','万':'w','卢':'l','莫':'m',
    '房':'f','宗':'z','丁':'d','邓':'d','单':'s','洪':'h','包':'b','石':'s',
    '崔':'c','吉':'j','龚':'g','程':'c','裴':'p','陆':'l','荣':'r','翁':'w',
    '段':'d','富':'f','焦':'j','谷':'g','车':'c','侯':'h','全':'q','宁':'n',
    '甘':'g','祖':'z','符':'f','刘':'l','景':'j','龙':'l','叶':'y','司':'s',
    '黎':'l','白':'b','蒲':'p','赖':'l','卓':'z','屠':'t','蒙':'m','谭':'t',
    '蒋':'j','章':'z','云':'y','窦':'d','苗':'m','花':'h','鲍':'b','费':'f',
    '廉':'l','岑':'c','殷':'y','邬':'w','乐':'l','时':'s','卞':'b','元':'y',
    '卜':'b','平':'p','穆':'m','纪':'j','闵':'m','麻':'m','强':'q','娄':'l',
    '童':'t','班':'b','宓':'m','甄':'z','储':'c','靳':'j','松':'s','巫':'w',
    '弓':'g','牧':'m','车':'c','宫':'g','栾':'l','戎':'r','詹':'z','束':'s',
    '印':'y','咸':'x','池':'c','乔':'q','贡':'g','逄':'p','惠':'h',
    // 常用名字字
    '文':'w','德':'d','明':'m','光':'g','正':'z','志':'z','国':'g','家':'j',
    '新':'x','民':'m','强':'q','美':'m','英':'y','兰':'l','春':'c','冬':'d',
    '青':'q','雪':'x','莲':'l','玉':'y','珍':'z','芳':'f','燕':'y','红':'h',
    '丽':'l','桂':'g','菊':'j','建':'j','军':'j','海':'h','峰':'f','森':'s',
    '鹏':'p','飞':'f','雄':'x','杰':'j','俊':'j','翠':'c','铁':'t','风':'f',
    '电':'d','星':'x','月':'y','天':'t','地':'d','心':'x','爱':'a','思':'s',
    '远':'y','长':'c','静':'j','聪':'c','慧':'h','智':'z','勇':'y','仁':'r',
    '义':'y','礼':'l','信':'x','忠':'z','孝':'x','善':'s','真':'z','诚':'c',
    '刚':'g','勤':'q','根':'g','泉':'q','树':'s','草':'c','东':'d','西':'x',
    '南':'n','北':'b','中':'z','婷':'t','淑':'s','秀':'x','雅':'y','倩':'q',
    '琳':'l','茜':'x','薇':'w','敏':'m','颖':'y','洁':'j','珊':'s','蕾':'l',
    '菲':'f','彤':'t','昕':'x','晨':'c','晓':'x','悦':'y','欣':'x','怡':'y',
    '佳':'j','嘉':'j','媛':'y','婉':'w','艳':'y','丹':'d','霞':'x','虹':'h',
    '彩':'c','露':'l','冰':'b','泽':'z','昊':'h','宇':'y','浩':'h','然':'r',
    '磊':'l','涛':'t','瑞':'r','武':'w','平':'p','安':'a','乐':'l','生':'s',
    '诗':'s','香':'x','清':'q','竹':'z','荷':'h','熙':'x','宸':'c','瑶':'y',
    '涵':'h','钰':'y','梓':'z','轩':'x','博':'b','晴':'q','泓':'h','枫':'f',
    '琦':'q','锦':'j','鑫':'x','航':'h','逸':'y','晟':'s','炜':'w','煜':'y',
    '曦':'x','旭':'x','晖':'h','灿':'c','煌':'h','烨':'y','凡':'f','浪':'l',
    '河':'h','湖':'h','岭':'l','坡':'p','原':'y','野':'y','园':'y','庭':'t',
    '堂':'t','室':'s','楼':'l','阁':'g','亭':'t','廊':'l','桥':'q','街':'j',
    '巷':'x','村':'c','镇':'z','城':'c','君':'j','臣':'c','父':'f','母':'m',
    '兄':'x','弟':'d','姐':'j','妹':'m','夫':'f','妻':'q','爷':'y','奶':'n',
    '叔':'s','伯':'b','侄':'z','曾':'z','族':'z','氏':'s','姓':'x','名':'m',
    '子':'z','女':'n','辉':'h','斌':'b','华':'h','云':'y','雨':'y','冰':'b',
    '鸿':'h','超':'c','宝':'b','玲':'l','静':'j','虎':'h','豹':'b','龙':'l',
};

function getPinyinInitials(name) {
    return name.split('').map(c => _PINYIN[c] || c.toLowerCase()).join('');
}

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
        if (p.tags && p.tags.length) md += `- 标签: ${p.tags.join(", ")}\n`;
        if (p.events && p.events.length) {
            md += "- 生平事件:\n";
            const sorted = [...p.events].sort((a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0));
            sorted.forEach(ev => {
                md += `  - ${ev.year || "?"} [${ev.type}] ${ev.desc}\n`;
            });
        }
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
        if (s1 && s2) md += `- ${s1.name} ⚭ ${s2.name}${m.year ? ` (${m.year})` : ""}\n`;
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
            currentPerson = { id: "", name: trimmed.slice(4), gender: "", birth: "", death: "", notes: "", tags: [], events: [] };
        } else if (currentPerson) {
            if (trimmed.startsWith("- ID:")) currentPerson.id = trimmed.slice(5).trim();
            else if (trimmed.startsWith("- 性别:")) {
                const g = trimmed.slice(4).trim();
                currentPerson.gender = g === "男" ? "male" : g === "女" ? "female" : "";
            } else if (trimmed.startsWith("- 出生:")) currentPerson.birth = trimmed.slice(4).trim() === "不详" ? "" : trimmed.slice(4).trim();
            else if (trimmed.startsWith("- 死亡:")) currentPerson.death = trimmed.slice(4).trim();
            else if (trimmed.startsWith("- 备注:")) currentPerson.notes = trimmed.slice(4).trim();
            else if (trimmed.startsWith("- 标签:")) currentPerson.tags = trimmed.slice(4).trim().split(",").map(s => s.trim()).filter(Boolean);
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
            const m = line.match(/- (.+?) ⚭ (.+?)(?:\s*\((\d{1,4})\))?$/);
            if (m) {
                const s1 = data.persons.find(x => x.name === m[1].trim());
                const s2 = data.persons.find(x => x.name === m[2].trim());
                if (s1 && s2) {
                    const rec = { spouse1: s1.id, spouse2: s2.id };
                    if (m[3]) rec.year = m[3];
                    data.marriages.push(rec);
                }
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
    const person = { id: generateId(), name: "", gender: "", birth: "", death: "", notes: "", events: [], tags: [], ...fields };
    data.persons.push(person);
    return person;
}

function addLifeEvent(data, personId, ev) {
    const p = data.persons.find(x => x.id === personId);
    if (!p) return;
    if (!p.events) p.events = [];
    p.events.push({ id: generateId(), year: ev.year || "", type: ev.type || "other", desc: ev.desc || "" });
}

function removeLifeEvent(data, personId, eventId) {
    const p = data.persons.find(x => x.id === personId);
    if (!p || !p.events) return;
    p.events = p.events.filter(e => e.id !== eventId);
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

function addMarriage(data, spouse1Id, spouse2Id, year) {
    const exists = data.marriages.some(m =>
        (m.spouse1 === spouse1Id && m.spouse2 === spouse2Id) ||
        (m.spouse1 === spouse2Id && m.spouse2 === spouse1Id)
    );
    if (!exists) {
        const rec = { spouse1: spouse1Id, spouse2: spouse2Id };
        if (year) rec.year = String(year).trim();
        data.marriages.push(rec);
    }
}

function updateMarriageYear(data, s1, s2, year) {
    const m = data.marriages.find(m =>
        (m.spouse1 === s1 && m.spouse2 === s2) ||
        (m.spouse1 === s2 && m.spouse2 === s1)
    );
    if (!m) return false;
    if (year) m.year = String(year).trim();
    else delete m.year;
    return true;
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

// ─── 关系路径查找（BFS，穿越亲子+婚姻边）────────────────────────────────────
// 返回从 fromId 到 toId 的最短路径数组：[{id, rel}, ...]
// rel 含义：'self'=起点, 'child'=target是from的子女, 'parent'=target是from的父母, 'spouse'=配偶
function findRelationshipPath(data, fromId, toId) {
    if (!fromId || !toId || !data) return null;
    if (fromId === toId) return [{ id: fromId, rel: "self" }];

    const edges = {};
    const adj   = {};
    data.persons.forEach(p => { adj[p.id] = []; });

    data.relationships.forEach(r => {
        if (!adj[r.parent] || !adj[r.child]) return;
        adj[r.parent].push(r.child);
        adj[r.child].push(r.parent);
        edges[`${r.parent}|${r.child}`] = "child";    // 沿此边到达子女
        edges[`${r.child}|${r.parent}`]  = "parent";  // 沿此边到达父母
    });
    data.marriages.forEach(m => {
        if (!adj[m.spouse1] || !adj[m.spouse2]) return;
        adj[m.spouse1].push(m.spouse2);
        adj[m.spouse2].push(m.spouse1);
        edges[`${m.spouse1}|${m.spouse2}`] = "spouse";
        edges[`${m.spouse2}|${m.spouse1}`] = "spouse";
    });

    // BFS
    const prev  = { [fromId]: null };
    const queue = [fromId];
    let found   = false;
    while (queue.length) {
        const cur = queue.shift();
        if (cur === toId) { found = true; break; }
        for (const nb of (adj[cur] || [])) {
            if (nb in prev) continue;
            prev[nb] = cur;
            queue.push(nb);
        }
    }
    if (!found) return null;

    // 回溯路径
    const path = [];
    let cur = toId;
    while (cur !== null) {
        const from = prev[cur];
        const rel  = from ? (edges[`${from}|${cur}`] || "related") : "self";
        path.unshift({ id: cur, rel });
        cur = from;
    }
    return path;
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

// ─── 人员合并 ─────────────────────────────────────────────────────────────────
// 将 mergeId 的所有数据、关系合并到 keepId，然后删除 mergeId
function mergePerson(data, keepId, mergeId) {
    if (keepId === mergeId) return false;
    const keep  = data.persons.find(p => p.id === keepId);
    const merge = data.persons.find(p => p.id === mergeId);
    if (!keep || !merge) return false;

    // Copy scalar fields from merge → keep where keep is empty
    if (!keep.gender && merge.gender) keep.gender = merge.gender;
    if (!keep.birth  && merge.birth)  keep.birth  = merge.birth;
    if (!keep.death  && merge.death)  keep.death  = merge.death;
    if (!keep.notes  && merge.notes)  keep.notes  = merge.notes;
    if (!keep.photo  && merge.photo)  keep.photo  = merge.photo;

    // Merge tags (union)
    keep.tags = [...new Set([...(keep.tags || []), ...(merge.tags || [])])];

    // Append events from merge (with fresh IDs)
    if (!keep.events) keep.events = [];
    (merge.events || []).forEach(ev => {
        keep.events.push({ ...ev, id: generateId() });
    });

    // Redirect parent/child relationships
    data.relationships.forEach(r => {
        if (r.parent === mergeId) r.parent = keepId;
        if (r.child  === mergeId) r.child  = keepId;
    });
    // Remove self-references and duplicate pairs
    data.relationships = data.relationships
        .filter(r => r.parent !== r.child)
        .filter((r, i, arr) =>
            arr.findIndex(x => x.parent === r.parent && x.child === r.child) === i
        );

    // Redirect marriages
    data.marriages.forEach(m => {
        if (m.spouse1 === mergeId) m.spouse1 = keepId;
        if (m.spouse2 === mergeId) m.spouse2 = keepId;
    });
    // Remove self-marriages and duplicate marriage records
    data.marriages = data.marriages
        .filter(m => m.spouse1 !== m.spouse2)
        .filter((m, i, arr) =>
            arr.findIndex(x =>
                (x.spouse1 === m.spouse1 && x.spouse2 === m.spouse2) ||
                (x.spouse1 === m.spouse2 && x.spouse2 === m.spouse1)
            ) === i
        );

    // Delete merged person
    data.persons = data.persons.filter(p => p.id !== mergeId);
    return true;
}

// ─── 独立 HTML 报告导出 ───────────────────────────────────────────────────────
function exportStandaloneHTML(data) {
    const escH = s => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Build generation level map (BFS from roots)
    const parentsOf2  = id => data.relationships.filter(r => r.child  === id).map(r => r.parent);
    const childrenOf2 = id => data.relationships.filter(r => r.parent === id).map(r => r.child);
    const roots2 = data.persons.filter(p => parentsOf2(p.id).length === 0).map(p => p.id);
    const levelMap2 = {};
    const visited2  = new Set();
    const queue2    = roots2.map(id => ({ id, level: 0 }));
    while (queue2.length) {
        const { id, level } = queue2.shift();
        if (visited2.has(id)) { if (level > (levelMap2[id] ?? 0)) levelMap2[id] = level; continue; }
        visited2.add(id);
        levelMap2[id] = level;
        childrenOf2(id).forEach(cid => queue2.push({ id: cid, level: level + 1 }));
    }
    data.persons.forEach(p => { if (levelMap2[p.id] === undefined) levelMap2[p.id] = 0; });

    const maxLevel  = data.persons.length ? Math.max(...Object.values(levelMap2), 0) : 0;
    const total     = data.persons.length;
    const males     = data.persons.filter(p => p.gender === "male").length;
    const females   = data.persons.filter(p => p.gender === "female").length;
    const marriages = data.marriages.length;

    // Group persons by generation
    const byGen = {};
    for (let i = 0; i <= maxLevel; i++) byGen[i] = [];
    data.persons.forEach(p => {
        const lv = levelMap2[p.id] ?? 0;
        (byGen[lv] = byGen[lv] || []).push(p);
    });

    // Build a single person card
    const buildCard = p => {
        const parents = data.relationships.filter(r => r.child === p.id)
            .map(r => data.persons.find(x => x.id === r.parent)?.name).filter(Boolean);
        const children = data.relationships.filter(r => r.parent === p.id)
            .map(r => data.persons.find(x => x.id === r.child)?.name).filter(Boolean);
        const spouses = data.marriages
            .filter(m => m.spouse1 === p.id || m.spouse2 === p.id)
            .map(m => {
                const sid = m.spouse1 === p.id ? m.spouse2 : m.spouse1;
                const sp = data.persons.find(x => x.id === sid);
                return sp ? (m.year ? `${sp.name}（${m.year}年）` : sp.name) : null;
            }).filter(Boolean);

        const gc     = p.gender === "male" ? "male" : p.gender === "female" ? "female" : "unknown";
        const gicon  = p.gender === "male" ? "♂" : p.gender === "female" ? "♀" : "○";
        const avatar = p.photo
            ? `<img class="c-photo" src="${escH(p.photo)}" alt="照片">`
            : `<div class="c-init ${gc}">${escH(p.name.charAt(0))}</div>`;
        const ls = p.birth ? (p.death ? `${escH(p.birth)} — ${escH(p.death)}` : `b. ${escH(p.birth)}`) : "";
        const tags = (p.tags || []).map(tg => `<span class="c-tag">${escH(tg)}</span>`).join("");
        const evHtml = (p.events || []).length
            ? `<ul class="c-evs">${[...(p.events||[])].sort((a,b)=>(parseInt(a.year)||0)-(parseInt(b.year)||0))
                .map(ev=>`<li><b>${escH(ev.year||"?")}年</b> ${escH(ev.desc)}</li>`).join("")}</ul>`
            : "";
        return `<div class="c-card ${gc}">
  <div class="c-av">${avatar}</div>
  <div class="c-body">
    <div class="c-name">${escH(p.name)} <span class="c-gicon">${gicon}</span></div>
    ${ls ? `<div class="c-ls">${ls}</div>` : ""}
    ${parents.length  ? `<div class="c-rel">父母: ${escH(parents.join("、"))}</div>` : ""}
    ${spouses.length  ? `<div class="c-rel">配偶: ${escH(spouses.join("、"))}</div>` : ""}
    ${children.length ? `<div class="c-rel">子女: ${escH(children.join("、"))}</div>` : ""}
    ${tags ? `<div class="c-tags">${tags}</div>` : ""}
    ${p.notes ? `<div class="c-notes">${escH(p.notes)}</div>` : ""}
    ${evHtml}
  </div>
</div>`;
    };

    const genSections = Object.entries(byGen)
        .sort(([a],[b]) => parseInt(a) - parseInt(b))
        .map(([lv, persons]) => {
            const num = parseInt(lv) + 1;
            const cards = [...persons]
                .sort((a,b) => a.name.localeCompare(b.name,"zh-CN"))
                .map(buildCard).join("\n");
            return `<section class="generation">
  <h2 class="gen-h">第 ${num} 代 <span class="gen-cnt">${persons.length} 人</span></h2>
  <div class="cards-grid">${cards}</div>
</section>`;
        }).join("\n");

    const now = new Date().toLocaleDateString("zh-CN");
    const css = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'PingFang SC','Microsoft YaHei','Hiragino Sans GB',Arial,sans-serif;background:#f0f4f8;color:#1e293b;min-width:320px}
.ph{background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);color:#fff;padding:40px 32px 28px;text-align:center}
.pt{font-size:2.2rem;font-weight:700;letter-spacing:.1em;margin-bottom:8px}
.ps{font-size:1rem;opacity:.8}
.sb{display:flex;justify-content:center;gap:32px;margin-top:20px;flex-wrap:wrap}
.si{text-align:center}.sn{font-size:1.6rem;font-weight:700}.sl{font-size:.8rem;opacity:.75;margin-top:2px}
.container{max-width:1200px;margin:0 auto;padding:24px 16px}
.generation{margin-bottom:40px}
.gen-h{font-size:1.25rem;font-weight:700;padding:10px 16px;background:linear-gradient(90deg,#2563eb11,transparent);border-left:4px solid #2563eb;margin-bottom:16px;border-radius:0 8px 8px 0}
.gen-cnt{font-size:.85rem;font-weight:400;color:#64748b;margin-left:8px}
.cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.c-card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.04);display:flex;gap:12px;padding:14px;border-top:3px solid #94a3b8}
.c-card.male{border-top-color:#3b82f6}.c-card.female{border-top-color:#ec4899}
.c-av{flex-shrink:0}
.c-photo{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0}
.c-init{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;border:2px solid #e2e8f0}
.c-init.male{background:#eff6ff;color:#3b82f6;border-color:#bfdbfe}
.c-init.female{background:#fdf2f8;color:#ec4899;border-color:#fbcfe8}
.c-init.unknown{background:#f1f5f9;color:#64748b;border-color:#e2e8f0}
.c-body{flex:1;min-width:0}
.c-name{font-size:1rem;font-weight:700;color:#0f172a}
.c-gicon{color:#94a3b8;font-size:.9rem;margin-left:4px}
.c-ls{font-size:.8rem;color:#64748b;margin-top:2px}
.c-rel{font-size:.82rem;color:#475569;margin-top:3px;line-height:1.4}
.c-tags{margin-top:4px;display:flex;flex-wrap:wrap;gap:4px}
.c-tag{font-size:.72rem;padding:1px 8px;border-radius:999px;background:#eff6ff;color:#3b82f6;border:1px solid #bfdbfe}
.c-notes{font-size:.8rem;color:#64748b;margin-top:4px;font-style:italic;white-space:pre-wrap}
.c-evs{margin-top:6px;padding-left:14px;font-size:.78rem;color:#64748b;line-height:1.6}
.pf{text-align:center;padding:32px;font-size:.82rem;color:#94a3b8;border-top:1px solid #e2e8f0;margin-top:16px}
@media(max-width:480px){.cards-grid{grid-template-columns:1fr}.ph{padding:24px 16px 16px}.pt{font-size:1.6rem}}
@media print{body{background:#fff}.c-card{break-inside:avoid;box-shadow:none;border:1px solid #e2e8f0}}`;

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>族谱报告</title>
<style>${css}</style>
</head>
<body>
<header class="ph">
  <div class="pt">家族族谱</div>
  <div class="ps">导出于 ${now}</div>
  <div class="sb">
    <div class="si"><div class="sn">${total}</div><div class="sl">成员 / ${maxLevel + 1} 代</div></div>
    <div class="si"><div class="sn">${males}</div><div class="sl">男性</div></div>
    <div class="si"><div class="sn">${females}</div><div class="sl">女性</div></div>
    <div class="si"><div class="sn">${marriages}</div><div class="sl">婚姻记录</div></div>
  </div>
</header>
<div class="container">
${genSections}
</div>
<footer class="pf">族谱 · 离线家族树 · 导出于 ${now}</footer>
</body>
</html>`;

    downloadBlob(new Blob([html], { type: "text/html" }), "family-report.html");
}

// ─── 数据健康检查 ─────────────────────────────────────────────────────────────
function dataHealthCheck(data) {
    const issues = [];
    const now = new Date().getFullYear();

    // 重名
    const nameCounts = {};
    data.persons.forEach(p => {
        if (!p.name) return;
        nameCounts[p.name] = nameCounts[p.name] || [];
        nameCounts[p.name].push(p.id);
    });
    Object.entries(nameCounts).forEach(([name, ids]) => {
        if (ids.length > 1)
            issues.push({ code: "duplicate-name", severity: "warning", ids, name });
    });

    // 死亡年 ≤ 出生年
    data.persons.forEach(p => {
        if (!p.birth || !p.death) return;
        const b = parseInt(p.birth), d = parseInt(p.death);
        if (!isNaN(b) && !isNaN(d) && d <= b)
            issues.push({ code: "death-before-birth", severity: "error", ids: [p.id], name: p.name });
    });

    // 出生年在未来
    data.persons.forEach(p => {
        if (!p.birth) return;
        const b = parseInt(p.birth);
        if (!isNaN(b) && b > now + 1)
            issues.push({ code: "future-birth", severity: "warning", ids: [p.id], name: p.name });
    });

    // 出生 >130 年前无死亡记录
    data.persons.forEach(p => {
        if (!p.birth || p.death) return;
        const b = parseInt(p.birth);
        if (!isNaN(b) && now - b > 130)
            issues.push({ code: "likely-deceased", severity: "info", ids: [p.id], name: p.name });
    });

    // 孤立成员（无任何关系）
    data.persons.forEach(p => {
        const connected =
            data.relationships.some(r => r.parent === p.id || r.child === p.id) ||
            data.marriages.some(m => m.spouse1 === p.id || m.spouse2 === p.id);
        if (!connected)
            issues.push({ code: "isolated", severity: "info", ids: [p.id], name: p.name });
    });

    // 父母出生年晚于子女
    data.relationships.forEach(r => {
        const parent = data.persons.find(p => p.id === r.parent);
        const child  = data.persons.find(p => p.id === r.child);
        if (!parent?.birth || !child?.birth) return;
        const pb = parseInt(parent.birth), cb = parseInt(child.birth);
        if (!isNaN(pb) && !isNaN(cb) && pb >= cb)
            issues.push({
                code: "parent-born-after-child", severity: "warning",
                ids: [parent.id, child.id], name: `${parent.name} → ${child.name}`
            });
    });

    return issues;
}
