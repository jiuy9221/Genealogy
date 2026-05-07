// modules/tree.js - 族谱树布局与 SVG 渲染

const NODE_W = 148;
const NODE_H = 68;
const H_GAP = 28;
const V_GAP = 100;
const SPOUSE_GAP = 12;

const EVENT_TYPE_COLORS = {
    birth:     "#3b82f6",
    death:     "#ef4444",
    marriage:  "#ec4899",
    migration: "#22c55e",
    education: "#eab308",
    career:    "#8b5cf6",
    other:     "#94a3b8"
};

// ─── 标签颜色（与 ui.js 同算法）──────────────────────────────────────────
function _tagColorTree(tag) {
    const P = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16","#f97316","#64748b"];
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xFFFFF;
    return P[h % P.length];
}

// ─── 代际连线颜色（每代一色，亮/暗通用）────────────────────────────────────
const GEN_EDGE_COLORS = [
    "#6366f1", // 第1代 indigo
    "#0284c7", // 第2代 sky
    "#059669", // 第3代 emerald
    "#d97706", // 第4代 amber
    "#dc2626", // 第5代 red
    "#7c3aed", // 第6代 violet
    "#0891b2"  // 第7代+ cyan
];
function _genLineColor(level) {
    return GEN_EDGE_COLORS[Math.min(typeof level === "number" ? level : 0, GEN_EDGE_COLORS.length - 1)];
}

// ─── 模块级状态 ──────────────────────────────────────────────────────────
const _nodeGroups    = {}; // personId -> <g>
const _customOffsets = {}; // personId -> { dx, dy } 拖拽偏移（模块生命周期持久）
let   _basePositions = {}; // 布局算法原始坐标（每次 render 刷新）
let   _dragState     = null;
let   _onDragEnd     = null;
let   _wasDragging   = false;
let   _dragHandlersInitialized = false;
let   _currentViewMode = "tree"; // "tree" | "timeline"
let   _currentData     = null;   // 当前渲染的数据集（用于 tooltip）
window._nodeDragActive = false;

// ─── 布局方向 ─────────────────────────────────────────────────────────────
let _layoutDir = "TB"; // "TB" (top→bottom) | "LR" (left→right)
const LR_X_STEP = NODE_W + V_GAP; // per-generation x step in LR mode (248px)

function _posToLR(rawPos, levelMap) {
    const result = {};
    const TB_Y_STEP = NODE_H + V_GAP;
    Object.entries(rawPos).forEach(([id, pos]) => {
        const level = levelMap[id] ?? Math.round(pos.y / TB_Y_STEP);
        result[id] = { x: level * LR_X_STEP, y: pos.x };
    });
    return result;
}

window.setTreeLayoutDir = function(dir) {
    if (dir !== "TB" && dir !== "LR") return;
    _layoutDir = dir;
    if (window._onCollapseChange) window._onCollapseChange();
};
window.getTreeLayoutDir = () => _layoutDir;

// ─── 子树折叠状态 ─────────────────────────────────────────────────────────
const _collapsedSet = new Set();

function _getDescendants(data, rootId) {
    const result = new Set();
    const queue  = [rootId];
    while (queue.length) {
        const cur = queue.shift();
        data.relationships.filter(r => r.parent === cur).forEach(r => {
            if (!result.has(r.child)) { result.add(r.child); queue.push(r.child); }
        });
    }
    return result;
}

window.toggleCollapseNode = function(id) {
    if (_collapsedSet.has(id)) _collapsedSet.delete(id);
    else _collapsedSet.add(id);
    if (window._onCollapseChange) window._onCollapseChange();
};

window.clearAllCollapsed = function() {
    if (_collapsedSet.size === 0) return;
    _collapsedSet.clear();
    if (window._onCollapseChange) window._onCollapseChange();
};

function _appendCollapseToggle(nodeGroup, personId, isCollapsed, data) {
    const cx = _layoutDir === "LR" ? NODE_W + 9 : NODE_W / 2;
    const cy = _layoutDir === "LR" ? NODE_H / 2 : NODE_H + 9;
    const dark = document.body.classList.contains("dark-mode");

    const tg = document.createElementNS("http://www.w3.org/2000/svg", "g");
    tg.setAttribute("class", "collapse-toggle");
    tg.style.cursor = "pointer";

    // Backdrop circle for contrast
    tg.appendChild(svgEl("circle", { cx, cy, r: "9",
        fill: dark ? "#0f172a" : "#fff", opacity: "0.7" }));

    const bgFill = isCollapsed ? "#f59e0b" : "#6366f1";
    tg.appendChild(svgEl("circle", { cx, cy, r: "7.5", fill: bgFill, opacity: "0.95" }));

    const arrow = svgEl("text", { x: cx, y: cy,
        "text-anchor": "middle", "dominant-baseline": "middle",
        "font-size": "9", "font-weight": "900", fill: "#fff",
        "pointer-events": "none" });
    arrow.textContent = isCollapsed ? "▶" : (_layoutDir === "LR" ? "◀" : "▼");
    tg.appendChild(arrow);

    if (isCollapsed) {
        const cnt = _getDescendants(data, personId).size;
        if (cnt > 0) {
            const label = `+${cnt}`;
            const lw = label.length * 6 + 10;
            const lx = cx + 11;
            tg.appendChild(svgEl("rect", {
                x: lx - 2, y: cy - 8, width: lw, height: 16, rx: "8",
                fill: "#f59e0b", opacity: "0.95" }));
            const lt = svgEl("text", {
                x: lx + lw / 2 - 2, y: cy,
                "text-anchor": "middle", "dominant-baseline": "middle",
                "font-size": "9", "font-weight": "700", fill: "#fff",
                "pointer-events": "none" });
            lt.textContent = label;
            tg.appendChild(lt);
        }
    }

    tg.addEventListener("click", e => {
        e.stopPropagation();
        if (window.toggleCollapseNode) window.toggleCollapseNode(personId);
    });
    nodeGroup.appendChild(tg);
}

// ─── 时间轴事件详情弹层 ───────────────────────────────────────────────────
let _eventPopupEl = null;

function _hideEventPopup() {
    if (_eventPopupEl) { _eventPopupEl.remove(); _eventPopupEl = null; }
}
window.hideEventPopup = _hideEventPopup;

