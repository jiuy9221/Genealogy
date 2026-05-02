// app.js - 入口，协调各模块

let familyData = { persons: [], relationships: [], marriages: [] };
let svgPanOffset = { x: 0, y: 0 };
let svgScale = 1;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let _didInitialFit = false;

window.onload = async () => {
    // 检查 URL hash 中的分享数据
    const shareData = tryLoadShareHash();
    if (shareData) {
        familyData = shareData;
        saveToLocal(familyData);
        history.replaceState(null, "", location.pathname);
        showToast && setTimeout(() => showToast(`已加载分享数据（${familyData.persons.length} 人）`), 600);
    } else {
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
    }

    initUI();
    refresh();
    setupTreePan();
    setupKeyboard();
    setupExtraButtons();
};

// ─── 解析 URL hash 中的分享数据 ──────────────────────────────────────
function tryLoadShareHash() {
    const hash = location.hash;
    if (!hash.startsWith('#share=')) return null;
    try {
        const encoded = hash.slice(7);
        // Unicode-safe atob
        const json = decodeURIComponent(
            atob(encoded).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
        );
        const parsed = JSON.parse(json);
        if (!parsed.persons) return null;
        return parsed;
    } catch { return null; }
}

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
    renderTree(familyData, svg, id => selectPerson(id));
    applyTransform();
    if (!_didInitialFit) {
        requestAnimationFrame(() => { autoFitTree(); _didInitialFit = true; });
    }
}

// ─── 自动适应视口 ───────────────────────────────────────────────────────
function autoFitTree() {
    const container = document.getElementById("center-panel");
    const svg = document.getElementById("tree-area");
    const svgW = parseFloat(svg.getAttribute("width"))  || 0;
    const svgH = parseFloat(svg.getAttribute("height")) || 0;
    if (!svgW || !svgH) return;
    const newScale = Math.min(container.clientWidth / svgW, container.clientHeight / svgH, 1) * 0.88;
    svgScale = Math.max(0.15, newScale);
    svgPanOffset = { x: 0, y: 0 };
    applyTransform();
}

// ─── 高亮树节点（ui.js 的 selectPerson 调用）────────────────────────
window.highlightTreeNode = function(id) {
    highlightNode(id);
};

// ─── 键盘快捷键 ─────────────────────────────────────────────────────
function setupKeyboard() {
    document.addEventListener("keydown", e => {
        // ESC：关闭模态框
        if (e.key === "Escape") {
            const overlay = document.getElementById("modal-overlay");
            if (overlay.style.display !== "none") {
                overlay.style.display = "none";
                return;
            }
        }
        // Ctrl/Cmd + N：新增人员
        if ((e.ctrlKey || e.metaKey) && e.key === "n") {
            e.preventDefault();
            document.getElementById("btn-add-person").click();
        }
        // Ctrl/Cmd + E：导出 JSON
        if ((e.ctrlKey || e.metaKey) && e.key === "e") {
            e.preventDefault();
            document.getElementById("btn-export-json").click();
        }
        // Ctrl/Cmd + P：打印
        if ((e.ctrlKey || e.metaKey) && e.key === "p") {
            e.preventDefault();
            window.print();
        }
        // +/= 放大，- 缩小，0 重置，F 适应视口
        if (!e.ctrlKey && !e.metaKey) {
            if (e.key === "+" || e.key === "=") { svgScale = Math.min(3, svgScale * 1.15); applyTransform(); }
            if (e.key === "-")                   { svgScale = Math.max(0.2, svgScale / 1.15); applyTransform(); }
            if (e.key === "0")                   { svgScale = 1; svgPanOffset = { x: 0, y: 0 }; applyTransform(); }
            if (e.key === "f" || e.key === "F")  { autoFitTree(); }
        }
    });
}

// ─── 额外按钮绑定 ─────────────────────────────────────────────────────
function setupExtraButtons() {
    document.getElementById("btn-stats").addEventListener("click", showStatsModal);
    document.getElementById("btn-export-png").addEventListener("click", exportTreeAsPNG);
    document.getElementById("btn-fit-view").addEventListener("click", autoFitTree);
    document.getElementById("btn-share").addEventListener("click", generateShareLink);
    document.getElementById("btn-print").addEventListener("click", () => window.print());
}

// ─── SVG 平移 & 缩放 ─────────────────────────────────────────────────
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

    // 触摸平移
    let touchStart = null;
    svg.addEventListener("touchstart", e => {
        if (e.touches.length === 1) {
            touchStart = { x: e.touches[0].clientX - svgPanOffset.x, y: e.touches[0].clientY - svgPanOffset.y };
        }
    }, { passive: true });
    svg.addEventListener("touchmove", e => {
        if (touchStart && e.touches.length === 1) {
            svgPanOffset = { x: e.touches[0].clientX - touchStart.x, y: e.touches[0].clientY - touchStart.y };
            applyTransform();
        }
    }, { passive: true });
    svg.addEventListener("touchend", () => { touchStart = null; });

    document.getElementById("btn-zoom-in").addEventListener("click",    () => { svgScale = Math.min(3, svgScale * 1.2); applyTransform(); });
    document.getElementById("btn-zoom-out").addEventListener("click",   () => { svgScale = Math.max(0.2, svgScale / 1.2); applyTransform(); });
    document.getElementById("btn-zoom-reset").addEventListener("click", () => { svgScale = 1; svgPanOffset = { x: 0, y: 0 }; applyTransform(); });
}

function applyTransform() {
    const svg = document.getElementById("tree-area");
    svg.style.transform = `translate(${svgPanOffset.x}px, ${svgPanOffset.y}px) scale(${svgScale})`;
    svg.style.transformOrigin = "center center";
}
