// modules/tree.js - 族谱树布局与 SVG 渲染

const NODE_W = 120;
const NODE_H = 60;
const H_GAP = 20;   // 同代水平间距
const V_GAP = 80;   // 代际垂直间距
const SPOUSE_GAP = 10; // 配偶节点间距

/**
 * 构建渲染节点树
 * 以没有父母的人为根，自上而下排列
 */
function buildTreeLayout(data) {
    const { persons, relationships, marriages } = data;

    // 辅助查找
    const childrenOf = id => relationships.filter(r => r.parent === id).map(r => r.child);
    const parentsOf = id => relationships.filter(r => r.child === id).map(r => r.parent);
    const spousesOf = id => {
        const result = [];
        marriages.forEach(m => {
            if (m.spouse1 === id) result.push(m.spouse2);
            if (m.spouse2 === id) result.push(m.spouse1);
        });
        return result;
    };

    // 找出所有根（没有父母的人）
    const roots = persons.filter(p => parentsOf(p.id).length === 0).map(p => p.id);

    // 用 BFS 确定每个人的代际层级
    const levelMap = {};
    const queue = roots.map(id => ({ id, level: 0 }));
    const visited = new Set();

    while (queue.length > 0) {
        const { id, level } = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        levelMap[id] = level;
        childrenOf(id).forEach(cid => {
            if (!visited.has(cid)) queue.push({ id: cid, level: level + 1 });
        });
    }

    // 未被遍历到的人（孤立节点）加到 level 0
    persons.forEach(p => { if (levelMap[p.id] === undefined) levelMap[p.id] = 0; });

    // 按层分组，配偶合并同层（以第一个人为主）
    const processedSpouses = new Set();
    const levelGroups = {}; // level -> [{mainId, spouseIds}]

    // 先按层收集主节点
    persons.forEach(p => {
        if (processedSpouses.has(p.id)) return;
        const level = levelMap[p.id] ?? 0;
        if (!levelGroups[level]) levelGroups[level] = [];
        const spouses = spousesOf(p.id).filter(s => !processedSpouses.has(s));
        spouses.forEach(s => processedSpouses.add(s));
        processedSpouses.add(p.id);
        levelGroups[level].push({ mainId: p.id, spouseIds: spouses });
    });

    // 计算 X 坐标（水平布局）
    const nodePositions = {}; // id -> {x, y}
    const levels = Object.keys(levelGroups).map(Number).sort((a, b) => a - b);

    levels.forEach(level => {
        const groups = levelGroups[level];
        // 先算每组宽度
        const groupWidths = groups.map(g => (1 + g.spouseIds.length) * (NODE_W + H_GAP) - H_GAP + SPOUSE_GAP * g.spouseIds.length);
        const totalW = groupWidths.reduce((s, w) => s + w + H_GAP, 0) - H_GAP;
        let curX = -totalW / 2;
        const y = level * (NODE_H + V_GAP);

        groups.forEach((g, gi) => {
            nodePositions[g.mainId] = { x: curX, y };
            curX += NODE_W + SPOUSE_GAP;
            g.spouseIds.forEach(sid => {
                nodePositions[sid] = { x: curX, y };
                curX += NODE_W + SPOUSE_GAP;
            });
            curX += H_GAP;
        });
    });

    return { nodePositions, levelMap, childrenOf, parentsOf, spousesOf, marriages };
}

/**
 * 渲染族谱树到 SVG
 */