function _showEventPopup(person, ev, clientX, clientY) {
    _hideEventPopup();
    const col = EVENT_TYPE_COLORS[ev.type] || "#94a3b8";
    const typeLabel = window.t ? t("event-type-" + ev.type) : ev.type;
    const popup = document.createElement("div");
    popup.className = "event-popup";
    popup.innerHTML = `
<div class="event-popup-header">
  <span class="event-popup-person">${person.name}</span>
  <button class="event-popup-close" title="${window.t ? t("event-popup-close") : "Close"}">&times;</button>
</div>
<div class="event-popup-body">
  <div class="event-popup-meta">
    <span class="event-type-tag ev-${ev.type}">${typeLabel}</span>
    <span class="event-popup-year">${ev.year || "?"}</span>
  </div>
  ${ev.desc ? `<div class="event-popup-desc">${ev.desc}</div>` : ""}
</div>`;

    document.body.appendChild(popup);
    _eventPopupEl = popup;

    popup.style.left = (clientX + 10) + "px";
    popup.style.top  = (clientY + 10) + "px";

    requestAnimationFrame(() => {
        const rect = popup.getBoundingClientRect();
        if (rect.right  > window.innerWidth  - 8) popup.style.left = Math.max(8, clientX - rect.width  - 8) + "px";
        if (rect.bottom > window.innerHeight - 8) popup.style.top  = Math.max(8, clientY - rect.height - 8) + "px";
    });

    popup.querySelector(".event-popup-close").addEventListener("click", e => {
        e.stopPropagation();
        _hideEventPopup();
    });
    setTimeout(() => document.addEventListener("click", _hideEventPopup, { once: true }), 10);
}

// ─── 节点悬停 Rich Tooltip ─────────────────────────────────────────────────
let _nodeTooltipEl    = null;
let _nodeTooltipTimer = null;

function _hideNodeTooltip() {
    if (_nodeTooltipTimer) { clearTimeout(_nodeTooltipTimer); _nodeTooltipTimer = null; }
    if (_nodeTooltipEl)   { _nodeTooltipEl.remove(); _nodeTooltipEl = null; }
}

function _positionTooltip(tipEl, clientX, clientY) {
    const TW = 190, TH = 120;
    let x = clientX + 14, y = clientY + 14;
    if (x + TW > window.innerWidth  - 8) x = clientX - TW - 8;
    if (y + TH > window.innerHeight - 8) y = clientY - TH - 8;
    tipEl.style.left = x + "px";
    tipEl.style.top  = y + "px";
}

