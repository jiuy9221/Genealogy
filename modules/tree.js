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

// ─── 模块级状态 ──────────────────────────────────────────────────────────
const _nodeGroups    = {}; // personId -> <g>
const _customOffsets = {}; // personId -> { dx, dy } 拖拽偏移（模块生命周期持久）
let   _basePositions = {}; // 布局算法原始坐标（每次 render 刷新）
let   _dragState     = null;
let   _onDragEnd     = null;
let   _wasDragging   = false;
let   _dragHandlersInitialized = false;
let   _currentViewMode = "tree"; // "tree" | "timeline"
window._nodeDragActive = false;

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

// ─── 右键快捷菜单 ─────────────────────────────────────────────────────────
let _ctxMenuEl = null;

function _hideContextMenu() {
    if (_ctxMenuEl) { _ctxMenuEl.remove(); _ctxMenuEl = null; }
}
window.hideContextMenu = _hideContextMenu;

function _showContextMenu(personId, clientX, clientY) {
    _hideContextMenu();

    const isFocused = window.isFocusActive && window.isFocusActive(personId);

    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    menu.innerHTML = `
<button class="ctx-item" data-action="edit">✏️ <span>${t("ctx-edit")}</span></button>
<button class="ctx-item danger" data-action="delete">🗑️ <span>${t("ctx-delete")}</span></button>
<div class="ctx-divider"></div>
<button class="ctx-item" data-action="focus">${isFocused ? "✖" : "🎯"} <span>${isFocused ? t("ctx-exit-focus") : t("ctx-focus")}</span></button>
<button class="ctx-item" data-action="center">📍 <span>${t("ctx-center")}</span></button>`;

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
        if (window._onContextMenuAction) window._onContextMenuAction(btn.dataset.action, personId);
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
function renderConnections(data, gLines, nodePositions, parentsOf) {
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
        const bx1 = pp1.x + NODE_W / 2, bx2 = pp2.x + NODE_W / 2;
        const by  = Math.max(pp1.y, pp2.y) + NODE_H;
        const couplingY = by + V_GAP * 0.28;
        const jX  = (bx1 + bx2) / 2;
        drawLine(gLines, bx1, by, bx1, couplingY);
        drawLine(gLines, bx2, by, bx2, couplingY);
        drawLine(gLines, Math.min(bx1, bx2), couplingY, Math.max(bx1, bx2), couplingY, "#a78bfa");
        const validC = children.filter(cid => nodePositions[cid]);
        if (!validC.length) return;
        const childTopY = Math.min(...validC.map(cid => nodePositions[cid].y));
        const childBarY = childTopY - V_GAP * 0.28;
        const childXs   = validC.map(cid => nodePositions[cid].x + NODE_W / 2);
        drawLine(gLines, jX, couplingY, jX, childBarY);
        if (childXs.length > 1) drawLine(gLines, Math.min(...childXs), childBarY, Math.max(...childXs), childBarY);
        childXs.forEach(cx => drawLine(gLines, cx, childBarY, cx, childTopY));
    });

    singles.forEach(({ parentId, childId }) => {
        const pp = nodePositions[parentId], cp = nodePositions[childId];
        if (!pp || !cp) return;
        const px = pp.x + NODE_W / 2, py = pp.y + NODE_H;
        const cx = cp.x + NODE_W / 2, cy = cp.y;
        const midY = py + (cy - py) * 0.5;
        drawPath(gLines, `M${px},${py} V${midY} H${cx} V${cy}`);
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
    _hideEventPopup();
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

    const { nodePositions: rawPos, levelMap, parentsOf, spousesOf } = buildTreeLayout(data);

    // 存原始位置，应用拖拽偏移
    _basePositions = JSON.parse(JSON.stringify(rawPos));
    const nodePositions = JSON.parse(JSON.stringify(rawPos));
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
        if (lv % 2 !== 0) {
            const band = svgEl("rect", {
                x: minX, y: lv * (NODE_H + V_GAP) - 14,
                width: maxX - minX, height: NODE_H + 28,
                fill: _bandFill(), rx: "0"
            });
            gBands.appendChild(band);
        }
        // 左侧代际标签
        const rowY = lv * (NODE_H + V_GAP) + NODE_H / 2;
        const lbl = svgEl("text", {
            x: minX + 6, y: rowY,
            "text-anchor": "start", "dominant-baseline": "middle",
            "font-size": "11", "font-weight": "600",
            fill: dark ? "#475569" : "#94a3b8",
            "pointer-events": "none"
        });
        lbl.textContent = `第${lv + 1}代`;
        gBands.appendChild(lbl);
    }
    svgEl_el.appendChild(gBands);

    const gLines = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const gNodes = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svgEl_el.appendChild(gLines);
    svgEl_el.appendChild(gNodes);

    renderConnections(data, gLines, nodePositions, parentsOf);

    // 节点
    data.persons.forEach(p => {
        const pos = nodePositions[p.id];
        if (!pos) return;
        gNodes.appendChild(_renderNodeGroup(p, pos, onNodeClick, true));
    });
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
        // 左侧代际标签
        const lbl = svgEl("text", {
            x: PAD_L - 8, y: levelToY(lv) + NODE_H / 2,
            "text-anchor": "end", "dominant-baseline": "middle",
            "font-size": "11", fill: dark ? "#64748b" : "#94a3b8"
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

    // 连线（复用树视图的连线算法）
    renderConnections(data, gLines, tlPositions, parentsOf);

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
