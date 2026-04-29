// app.js - 入口，协调各模块

let familyData = { persons: [], relationships: [], marriages: [] };
let svgPanOffset = { x: 0, y: 0 };
let svgScale = 1;
let isPanning = false;
let panStart = { x: 0, y: 0 };

window.onload = async () => {
    // 优先 localStorage，其次 family.json
    const local = loadFromLocal();
    if (local) {
        familyData = local;
    } else {
        try {
            const res = await fetch("family.json");
            familyData = await res.json();
            saveToLocal(familyData);
        } catch {
            familyData = { persons: [], relationships: [], marriages: [] };
        }
    }

    initUI();
    refresh();
    setupTreePan();
};

function initUI() {
    init(familyData, onDataChange);
}

function onDataChange(newData) {
    familyData = newData;
    saveToLocal(familyData);
    refresh();
}

function refresh() {
    renderPersonList(familyData);
    document.getElementById("person-count").textContent = familyData.persons.length;
    const svg = document.getElementById("tree-area");
    renderTree(familyData, svg, id => {
        selectPerson(id);
    });
    applyTransform();
}

// --- SVG 平移 & 缩放 ---
function setupTreePan() {
    const container = document.getElementById("center-panel");
    const svg = document.getElementById("tree-area");

    container.addEventListener("wheel", e => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        svgScale = Math.min(3, Math.max(0.2, svgScale * delta));
        applyTransform();
    }, { passive: false });

    svg.addEventListener("mousedown", e => {
        if (e.button !== 0) return;
        isPanning = true;
        panStart = { x: e.clientX - svgPanOffset.x, y: e.clientY - svgPanOffset.y };
        svg.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", e => {
        if (!isPanning) return;
        svgPanOffset = { x: e.clientX - panStart.x, y: e.clientY - panStart.y };
        applyTransform();
    });

    window.addEventListener("mouseup", () => {
        isPanning = false;
        document.getElementById("tree-area").style.cursor = "grab";
    });

    document.getElementById("btn-zoom-in").addEventListener("click", () => {
        svgScale = Math.min(3, svgScale * 1.2);
        applyTransform();
    });
    document.getElementById("btn-zoom-out").addEventListener("click", () => {
        svgScale = Math.max(0.2, svgScale / 1.2);
        applyTransform();
    });
    document.getElementById("btn-zoom-reset").addEventListener("click", () => {
        svgScale = 1; svgPanOffset = { x: 0, y: 0 };
        applyTransform();
    });
}

function applyTransform() {
    const svg = document.getElementById("tree-area");
    svg.style.transform = `translate(${svgPanOffset.x}px, ${svgPanOffset.y}px) scale(${svgScale})`;
    svg.style.transformOrigin = "center center";
}

// 高亮树节点（外部调用）
window.highlightTreeNode = function(id) {
    document.querySelectorAll("#tree-area rect").forEach(rect => {
        rect.setAttribute("filter", "");
    });
    // 找对应 g，添加高亮
    const svg = document.getElementById("tree-area");
    const groups = svg.querySelectorAll("g > g");
    groups.forEach(g => {
        g.addEventListener && (g._personId = g._personId); // handled during render
    });
};