function _showNodeTooltip(person, data, clientX, clientY) {
    _hideNodeTooltip();
    const parentCount = data.relationships.filter(r => r.child  === person.id).length;
    const childCount  = data.relationships.filter(r => r.parent === person.id).length;
    const spouseCount = data.marriages.filter(m => m.spouse1 === person.id || m.spouse2 === person.id).length;
    const eventCount  = (person.events || []).length;
    const tagCount    = (person.tags   || []).length;

    const gLabel  = person.gender === "male" ? (window.t ? t("gender-male") : "M")
                  : person.gender === "female" ? (window.t ? t("gender-female") : "F")
                  : (window.t ? t("gender-unknown") : "?");
    const b = person.birth ? person.birth.slice(0, 4) : null;
    const d = person.death ? person.death.slice(0, 4) : null;
    const lifespan = b && d ? `${b}–${d}` : b ? `b.${b}` : "";

    const tip = document.createElement("div");
    tip.className = "node-tooltip";
    tip.innerHTML = `
<div class="nt-name">${person.name}</div>
<div class="nt-meta">
  <span class="nt-gender ${person.gender || "unknown"}">${gLabel}</span>
  ${lifespan ? `<span class="nt-life">${lifespan}</span>` : ""}
</div>
<div class="nt-counts">
  <span title="${window.t ? t("editor-section-parents") : "Parents"}">&#128106; ${parentCount}</span>
  <span title="${window.t ? t("editor-section-children") : "Children"}">&#128118; ${childCount}</span>
  <span title="${window.t ? t("editor-section-spouses") : "Spouses"}">&#10084; ${spouseCount}</span>
  ${eventCount > 0 ? `<span title="${window.t ? t("editor-section-events") : "Events"}">&#128197; ${eventCount}</span>` : ""}
  ${tagCount   > 0 ? `<span title="${window.t ? t("editor-section-tags") : "Tags"}">&#127991; ${tagCount}</span>`  : ""}
</div>
${(person.tags || []).length ? `<div class="nt-tags">${person.tags.slice(0, 4).join(" · ")}</div>` : ""}
`;
    document.body.appendChild(tip);
    _nodeTooltipEl = tip;
    _positionTooltip(tip, clientX, clientY);
    requestAnimationFrame(() => tip.classList.add("nt-show"));
}

// ─── 右键快捷菜单 ─────────────────────────────────────────────────────────
let _ctxMenuEl = null;

function _hideContextMenu() {
    if (_ctxMenuEl) { _ctxMenuEl.remove(); _ctxMenuEl = null; }
}
window.hideContextMenu = _hideContextMenu;

function _showContextMenu(personId, clientX, clientY) {
    _hideContextMenu();

    const isFocused = window.isFocusActive && window.isFocusActive(personId);
    const hasChildren = _currentData && _currentData.relationships.some(r => r.parent === personId);
    const isCollapsed = _collapsedSet.has(personId);
    const collapseItem = hasChildren
        ? `<div class="ctx-divider"></div>
<button class="ctx-item" data-action="collapse">${isCollapsed ? "▶" : "▼"} <span>${isCollapsed ? t("ctx-expand") : t("ctx-collapse")}</span></button>`
        : "";

    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    menu.innerHTML = `
<button class="ctx-item" data-action="edit">✏️ <span>${t("ctx-edit")}</span></button>
<button class="ctx-item danger" data-action="delete">🗑️ <span>${t("ctx-delete")}</span></button>
<div class="ctx-divider"></div>
<button class="ctx-item" data-action="focus">${isFocused ? "✖" : "🎯"} <span>${isFocused ? t("ctx-exit-focus") : t("ctx-focus")}</span></button>
<button class="ctx-item" data-action="center">📍 <span>${t("ctx-center")}</span></button>
${collapseItem}`;

    menu.style.left = clientX + "px";
    menu.style.top  = clientY + "px";
    document.body.appendChild(menu);
    _ctxMenuEl = menu;

    // Keep menu within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right  > window.innerWidth)  menu.style.left = (clientX - rect.width)  + "px";
    if (rect.bottom > window.innerHeight) menu.style.top  = (clientY - rect.height) + "px";

    menu.addEventListener("click", e => {
        const btn = e.target.closest(".ctx-item");
        if (!btn) return;
        _hideContextMenu();
        if (btn.dataset.action === "collapse") {
            if (window.toggleCollapseNode) window.toggleCollapseNode(personId);
        } else if (window._onContextMenuAction) {
            window._onContextMenuAction(btn.dataset.action, personId);
        }
    });

    // Close on any outside click or right-click
    setTimeout(() => {
        document.addEventListener("click",       _hideContextMenu, { once: true });
        document.addEventListener("contextmenu", _hideContextMenu, { once: true });
    }, 10);
}

// ─── 拖拽偏移 API（供 app.js 调用）──────────────────────────────────────
function clearCustomOffsets() { Object.keys(_customOffsets).forEach(k => delete _customOffsets[k]); }
function getCustomOffsets()   { return JSON.parse(JSON.stringify(_customOffsets)); }
function setCustomOffsets(obj){ clearCustomOffsets(); Object.assign(_customOffsets, obj || {}); }
function setDragEndCallback(fn){ _onDragEnd = fn; }

// ─── 节点颜色（亮/暗主题自适应）──────────────────────────────────────────
function getNodeColors(gender) {
    const dark = document.body.classList.contains('dark-mode');
    if (gender === 'male') return {
        fill:       dark ? '#1a3a5c' : '#eff6ff',
        stroke:     dark ? '#3b82f6' : '#93c5fd',
        avatarFill: dark ? '#1e3a8a' : '#dbeafe',
        avatarText: dark ? '#93c5fd' : '#1d4ed8',
        barColor:   '#3b82f6',
        nameColor:  dark ? '#bfdbfe' : '#1e293b',
        lifeColor:  dark ? '#7dd3fc' : '#64748b'
    };
    if (gender === 'female') return {
        fill:       dark ? '#4a1942' : '#fdf2f8',
        stroke:     dark ? '#f472b6' : '#f9a8d4',
        avatarFill: dark ? '#831843' : '#fce7f3',
        avatarText: dark ? '#f9a8d4' : '#db2777',
        barColor:   '#ec4899',
        nameColor:  dark ? '#fbcfe8' : '#1e293b',
        lifeColor:  dark ? '#f9a8d4' : '#64748b'
    };
    return {
        fill:       dark ? '#1e293b' : '#f8fafc',
        stroke:     dark ? '#475569' : '#cbd5e1',
        avatarFill: dark ? '#334155' : '#f1f5f9',
        avatarText: dark ? '#94a3b8' : '#64748b',
        barColor:   dark ? '#64748b' : '#94a3b8',
        nameColor:  dark ? '#e2e8f0' : '#1e293b',
        lifeColor:  dark ? '#94a3b8' : '#64748b'
    };
}
function _lineColor()  { return document.body.classList.contains('dark-mode') ? '#475569' : '#94a3b8'; }
function _bandFill()   { return document.body.classList.contains('dark-mode') ? 'rgba(30,41,59,0.55)' : 'rgba(241,245,249,0.6)'; }

// ─── SVG 辅助 ────────────────────────────────────────────────────────────
function svgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
}
function drawLine(parent, x1, y1, x2, y2, color) {
    parent.appendChild(svgEl("line", { x1, y1, x2, y2, stroke: color || _lineColor(), "stroke-width": "1.8" }));
}
function drawPath(parent, d, color, dash = "") {
    const attrs = { d, fill: "none", stroke: color || _lineColor(), "stroke-width": "1.8" };
    if (dash) attrs["stroke-dasharray"] = dash;
    parent.appendChild(svgEl("path", attrs));
}

// ─── 布局算法 ─────────────────────────────────────────────────────────────
function buildTreeLayout(data) {
    const { persons, relationships, marriages } = data;
    const childrenOf = id => relationships.filter(r => r.parent === id).map(r => r.child);
    const parentsOf  = id => relationships.filter(r => r.child  === id).map(r => r.parent);
    const spousesOf  = id => {
        const res = [];
        marriages.forEach(m => {
            if (m.spouse1 === id) res.push(m.spouse2);
            if (m.spouse2 === id) res.push(m.spouse1);
        });
        return res;
    };

    // BFS 代际分层
    const roots = persons.filter(p => parentsOf(p.id).length === 0).map(p => p.id);
    const levelMap = {};
    const queue = roots.map(id => ({ id, level: 0 }));
    const visited = new Set();
    while (queue.length > 0) {
        const { id, level } = queue.shift();
        if (visited.has(id)) { if (level > (levelMap[id] ?? 0)) levelMap[id] = level; continue; }
        visited.add(id);
        levelMap[id] = Math.max(levelMap[id] ?? 0, level);
        childrenOf(id).forEach(cid => queue.push({ id: cid, level: level + 1 }));
    }
    persons.forEach(p => { if (levelMap[p.id] === undefined) levelMap[p.id] = 0; });

    // 配偶聚合
    const assignedToCluster = new Set();
    const clusters = [];
    persons.forEach(p => {
        if (assignedToCluster.has(p.id)) return;
        const level = levelMap[p.id];
        const spouses = spousesOf(p.id).filter(s => !assignedToCluster.has(s) && levelMap[s] === level);
        const ids = [p.id, ...spouses];
        ids.forEach(id => { assignedToCluster.add(id); levelMap[id] = level; });
        clusters.push({ level, ids });
    });

    // 按代分组
    const levelClusters = {};
    clusters.forEach(c => {
        if (!levelClusters[c.level]) levelClusters[c.level] = [];
        levelClusters[c.level].push(c);
    });

    // 初始等间距布局
    const nodePositions = {};
    const levels = Object.keys(levelClusters).map(Number).sort((a, b) => a - b);
    levels.forEach(level => {
        const list = levelClusters[level];
        const clusterWidths = list.map(c => c.ids.length * NODE_W + (c.ids.length - 1) * SPOUSE_GAP);
        const totalW = clusterWidths.reduce((s, w) => s + w, 0) + (list.length - 1) * H_GAP;
        let curX = -totalW / 2;
        const y = level * (NODE_H + V_GAP);
        list.forEach((cluster, ci) => {
            cluster.ids.forEach((id, i) => {
                nodePositions[id] = { x: curX + i * (NODE_W + SPOUSE_GAP), y };
            });
            curX += clusterWidths[ci] + H_GAP;
        });
    });

    // 子代对齐父母中点（迭代 3 次）
    for (let iter = 0; iter < 3; iter++) {
        levels.slice(1).forEach(level => {
            const list = levelClusters[level];
            list.sort((a, b) => {
                const cx = c => {
                    const pxs = [];
                    c.ids.forEach(id => parentsOf(id).forEach(pid => {
                        if (nodePositions[pid]) pxs.push(nodePositions[pid].x + NODE_W / 2);
                    }));
                    return pxs.length ? pxs.reduce((s, x) => s + x, 0) / pxs.length : 0;
                };
                return cx(a) - cx(b);
            });
            list.forEach(cluster => {
                const pxs = [];
                cluster.ids.forEach(id => parentsOf(id).forEach(pid => {
                    if (nodePositions[pid]) pxs.push(nodePositions[pid].x + NODE_W / 2);
                }));
                if (!pxs.length) return;
                const targetCX = pxs.reduce((s, x) => s + x, 0) / pxs.length;
                const clusterW = cluster.ids.length * NODE_W + (cluster.ids.length - 1) * SPOUSE_GAP;
                const shift = (targetCX - clusterW / 2 - nodePositions[cluster.ids[0]].x) * 0.5;
                cluster.ids.forEach(id => { nodePositions[id].x += shift; });
            });
            list.sort((a, b) => nodePositions[a.ids[0]].x - nodePositions[b.ids[0]].x);
            for (let i = 1; i < list.length; i++) {
                const prev = list[i - 1];
                const curr = list[i];
                const prevEnd  = nodePositions[prev.ids[prev.ids.length - 1]].x + NODE_W;
                const currStart = nodePositions[curr.ids[0]].x;
                if (currStart < prevEnd + H_GAP) {
                    const push = prevEnd + H_GAP - currStart;
                    curr.ids.forEach(id => { nodePositions[id].x += push; });
                }
            }
        });
    }
    return { nodePositions, levelMap, clusters, childrenOf, parentsOf, spousesOf };
}

// ─── 连线渲染（渔骨式）────────────────────────────────────────────────────
function renderConnections(data, gLines, nodePositions, parentsOf, levelMap = {}) {
    const { relationships, marriages } = data;
    const drawnMarriage = new Set();

    const childrenOfPair = (id1, id2) =>
        data.persons.filter(p => {
            const pars = parentsOf(p.id);
            return pars.includes(id1) && pars.includes(id2);
        });

    marriages.forEach(m => {
        const p1 = nodePositions[m.spouse1], p2 = nodePositions[m.spouse2];
        if (!p1 || !p2) return;
        const key = [m.spouse1, m.spouse2].sort().join("|");
        if (drawnMarriage.has(key)) return;
        drawnMarriage.add(key);
        if (childrenOfPair(m.spouse1, m.spouse2).length === 0) {
            const x1 = Math.min(p1.x + NODE_W, p2.x + NODE_W);
            const x2 = Math.max(p1.x, p2.x);
            const y  = ((p1.y + p2.y) / 2) + NODE_H / 2;
            drawPath(gLines, `M${x1},${y} H${x2}`, "#c084fc", "6,4");
        }
    });

    const childParents = {};
    relationships.forEach(r => {
        if (!childParents[r.child]) childParents[r.child] = [];
        childParents[r.child].push(r.parent);
    });

    const pairKey  = (a, b) => [a, b].sort().join("|");
    const pairMap  = new Map();
    const singles  = [];
    Object.entries(childParents).forEach(([childId, pIds]) => {
        const valid = pIds.filter(pid => nodePositions[pid]);
        if (valid.length >= 2) {
            const key = pairKey(valid[0], valid[1]);
            if (!pairMap.has(key)) pairMap.set(key, { p1: valid[0], p2: valid[1], children: [] });
            if (!pairMap.get(key).children.includes(childId)) pairMap.get(key).children.push(childId);
        } else if (valid.length === 1) {
            singles.push({ parentId: valid[0], childId });
        }
    });

    pairMap.forEach(({ p1, p2, children }) => {
        const pp1 = nodePositions[p1], pp2 = nodePositions[p2];
        if (!pp1 || !pp2) return;
        const genCol = _genLineColor(levelMap[p1] ?? 0);
        const bx1 = pp1.x + NODE_W / 2, bx2 = pp2.x + NODE_W / 2;
        const by  = Math.max(pp1.y, pp2.y) + NODE_H;
        const couplingY = by + V_GAP * 0.28;
        const jX  = (bx1 + bx2) / 2;
        drawLine(gLines, bx1, by, bx1, couplingY, genCol);
        drawLine(gLines, bx2, by, bx2, couplingY, genCol);
        drawLine(gLines, Math.min(bx1, bx2), couplingY, Math.max(bx1, bx2), couplingY, genCol);
        const validC = children.filter(cid => nodePositions[cid]);
        if (!validC.length) return;
        const childTopY = Math.min(...validC.map(cid => nodePositions[cid].y));
        const childBarY = childTopY - V_GAP * 0.28;
        const childXs   = validC.map(cid => nodePositions[cid].x + NODE_W / 2);
        drawLine(gLines, jX, couplingY, jX, childBarY, genCol);
        if (childXs.length > 1) drawLine(gLines, Math.min(...childXs), childBarY, Math.max(...childXs), childBarY, genCol);
        childXs.forEach(cx => drawLine(gLines, cx, childBarY, cx, childTopY, genCol));
    });

    singles.forEach(({ parentId, childId }) => {
        const pp = nodePositions[parentId], cp = nodePositions[childId];
        if (!pp || !cp) return;
        const genCol = _genLineColor(levelMap[parentId] ?? 0);
        const px = pp.x + NODE_W / 2, py = pp.y + NODE_H;
        const cx = cp.x + NODE_W / 2, cy = cp.y;
        const midY = py + (cy - py) * 0.5;
        drawPath(gLines, `M${px},${py} V${midY} H${cx} V${cy}`, genCol);
    });
}

// ─── 连线渲染（横向 LR 模式）────────────────────────────────────────────
function _renderConnectionsLR(data, gLines, nodePositions, parentsOf, levelMap = {}) {
    const childrenOfPair = (id1, id2) =>
        data.persons.filter(p => {
            const pars = parentsOf(p.id);
            return pars.includes(id1) && pars.includes(id2);
        });

    // Spouse-only connections → dashed vertical line (spouses are stacked vertically in LR)
    data.marriages.forEach(m => {
        const p1 = nodePositions[m.spouse1], p2 = nodePositions[m.spouse2];
        if (!p1 || !p2) return;
        if (childrenOfPair(m.spouse1, m.spouse2).length === 0) {
            const x = ((p1.x + p2.x) / 2) + NODE_W;
            const y1 = Math.min(p1.y, p2.y) + NODE_H;
            const y2 = Math.max(p1.y, p2.y);
            if (y2 > y1) drawPath(gLines, `M${x},${y1} V${y2}`, "#c084fc", "6,4");
        }
    });

    const childParents = {};
    data.relationships.forEach(r => {
        if (!childParents[r.child]) childParents[r.child] = [];
        childParents[r.child].push(r.parent);
    });

    const pairKey = (a, b) => [a, b].sort().join("|");
    const pairMap = new Map();
    const singles = [];
    Object.entries(childParents).forEach(([childId, pIds]) => {
        const valid = pIds.filter(pid => nodePositions[pid]);
        if (valid.length >= 2) {
            const key = pairKey(valid[0], valid[1]);
            if (!pairMap.has(key)) pairMap.set(key, { p1: valid[0], p2: valid[1], children: [] });
            if (!pairMap.get(key).children.includes(childId)) pairMap.get(key).children.push(childId);
        } else if (valid.length === 1) {
            singles.push({ parentId: valid[0], childId });
        }
    });

    pairMap.forEach(({ p1, p2, children }) => {
        const pp1 = nodePositions[p1], pp2 = nodePositions[p2];
        if (!pp1 || !pp2) return;
        const genCol = _genLineColor(levelMap[p1] ?? 0);
        const rx = pp1.x + NODE_W;
        const cy1 = pp1.y + NODE_H / 2;
        const cy2 = pp2.y + NODE_H / 2;
        const couplingX = rx + H_GAP * 0.6;
        const midY = (cy1 + cy2) / 2;
        drawLine(gLines, rx, cy1, couplingX, cy1, genCol);
        drawLine(gLines, rx, cy2, couplingX, cy2, genCol);
        drawLine(gLines, couplingX, Math.min(cy1, cy2), couplingX, Math.max(cy1, cy2), genCol);
        const validC = children.filter(cid => nodePositions[cid]);
        if (!validC.length) return;
        const childLeftX = Math.min(...validC.map(cid => nodePositions[cid].x));
        const childBarX = childLeftX - H_GAP * 0.45;
        const childCenterYs = validC.map(cid => nodePositions[cid].y + NODE_H / 2);
        drawLine(gLines, couplingX, midY, childBarX, midY, genCol);
        if (childCenterYs.length > 1)
            drawLine(gLines, childBarX, Math.min(...childCenterYs), childBarX, Math.max(...childCenterYs), genCol);
        childCenterYs.forEach(cy => drawLine(gLines, childBarX, cy, childLeftX, cy, genCol));
    });

    singles.forEach(({ parentId, childId }) => {
        const pp = nodePositions[parentId], cp = nodePositions[childId];
        if (!pp || !cp) return;
        const genCol = _genLineColor(levelMap[parentId] ?? 0);
        const px = pp.x + NODE_W, py = pp.y + NODE_H / 2;
        const cx = cp.x, cy = cp.y + NODE_H / 2;
        const midX = px + (cx - px) * 0.5;
        drawPath(gLines, `M${px},${py} H${midX} V${cy} H${cx}`, genCol);
    });
}

// ─── 全局拖拽事件（只注册一次）──────────────────────────────────────────
function initDragHandlers() {
    if (_dragHandlersInitialized) return;
    _dragHandlersInitialized = true;

    window.addEventListener("mousemove", e => {
        if (!_dragState) return;
        const ddx = e.clientX - _dragState.startX;
        const ddy = e.clientY - _dragState.startY;
        if (Math.abs(ddx) > 3 || Math.abs(ddy) > 3) _wasDragging = true;
        const scale = (window.getSvgScale && window.getSvgScale()) || 1;
        const dx = ddx / scale;
        const dy = ddy / scale;
        _customOffsets[_dragState.id] = { dx: _dragState.origDx + dx, dy: _dragState.origDy + dy };
        const base = _basePositions[_dragState.id];
        const g    = _nodeGroups[_dragState.id];
        if (base && g) {
            const off = _customOffsets[_dragState.id];
            g.setAttribute("transform", `translate(${base.x + off.dx},${base.y + off.dy})`);
        }
    });

    window.addEventListener("mouseup", () => {
        if (!_dragState) return;
        window._nodeDragActive = false;
        _dragState = null;
        if (_onDragEnd) _onDragEnd();
        setTimeout(() => { _wasDragging = false; }, 50);
    });
}

// ─── 节点元素构建（tree / timeline 共用）────────────────────────────────────
function _renderNodeGroup(p, pos, onNodeClick, enableDrag) {
    const c = getNodeColors(p.gender);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(${pos.x},${pos.y})`);
    g.style.cursor = enableDrag ? "grab" : "pointer";
    _nodeGroups[p.id] = g;

    g.addEventListener("click", () => { if (!_wasDragging) onNodeClick && onNodeClick(p.id); });

    // Rich hover tooltip
    g.addEventListener("mouseenter", e => {
        if (window._nodeDragActive) return;
        _nodeTooltipTimer = setTimeout(() => {
            if (_currentData) _showNodeTooltip(p, _currentData, e.clientX, e.clientY);
        }, 350);
    });
    g.addEventListener("mousemove", e => {
        if (_nodeTooltipEl) _positionTooltip(_nodeTooltipEl, e.clientX, e.clientY);
    });
    g.addEventListener("mouseleave", _hideNodeTooltip);

    // Right-click context menu (both tree and timeline modes)
    g.addEventListener("contextmenu", e => {
        e.preventDefault();
        e.stopPropagation();
        _showContextMenu(p.id, e.clientX, e.clientY);
    });

    // Mobile long-press (600ms) shows context menu
    let _lpTimer = null;
    g.addEventListener("touchstart", e => {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        _lpTimer = setTimeout(() => {
            _lpTimer = null;
            _showContextMenu(p.id, touch.clientX, touch.clientY);
        }, 600);
    }, { passive: true });
    const _cancelLp = () => { if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; } };
    g.addEventListener("touchend",    _cancelLp, { passive: true });
    g.addEventListener("touchmove",   _cancelLp, { passive: true });
    g.addEventListener("touchcancel", _cancelLp, { passive: true });

    if (enableDrag) {
        g.addEventListener("mousedown", e => {
            if (e.button !== 0) return;
            e.stopPropagation();
            _wasDragging = false;
            const off = _customOffsets[p.id] || { dx: 0, dy: 0 };
            _dragState = { id: p.id, startX: e.clientX, startY: e.clientY, origDx: off.dx, origDy: off.dy };
            window._nodeDragActive = true;
            e.preventDefault();
        });
    }

    g.appendChild(svgEl("rect", { width: NODE_W, height: NODE_H, rx: "10", ry: "10",
        fill: c.fill, stroke: c.stroke, "stroke-width": "1.8" }));
    g.appendChild(svgEl("rect", { width: NODE_W, height: "5", rx: "10", ry: "10", fill: c.barColor }));

    if (p.photo) {
        g.appendChild(svgEl("circle", { cx: "22", cy: "36", r: "15",
            fill: "none", stroke: c.stroke, "stroke-width": "1.5" }));
        const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
        img.setAttribute("href", p.photo);
        img.setAttribute("x", "7"); img.setAttribute("y", "21");
        img.setAttribute("width", "30"); img.setAttribute("height", "30");
        img.setAttribute("clip-path", `url(#avatar-clip-${p.id})`);
        img.setAttribute("preserveAspectRatio", "xMidYMid slice");
        g.appendChild(img);
    } else {
        g.appendChild(svgEl("circle", { cx: "22", cy: "36", r: "15",
            fill: c.avatarFill, stroke: c.stroke, "stroke-width": "1.5" }));
        const at = svgEl("text", { x: "22", y: "36", "text-anchor": "middle",
            "dominant-baseline": "middle", "font-size": "14", "font-weight": "800", fill: c.avatarText });
        at.textContent = p.name.charAt(0);
        g.appendChild(at);
    }

    const nameT = svgEl("text", { x: "44", y: "28", "text-anchor": "start",
        "dominant-baseline": "middle", "font-size": "14", "font-weight": "700", fill: c.nameColor });
    nameT.textContent = p.name.length > 6 ? p.name.slice(0, 6) + "…" : p.name;
    g.appendChild(nameT);

    const b = p.birth ? p.birth.slice(0, 4) : "?";
    const lifespan = p.death ? `${b}–${p.death.slice(0, 4)}` : p.birth ? `b.${b}` : "";
    if (lifespan) {
        const lt = svgEl("text", { x: "44", y: "50", "text-anchor": "start",
            "dominant-baseline": "middle", "font-size": "10", fill: c.lifeColor });
        lt.textContent = lifespan;
        g.appendChild(lt);
    }

    // Event count badge (amber circle in top-right corner)
    if (p.events && p.events.length > 0) {
        const cnt = p.events.length;
        const badgeG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        badgeG.setAttribute("pointer-events", "none");
        const dark = document.body.classList.contains("dark-mode");
        badgeG.appendChild(svgEl("circle", {
            cx: NODE_W - 8, cy: 8, r: "8",
            fill: dark ? "#d97706" : "#f59e0b",
            stroke: dark ? "#1e293b" : "#fff", "stroke-width": "1.5"
        }));
        const bt = svgEl("text", {
            x: NODE_W - 8, y: 8,
            "text-anchor": "middle", "dominant-baseline": "middle",
            "font-size": "8", "font-weight": "800", fill: "#fff",
            "pointer-events": "none"
        });
        bt.textContent = cnt > 9 ? "9+" : String(cnt);
        badgeG.appendChild(bt);
        g.appendChild(badgeG);
    }

    // Tag color dots at bottom of node (max 5)
    if (p.tags && p.tags.length > 0) {
        const tagG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        tagG.setAttribute("pointer-events", "none");
        const dots = p.tags.slice(0, 5);
        const dotR = 3.5;
        const dotGap = 3;
        const totalDotW = dots.length * (dotR * 2) + (dots.length - 1) * dotGap;
        const startX = (NODE_W - totalDotW) / 2;
        dots.forEach((tag, i) => {
            const cx = startX + i * (dotR * 2 + dotGap) + dotR;
            const cy = NODE_H - 6;
            const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
            titleEl.textContent = tag;
            const dot = svgEl("circle", { cx, cy, r: dotR, fill: _tagColorTree(tag), opacity: "0.9" });
            dot.appendChild(titleEl);
            tagG.appendChild(dot);
        });
        g.appendChild(tagG);
    }

    return g;
}

