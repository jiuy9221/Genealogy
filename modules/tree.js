// modules/tree.js - 族谱树布局与 SVG 渲染

const NODE_W = 130;
const NODE_H = 68;
const H_GAP = 28;      // 节点间最小水平间距
const V_GAP = 100;     // 代际垂直间距
const SPOUSE_GAP = 12; // 配偶节点间距

// 模块级：存储当前渲染的节点 <g> 元素，供外部高亮调用
const _nodeGroups = {}; // personId -> g element

// ─── 辅助 SVG 创建函数 ───────────────────────────────────────────────
function svgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
}
function drawLine(parent, x1, y1, x2, y2, color = "#94a3b8") {
    parent.appendChild(svgEl("line", { x1, y1, x2, y2, stroke: color, "stroke-width": "1.8" }));
}
function drawPath(parent, d, color = "#94a3b8", dash = "") {
    const attrs = { d, fill: "none", stroke: color, "stroke-width": "1.8" };
    if (dash) attrs["stroke-dasharray"] = dash;
    parent.appendChild(svgEl("path", attrs));
}

// ─── 布局算法 ─────────────────────────────────────────────────────────
function buildTreeLayout(data) {
    const { persons, relationships, marriages } = data;

    const childrenOf = id => relationships.filter(r => r.parent === id).map(r => r.child);
    const parentsOf  = id => relationships.filter(r => r.child === id).map(r => r.parent);
    const spousesOf  = id => {
        const res = [];
        marriages.forEach(m => {
            if (m.spouse1 === id) res.push(m.spouse2);
            if (m.spouse2 === id) res.push(m.spouse1);
        });
        return res;
    };

    // Step 1: BFS 代际层级分配（取最大深度）
    const roots = persons.filter(p => parentsOf(p.id).length === 0).map(p => p.id);
    const levelMap = {};
    const queue = roots.map(id => ({ id, level: 0 }));
    const visited = new Set();

    while (queue.length > 0) {
        const { id, level } = queue.shift();
        if (visited.has(id)) {
            // 仍然尝试更新为更大层级（避免上升边）
            if (level > (levelMap[id] ?? 0)) levelMap[id] = level;
            continue;
        }
        visited.add(id);
        levelMap[id] = Math.max(levelMap[id] ?? 0, level);
        childrenOf(id).forEach(cid => queue.push({ id: cid, level: level + 1 }));
    }
    persons.forEach(p => { if (levelMap[p.id] === undefined) levelMap[p.id] = 0; });

    // Step 2: 配偶聚合 —— 同一代的配偶归为一个 cluster
    const assignedToCluster = new Set();
    const clusters = []; // { level, ids: [main, spouse1, ...] }

    persons.forEach(p => {
        if (assignedToCluster.has(p.id)) return;
        const level = levelMap[p.id];
        const spouses = spousesOf(p.id).filter(s => !assignedToCluster.has(s) && levelMap[s] === level);
        const ids = [p.id, ...spouses];
        ids.forEach(id => {
            assignedToCluster.add(id);
            levelMap[id] = level;
        });
        clusters.push({ level, ids });
    });

    // Step 3: 按代分组
    const levelClusters = {};
    clusters.forEach(c => {
        if (!levelClusters[c.level]) levelClusters[c.level] = [];
        levelClusters[c.level].push(c);
    });

    // Step 4: 初始等间距布局
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

    // Step 5: 子代对齐父母中点（迭代 3 次，每次 50% 靠拢 + 消除重叠）
    for (let iter = 0; iter < 3; iter++) {
        levels.slice(1).forEach(level => {
            const list = levelClusters[level];

            // 按父母平均 X 排序
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

            // 靠拢父母中点
            list.forEach(cluster => {
                const pxs = [];
                cluster.ids.forEach(id => parentsOf(id).forEach(pid => {
                    if (nodePositions[pid]) pxs.push(nodePositions[pid].x + NODE_W / 2);
                }));
                if (!pxs.length) return;

                const targetCX = pxs.reduce((s, x) => s + x, 0) / pxs.length;
                const clusterW = cluster.ids.length * NODE_W + (cluster.ids.length - 1) * SPOUSE_GAP;
                const targetX = targetCX - clusterW / 2;
                const shift = (targetX - nodePositions[cluster.ids[0]].x) * 0.5;
                cluster.ids.forEach((id, i) => {
                    nodePositions[id].x += shift;
                });
            });

            // 消除同代重叠（向右推）
            list.sort((a, b) => nodePositions[a.ids[0]].x - nodePositions[b.ids[0]].x);
            for (let i = 1; i < list.length; i++) {
                const prev = list[i - 1];
                const curr = list[i];
                const prevEnd = nodePositions[prev.ids[prev.ids.length - 1]].x + NODE_W;
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

// ─── 连线渲染（渔骨式 + 单亲折线）────────────────────────────────────
function renderConnections(data, gLines, nodePositions, parentsOf, spousesOf) {
    const { relationships, marriages } = data;
    const drawnMarriage = new Set();

    // ① 婚姻虚线（无子女时才单独画；有子女时由 junction bar 代替）
    const childrenOfPair = (id1, id2) =>
        data.persons.filter(p => {
            const pars = parentsOf(p.id);
            return pars.includes(id1) && pars.includes(id2);
        });

    marriages.forEach(m => {
        const p1 = nodePositions[m.spouse1];
        const p2 = nodePositions[m.spouse2];
        if (!p1 || !p2) return;
        const key = [m.spouse1, m.spouse2].sort().join("|");
        if (drawnMarriage.has(key)) return;
        drawnMarriage.add(key);

        if (childrenOfPair(m.spouse1, m.spouse2).length === 0) {
            // 无子女：水平虚线
            const x1 = Math.min(p1.x + NODE_W, p2.x + NODE_W);
            const x2 = Math.max(p1.x, p2.x);
            const y = ((p1.y + p2.y) / 2) + NODE_H / 2;
            drawPath(gLines, `M${x1},${y} H${x2}`, "#c084fc", "6,4");
        }
    });

    // ② 构建 (parentPair -> childIds) 映射
    const childParents = {}; // childId -> [parentIds]
    relationships.forEach(r => {
        if (!childParents[r.child]) childParents[r.child] = [];
        childParents[r.child].push(r.parent);
    });

    const pairKey = (a, b) => [a, b].sort().join("|");
    const pairMap = new Map(); // key -> { p1, p2, children }
    const singleParentRels = [];

    Object.entries(childParents).forEach(([childId, pIds]) => {
        const validParents = pIds.filter(pid => nodePositions[pid]);
        if (validParents.length >= 2) {
            const key = pairKey(validParents[0], validParents[1]);
            if (!pairMap.has(key)) pairMap.set(key, { p1: validParents[0], p2: validParents[1], children: [] });
            if (!pairMap.get(key).children.includes(childId))
                pairMap.get(key).children.push(childId);
        } else if (validParents.length === 1) {
            singleParentRels.push({ parentId: validParents[0], childId });
        }
    });

    // ③ 渔骨式连线（两个父母 + 子女们）
    pairMap.forEach(({ p1, p2, children }) => {
        const pp1 = nodePositions[p1];
        const pp2 = nodePositions[p2];
        if (!pp1 || !pp2) return;

        const bx1 = pp1.x + NODE_W / 2;
        const bx2 = pp2.x + NODE_W / 2;
        const by  = Math.max(pp1.y, pp2.y) + NODE_H;
        const couplingY = by + V_GAP * 0.28;
        const jX = (bx1 + bx2) / 2;

        // 竖线：两父节点底部 → coupling bar
        drawLine(gLines, bx1, by, bx1, couplingY);
        drawLine(gLines, bx2, by, bx2, couplingY);
        // 横线：coupling bar（代替虚线婚姻线）
        drawLine(gLines, Math.min(bx1, bx2), couplingY, Math.max(bx1, bx2), couplingY, "#a78bfa");

        const validChildren = children.filter(cid => nodePositions[cid]);
        if (!validChildren.length) return;

        const childTopY = Math.min(...validChildren.map(cid => nodePositions[cid].y));
        const childBarY = childTopY - V_GAP * 0.28;
        const childXs = validChildren.map(cid => nodePositions[cid].x + NODE_W / 2);

        // 竖线：junction → children bar
        drawLine(gLines, jX, couplingY, jX, childBarY);
        if (childXs.length > 1) {
            // 横线：children spread bar
            drawLine(gLines, Math.min(...childXs), childBarY, Math.max(...childXs), childBarY);
        }
        // 竖线：drop to each child
        childXs.forEach(cx => drawLine(gLines, cx, childBarY, cx, childTopY));
    });

    // ④ 单亲折线
    singleParentRels.forEach(({ parentId, childId }) => {
        const pp = nodePositions[parentId];
        const cp = nodePositions[childId];
        if (!pp || !cp) return;
        const px = pp.x + NODE_W / 2;
        const py = pp.y + NODE_H;
        const cx = cp.x + NODE_W / 2;
        const cy = cp.y;
        const midY = py + (cy - py) * 0.5;
        // 折线：父节点底 → mid → 子节点顶
        drawPath(gLines, `M${px},${py} V${midY} H${cx} V${cy}`);
    });
}

// ─── 主渲染函数 ────────────────────────────────────────────────────────
function renderTree(data, svgEl_el, onNodeClick) {
    svgEl_el.innerHTML = "";
    Object.keys(_nodeGroups).forEach(k => delete _nodeGroups[k]);

    if (!data.persons.length) {
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", "50%"); txt.setAttribute("y", "50%");
        txt.setAttribute("text-anchor", "middle"); txt.setAttribute("fill", "#94a3b8");
        txt.setAttribute("font-size", "15");
        txt.textContent = "暂无人员，请点击「+ 新增人员」开始";
        svgEl_el.appendChild(txt);
        return;
    }

    const { nodePositions, levelMap, parentsOf, spousesOf } = buildTreeLayout(data);

    // 调整 SVG 尺寸
    const xs = Object.values(nodePositions).map(p => p.x);
    const ys = Object.values(nodePositions).map(p => p.y);
    const pad = 60;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + NODE_W + pad;
    const maxY = Math.max(...ys) + NODE_H + pad;
    svgEl_el.setAttribute("viewBox", `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
    svgEl_el.setAttribute("width",  maxX - minX);
    svgEl_el.setAttribute("height", maxY - minY);

    // defs：高亮 filter
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`;
    svgEl_el.appendChild(defs);

    // 代际背景条
    const maxLevel = Math.max(...Object.values(levelMap));
    const gBands = document.createElementNS("http://www.w3.org/2000/svg", "g");
    for (let lv = 0; lv <= maxLevel; lv++) {
        if (lv % 2 === 0) continue;
        const bandY = lv * (NODE_H + V_GAP) - 14;
        const band = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        band.setAttribute("x", minX); band.setAttribute("y", bandY);
        band.setAttribute("width", maxX - minX); band.setAttribute("height", NODE_H + 28);
        band.setAttribute("fill", "rgba(241,245,249,0.6)"); band.setAttribute("rx", "0");
        gBands.appendChild(band);
    }
    svgEl_el.appendChild(gBands);

    const gLines = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const gNodes = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svgEl_el.appendChild(gLines);
    svgEl_el.appendChild(gNodes);

    // 渲染连线
    renderConnections(data, gLines, nodePositions, parentsOf, spousesOf);

    // 渲染节点
    data.persons.forEach(p => {
        const pos = nodePositions[p.id];
        if (!pos) return;

        const isMale   = p.gender === "male";
        const isFemale = p.gender === "female";
        const fillColor   = isMale ? "#eff6ff" : isFemale ? "#fdf2f8" : "#f8fafc";
        const strokeColor = isMale ? "#93c5fd" : isFemale ? "#f9a8d4" : "#cbd5e1";

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("transform", `translate(${pos.x},${pos.y})`);
        g.style.cursor = "pointer";
        g.addEventListener("click", () => onNodeClick && onNodeClick(p.id));
        _nodeGroups[p.id] = g;

        // 节点背景矩形
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("width", NODE_W); rect.setAttribute("height", NODE_H);
        rect.setAttribute("rx", "10"); rect.setAttribute("ry", "10");
        rect.setAttribute("fill", fillColor);
        rect.setAttribute("stroke", strokeColor); rect.setAttribute("stroke-width", "1.8");
        g.appendChild(rect);

        // 顶部性别色条
        const topBar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        topBar.setAttribute("width", NODE_W); topBar.setAttribute("height", "5");
        topBar.setAttribute("rx", "10"); topBar.setAttribute("ry", "10");
        topBar.setAttribute("fill", isMale ? "#3b82f6" : isFemale ? "#ec4899" : "#94a3b8");
        g.appendChild(topBar);

        // 姓名
        const nameT = document.createElementNS("http://www.w3.org/2000/svg", "text");
        nameT.setAttribute("x", NODE_W / 2); nameT.setAttribute("y", NODE_H / 2 - 4);
        nameT.setAttribute("text-anchor", "middle"); nameT.setAttribute("dominant-baseline", "middle");
        nameT.setAttribute("font-size", "15"); nameT.setAttribute("font-weight", "700");
        nameT.setAttribute("fill", "#1e293b");
        nameT.textContent = p.name.length > 8 ? p.name.slice(0, 8) + "…" : p.name;
        g.appendChild(nameT);

        // 生卒年
        const lifespan = (() => {
            const b = p.birth ? p.birth.slice(0, 4) : "?";
            if (p.death) return `${b}–${p.death.slice(0, 4)}`;
            if (p.birth) return `生于 ${b}`;
            return "";
        })();
        if (lifespan) {
            const lifeT = document.createElementNS("http://www.w3.org/2000/svg", "text");
            lifeT.setAttribute("x", NODE_W / 2); lifeT.setAttribute("y", NODE_H - 12);
            lifeT.setAttribute("text-anchor", "middle"); lifeT.setAttribute("dominant-baseline", "middle");
            lifeT.setAttribute("font-size", "10"); lifeT.setAttribute("fill", "#64748b");
            lifeT.textContent = lifespan;
            g.appendChild(lifeT);
        }

        gNodes.appendChild(g);
    });
}

// ─── 高亮指定节点 ─────────────────────────────────────────────────────
function highlightNode(id) {
    Object.entries(_nodeGroups).forEach(([pid, g]) => {
        const isSelected = pid === id;
        g.style.filter = isSelected ? "url(#glow)" : "";
        const rect = g.querySelector("rect");
        if (rect) rect.setAttribute("stroke-width", isSelected ? "3" : "1.8");
    });
}