function renderTree(data, svgEl, onNodeClick) {
    svgEl.innerHTML = "";

    if (!data.persons.length) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", "50%");
        text.setAttribute("y", "50%");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "#999");
        text.textContent = "暂无人员，请点击「新增人员」";
        svgEl.appendChild(text);
        return;
    }

    const { nodePositions, marriages, childrenOf, spousesOf } = buildTreeLayout(data);

    // 动态调整 SVG 尺寸
    const xs = Object.values(nodePositions).map(p => p.x);
    const ys = Object.values(nodePositions).map(p => p.y);
    const minX = Math.min(...xs) - NODE_W;
    const minY = Math.min(...ys) - 20;
    const maxX = Math.max(...xs) + NODE_W * 2;
    const maxY = Math.max(...ys) + NODE_H + 40;
    const viewW = maxX - minX;
    const viewH = maxY - minY;

    svgEl.setAttribute("viewBox", `${minX} ${minY} ${viewW} ${viewH}`);
    svgEl.setAttribute("width", viewW);
    svgEl.setAttribute("height", viewH);

    const gLines = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const gNodes = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svgEl.appendChild(gLines);
    svgEl.appendChild(gNodes);

    const drawn = new Set();

    // 绘制连线
    data.persons.forEach(p => {
        const pos = nodePositions[p.id];
        if (!pos) return;

        // 亲子连线
        childrenOf(p.id).forEach(cid => {
            const cpos = nodePositions[cid];
            if (!cpos) return;
            const key = `rel-${p.id}-${cid}`;
            if (drawn.has(key)) return;
            drawn.add(key);

            const px = pos.x + NODE_W / 2;
            const py = pos.y + NODE_H;
            const cx = cpos.x + NODE_W / 2;
            const cy = cpos.y;
            const midY = (py + cy) / 2;

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", `M${px},${py} C${px},${midY} ${cx},${midY} ${cx},${cy}`);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", "#888");
            path.setAttribute("stroke-width", "1.5");
            gLines.appendChild(path);
        });

        // 配偶连线（水平虚线）
        spousesOf(p.id).forEach(sid => {
            const spos = nodePositions[sid];
            if (!spos) return;
            const key = `mar-${[p.id, sid].sort().join("-")}`;
            if (drawn.has(key)) return;
            drawn.add(key);

            const x1 = Math.min(pos.x + NODE_W, spos.x + NODE_W);
            const x2 = Math.max(pos.x, spos.x);
            const y = pos.y + NODE_H / 2;

            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y);
            line.setAttribute("stroke", "#c09");
            line.setAttribute("stroke-width", "1.5");
            line.setAttribute("stroke-dasharray", "5,3");
            gLines.appendChild(line);
        });
    });

    // 绘制节点
    data.persons.forEach(p => {
        const pos = nodePositions[p.id];
        if (!pos) return;

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("transform", `translate(${pos.x},${pos.y})`);
        g.style.cursor = "pointer";
        g.addEventListener("click", () => onNodeClick && onNodeClick(p.id));

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("width", NODE_W);
        rect.setAttribute("height", NODE_H);
        rect.setAttribute("rx", "8");
        rect.setAttribute("ry", "8");
        rect.setAttribute("fill", p.gender === "female" ? "#fce4ec" : p.gender === "male" ? "#e3f2fd" : "#f5f5f5");
        rect.setAttribute("stroke", p.gender === "female" ? "#f48fb1" : p.gender === "male" ? "#90caf9" : "#bdbdbd");
        rect.setAttribute("stroke-width", "1.5");
        g.appendChild(rect);

        const nameText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        nameText.setAttribute("x", NODE_W / 2);
        nameText.setAttribute("y", NODE_H / 2 - 6);
        nameText.setAttribute("text-anchor", "middle");
        nameText.setAttribute("dominant-baseline", "middle");
        nameText.setAttribute("font-size", "14");
        nameText.setAttribute("font-weight", "bold");
        nameText.setAttribute("fill", "#333");
        nameText.textContent = p.name;
        g.appendChild(nameText);

        const birthText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        birthText.setAttribute("x", NODE_W / 2);
        birthText.setAttribute("y", NODE_H / 2 + 12);
        birthText.setAttribute("text-anchor", "middle");
        birthText.setAttribute("dominant-baseline", "middle");
        birthText.setAttribute("font-size", "10");
        birthText.setAttribute("fill", "#777");
        birthText.textContent = p.birth ? p.birth.slice(0, 4) : "";
        g.appendChild(birthText);

        gNodes.appendChild(g);
    });
}