// ─── 主渲染 ──────────────────────────────────────────────────────────────
function renderTree(data, svgEl_el, onNodeClick) {
    _currentViewMode = "tree";
    _currentData = data;
    _hideEventPopup();
    _hideNodeTooltip();
    initDragHandlers();
    svgEl_el.innerHTML = "";
    Object.keys(_nodeGroups).forEach(k => delete _nodeGroups[k]);

    if (!data.persons.length) {
        const txt = svgEl("text", { x: "50%", y: "50%", "text-anchor": "middle",
            fill: "#94a3b8", "font-size": "15" });
        txt.textContent = "暂无人员，请点击「+ 新增人员」开始";
        svgEl_el.appendChild(txt);
        return;
    }

    // ─── 计算折叠隐藏节点 ──────────────────────────────────────────────────
    const activeCollapsed = new Set([..._collapsedSet].filter(id =>
        data.persons.some(p => p.id === id) &&
        data.relationships.some(r => r.parent === id)
    ));
    const hiddenIds = new Set();
    activeCollapsed.forEach(id => _getDescendants(data, id).forEach(did => hiddenIds.add(did)));
    const visData = hiddenIds.size === 0 ? data : {
        persons:       data.persons.filter(p => !hiddenIds.has(p.id)),
        relationships: data.relationships.filter(r => !hiddenIds.has(r.parent) && !hiddenIds.has(r.child)),
        marriages:     data.marriages.filter(m => !hiddenIds.has(m.spouse1) && !hiddenIds.has(m.spouse2))
    };

    const { nodePositions: rawPos, levelMap, parentsOf, spousesOf } = buildTreeLayout(visData);

    // 存原始位置（LR 模式需要先做坐标变换再存），应用拖拽偏移
    const finalRaw = _layoutDir === "LR" ? _posToLR(rawPos, levelMap) : rawPos;
    _basePositions = JSON.parse(JSON.stringify(finalRaw));
    const nodePositions = JSON.parse(JSON.stringify(finalRaw));
    Object.entries(_customOffsets).forEach(([id, off]) => {
        if (nodePositions[id]) { nodePositions[id].x += off.dx; nodePositions[id].y += off.dy; }
    });

    // SVG 尺寸
    const xs = Object.values(nodePositions).map(p => p.x);
    const ys = Object.values(nodePositions).map(p => p.y);
    const pad = 60;
    const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + NODE_W + pad, maxY = Math.max(...ys) + NODE_H + pad;
    svgEl_el.setAttribute("viewBox", `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
    svgEl_el.setAttribute("width",  maxX - minX);
    svgEl_el.setAttribute("height", maxY - minY);

    // defs: glow filter + avatar clipPaths
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `<filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`;
    data.persons.forEach(p => {
        if (!p.photo) return;
        const cp = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
        cp.setAttribute("id", `avatar-clip-${p.id}`);
        const circ = svgEl("circle", { cx: "22", cy: "36", r: "15" });
        cp.appendChild(circ);
        defs.appendChild(cp);
    });
    svgEl_el.appendChild(defs);

    // 代际背景带 + 代际标签
    const maxLevel = Math.max(...Object.values(levelMap));
    const dark = document.body.classList.contains('dark-mode');
    const gBands = document.createElementNS("http://www.w3.org/2000/svg", "g");
    for (let lv = 0; lv <= maxLevel; lv++) {
        if (_layoutDir === "LR") {
            // 纵向条带（LR 模式：每代一个垂直条带）
            if (lv % 2 !== 0) {
                gBands.appendChild(svgEl("rect", {
                    x: lv * LR_X_STEP - 14, y: minY,
                    width: NODE_W + 28, height: maxY - minY,
                    fill: _bandFill(), rx: "0"
                }));
            }
            // 顶部代际标签
            const colX = lv * LR_X_STEP + NODE_W / 2;
            const lbl = svgEl("text", {
                x: colX, y: minY + 6,
                "text-anchor": "middle", "dominant-baseline": "hanging",
                "font-size": "11", "font-weight": "700",
                fill: _genLineColor(lv), opacity: dark ? "0.7" : "0.65",
                "pointer-events": "none"
            });
            lbl.textContent = `第${lv + 1}代`;
            gBands.appendChild(lbl);
        } else {
            // 横向条带（TB 模式）
            if (lv % 2 !== 0) {
                gBands.appendChild(svgEl("rect", {
                    x: minX, y: lv * (NODE_H + V_GAP) - 14,
                    width: maxX - minX, height: NODE_H + 28,
                    fill: _bandFill(), rx: "0"
                }));
            }
            // 左侧代际标签
            const rowY = lv * (NODE_H + V_GAP) + NODE_H / 2;
            const lbl = svgEl("text", {
                x: minX + 6, y: rowY,
                "text-anchor": "start", "dominant-baseline": "middle",
                "font-size": "11", "font-weight": "700",
                fill: _genLineColor(lv), opacity: dark ? "0.7" : "0.65",
                "pointer-events": "none"
            });
            lbl.textContent = `第${lv + 1}代`;
            gBands.appendChild(lbl);
        }
    }
    svgEl_el.appendChild(gBands);

    const gLines = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const gNodes = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svgEl_el.appendChild(gLines);
    svgEl_el.appendChild(gNodes);

    if (_layoutDir === "LR") {
        _renderConnectionsLR(visData, gLines, nodePositions, parentsOf, levelMap);
    } else {
        renderConnections(visData, gLines, nodePositions, parentsOf, levelMap);
    }

    // 节点
    visData.persons.forEach(p => {
        const pos = nodePositions[p.id];
        if (!pos) return;
        gNodes.appendChild(_renderNodeGroup(p, pos, onNodeClick, true));
    });

    // 折叠切换按钮（有子代的可见节点底部显示 ▼/▶）
    data.persons.forEach(p => {
        if (!nodePositions[p.id]) return;
        if (!data.relationships.some(r => r.parent === p.id)) return;
        const g = _nodeGroups[p.id];
        if (!g) return;
        _appendCollapseToggle(g, p.id, activeCollapsed.has(p.id), data);
    });

    // 代际颜色图例（右上角，仅当代数 ≥ 2 时显示）
    if (maxLevel >= 1) {
        const legG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        legG.setAttribute("pointer-events", "none");
        const legPadX = 10, legPadY = 10;
        const legLineW = 18, legGap = 15;
        const legCount = maxLevel + 1;
        const legW = legLineW + 4 + 36;
        const legH = legCount * legGap + 4;
        const legX = maxX - legPadX - legW;
        const legY = minY + legPadY;
        // 半透明背景框
        const legBg = svgEl("rect", {
            x: legX - 4, y: legY - 4, width: legW + 8, height: legH + 4,
            rx: "5", fill: dark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.82)",
            stroke: dark ? "#334155" : "#e2e8f0", "stroke-width": "1"
        });
        legG.appendChild(legBg);
        for (let lv = 0; lv <= maxLevel; lv++) {
            const col = _genLineColor(lv);
            const ly = legY + lv * legGap + legGap / 2;
            legG.appendChild(svgEl("line", {
                x1: legX, y1: ly, x2: legX + legLineW, y2: ly,
                stroke: col, "stroke-width": "2.5"
            }));
            const lt = svgEl("text", {
                x: legX + legLineW + 4, y: ly,
                "dominant-baseline": "middle", "font-size": "9.5",
                fill: dark ? "#e2e8f0" : "#334155", "font-weight": "600"
            });
            lt.textContent = `第${lv + 1}代`;
            legG.appendChild(lt);
        }
        svgEl_el.appendChild(legG);
    }
}

// ─── 高亮节点 ─────────────────────────────────────────────────────────────
function highlightNode(id) {
    Object.entries(_nodeGroups).forEach(([pid, g]) => {
        const sel = pid === id;
        g.style.filter = sel ? "url(#glow)" : "";
        const rect = g.querySelector("rect");
        if (rect) rect.setAttribute("stroke-width", sel ? "3" : "1.8");
    });
}

// ─── 时间轴视图渲染 ──────────────────────────────────────────────────────────
function renderTimeline(data, svgEl_el, onNodeClick) {
    _currentViewMode = "timeline";
    _currentData = data;
    _hideNodeTooltip();
    initDragHandlers();
    svgEl_el.innerHTML = "";
    Object.keys(_nodeGroups).forEach(k => delete _nodeGroups[k]);

    if (!data.persons.length) {
        const txt = svgEl("text", { x: "50%", y: "50%", "text-anchor": "middle",
            fill: "#94a3b8", "font-size": "15" });
        txt.textContent = "暂无人员，请点击「+ 新增人员」开始";
        svgEl_el.appendChild(txt);
        return;
    }

    const { levelMap, parentsOf } = buildTreeLayout(data);
    const maxLevel = Math.max(...Object.values(levelMap), 0);
    const dark = document.body.classList.contains("dark-mode");

    // 年份范围（由出生数据推算）
    const births = data.persons.map(p => p.birth ? parseInt(p.birth) : NaN).filter(y => !isNaN(y));
    let minYear = births.length ? Math.min(...births) - 5  : 1900;
    let maxYear = births.length ? Math.max(...births) + 25 : 2030;
    minYear = Math.floor(minYear / 10) * 10;
    maxYear = Math.ceil(maxYear  / 10) * 10 + 10;

    const YEAR_PX = 10; // 像素/年
    const PAD_L = 72, PAD_R = 80, PAD_T = 68, PAD_B = 36;
    const svgW = (maxYear - minYear) * YEAR_PX + PAD_L + PAD_R;
    const svgH = (maxLevel + 1) * (NODE_H + V_GAP) + PAD_T + PAD_B;

    svgEl_el.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);
    svgEl_el.setAttribute("width",  svgW);
    svgEl_el.setAttribute("height", svgH);

    const yearToX = y  => PAD_L + (y - minYear) * YEAR_PX;
    const levelToY = lv => PAD_T + lv * (NODE_H + V_GAP);

    // defs（glow + 头像 clipPath）
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `<filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
    data.persons.forEach(p => {
        if (!p.photo) return;
        const cp = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
        cp.setAttribute("id", `avatar-clip-${p.id}`);
        cp.appendChild(svgEl("circle", { cx: "22", cy: "36", r: "15" }));
        defs.appendChild(cp);
    });
    svgEl_el.appendChild(defs);

    const gGrid  = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const gLines = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const gNodes = document.createElementNS("http://www.w3.org/2000/svg", "g");

    // 代际背景条（偶数代加底色）
    for (let lv = 0; lv <= maxLevel; lv++) {
        if (lv % 2 === 0) {
            gGrid.appendChild(svgEl("rect", {
                x: 0, y: levelToY(lv) - 14, width: svgW, height: NODE_H + 28,
                fill: _bandFill()
            }));
        }
        // 左侧代际标签（颜色与树视图一致）
        const lbl = svgEl("text", {
            x: PAD_L - 8, y: levelToY(lv) + NODE_H / 2,
            "text-anchor": "end", "dominant-baseline": "middle",
            "font-size": "11", "font-weight": "700",
            fill: _genLineColor(lv), opacity: dark ? "0.7" : "0.65"
        });
        lbl.textContent = `第${lv + 1}代`;
        gGrid.appendChild(lbl);
    }

    // 年份刻度线 & 标签（每10年一格）
    for (let year = minYear; year <= maxYear; year += 10) {
        const x = yearToX(year);
        const isCentury = year % 100 === 0;
        gGrid.appendChild(svgEl("line", {
            x1: x, y1: PAD_T - 26, x2: x, y2: svgH,
            stroke: isCentury ? (dark ? "#475569" : "#cbd5e1") : (dark ? "#1e293b" : "#f1f5f9"),
            "stroke-width": isCentury ? "1.2" : "0.7"
        }));
        const yearLbl = svgEl("text", {
            x, y: PAD_T - 30, "text-anchor": "middle",
            "font-size": "10", fill: dark ? "#475569" : "#94a3b8"
        });
        yearLbl.textContent = year;
        gGrid.appendChild(yearLbl);
    }

    // 今年红色虚线
    const currentYear = new Date().getFullYear();
    if (currentYear >= minYear && currentYear <= maxYear) {
        const tx = yearToX(currentYear);
        gGrid.appendChild(svgEl("line", {
            x1: tx, y1: PAD_T - 36, x2: tx, y2: svgH,
            stroke: "#f87171", "stroke-width": "1.5", "stroke-dasharray": "4,3"
        }));
        const todayLbl = svgEl("text", {
            x: tx + 3, y: PAD_T - 39, "font-size": "9",
            fill: "#f87171", "font-weight": "700"
        });
        todayLbl.textContent = "今";
        gGrid.appendChild(todayLbl);
    }

    svgEl_el.appendChild(gGrid);
    svgEl_el.appendChild(gLines);
    svgEl_el.appendChild(gNodes);

    // 计算各节点的时间轴坐标（按出生年 X，代际 Y）
    const tlPositions = {};
    const occupiedByLevel = {}; // 碰撞回避：记录每代已占用的 x 位置

    const sorted = [...data.persons].sort((a, b) => {
        const ay = a.birth ? parseInt(a.birth) : Infinity;
        const by_ = b.birth ? parseInt(b.birth) : Infinity;
        return ay - by_;
    });

    sorted.forEach(p => {
        const level = levelMap[p.id] ?? 0;
        const y = levelToY(level);
        let x = p.birth && !isNaN(parseInt(p.birth))
            ? yearToX(parseInt(p.birth)) - NODE_W / 2
            : svgW - PAD_R - NODE_W - 4; // 无出生年放最右

        if (!occupiedByLevel[level]) occupiedByLevel[level] = [];
        let finalX = x;
        // 碰撞推移
        for (const ex of occupiedByLevel[level]) {
            if (Math.abs(finalX - ex) < NODE_W + 5) finalX = ex + NODE_W + 5;
        }
        finalX = Math.max(PAD_L, Math.min(finalX, svgW - PAD_R - NODE_W));
        occupiedByLevel[level].push(finalX);
        tlPositions[p.id] = { x: finalX, y };
    });

    // 存坐标供 getNodeCenter 使用
    _basePositions = JSON.parse(JSON.stringify(tlPositions));

    // 连线（复用树视图的连线算法，带代际着色）
    renderConnections(data, gLines, tlPositions, parentsOf, levelMap);

    // 节点（时间轴模式不启用拖拽）
    data.persons.forEach(p => {
        const pos = tlPositions[p.id];
        if (!pos) return;
        gNodes.appendChild(_renderNodeGroup(p, pos, onNodeClick, false));
    });

    // 生平事件菱形标记（节点正下方，按年份对齐横轴；点击弹出详情浮层）
    _hideEventPopup();
    const gEvents = document.createElementNS("http://www.w3.org/2000/svg", "g");
    data.persons.forEach(p => {
        if (!p.events || !p.events.length) return;
        const level = levelMap[p.id] ?? 0;
        const markerBaseY = levelToY(level) + NODE_H + 10;

        p.events.forEach(ev => {
            if (!ev.year || isNaN(parseInt(ev.year))) return;
            const ey = parseInt(ev.year);
            if (ey < minYear || ey > maxYear) return;
            const ex  = yearToX(ey);
            const col = EVENT_TYPE_COLORS[ev.type] || "#94a3b8";
            const s   = 6;
            const diamond = svgEl("path", {
                d: `M${ex},${markerBaseY - s} L${ex + s},${markerBaseY} L${ex},${markerBaseY + s} L${ex - s},${markerBaseY} Z`,
                fill: col, stroke: dark ? "#0f172a" : "#fff", "stroke-width": "1.2",
                opacity: "0.9", cursor: "pointer"
            });
            const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
            titleEl.textContent = `${p.name} · ${ev.year} · [${ev.type}] ${ev.desc}`;
            diamond.appendChild(titleEl);
            diamond.addEventListener("click", e => {
                e.stopPropagation();
                _showEventPopup(p, ev, e.clientX, e.clientY);
            });
            // Hover highlight
            diamond.addEventListener("mouseenter", () => diamond.setAttribute("opacity", "1"));
            diamond.addEventListener("mouseleave", () => diamond.setAttribute("opacity", "0.9"));
            gEvents.appendChild(diamond);
        });
    });
    svgEl_el.appendChild(gEvents);
}

// ─── 节点中心坐标（供 app.js 视口自动居中）──────────────────────────────────
function getNodeCenter(id) {
    const pos = _basePositions[id];
    if (!pos) return null;
    // 树模式需加上拖拽偏移；时间轴模式无偏移
    const off = _currentViewMode === "tree" ? (_customOffsets[id] || { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
    return { x: pos.x + off.dx + NODE_W / 2, y: pos.y + off.dy + NODE_H / 2 };
}
window.getNodeCenter = getNodeCenter;
