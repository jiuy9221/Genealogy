// app.js - 入口，协调各模块

const DRAG_STORAGE_KEY = "genealogy_customOffsets";
const DARK_STORAGE_KEY = "genealogy_darkMode";

let familyData   = { persons: [], relationships: [], marriages: [] };
let svgPanOffset = { x: 0, y: 0 };
let svgScale     = 1;
let isPanning    = false;
let panStart     = { x: 0, y: 0 };
let _didInitialFit = false;

// 暴露给 tree.js 拖拽换算
window.getSvgScale = () => svgScale;

window.onload = async () => {
    // 加载拖拽偏移（在 renderTree 之前）
    setCustomOffsets(loadDragOffsets());
    setDragEndCallback(() => { saveDragOffsets(); refreshTreeOnly(); });

    // 暗色主题预先应用（避免闪白）
    if (localStorage.getItem(DARK_STORAGE_KEY) === "1") {
        document.body.classList.add("dark-mode");
    }

    // 数据加载
    const shareData = tryLoadShareHash();
    if (shareData) {
        familyData = shareData;
        saveToLocal(familyData);
        history.replaceState(null, "", location.pathname);
        setTimeout(() => showToast && showToast(`已加载分享数据（${familyData.persons.length} 人）`), 600);
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
    setupDarkMode();
};

// ─── 解析 URL hash 分享数据 ────────────────────────────────────────────
function tryLoadShareHash() {
    const hash = location.hash;
    if (!hash.startsWith('#share=')) return null;
    try {
        const json = decodeURIComponent(
            atob(hash.slice(7)).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
        );
        const parsed = JSON.parse(json);
        return parsed.persons ? parsed : null;
    } catch { return null; }
}

function initUI() { init(familyData, onDataChange); }

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

function refreshTreeOnly() {
    const svg = document.getElementById("tree-area");
    renderTree(familyData, svg, id => selectPerson(id));
    applyTransform();
}

// ─── 拖拽偏移持久化 ───────────────────────────────────────────────────────
function loadDragOffsets() {
    try { const raw = localStorage.getItem(DRAG_STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }
    catch { return {}; }
}
function saveDragOffsets() {
    localStorage.setItem(DRAG_STORAGE_KEY, JSON.stringify(getCustomOffsets()));
}

// ─── 自动适应视口 ──────────────────────────────────────────────────────────
function autoFitTree() {
    const container = document.getElementById("center-panel");
    const svg = document.getElementById("tree-area");
    const svgW = parseFloat(svg.getAttribute("width"))  || 0;
    const svgH = parseFloat(svg.getAttribute("height")) || 0;
    if (!svgW || !svgH) return;
    svgScale = Math.max(0.15, Math.min(container.clientWidth / svgW, container.clientHeight / svgH, 1) * 0.88);
    svgPanOffset = { x: 0, y: 0 };
    applyTransform();
}

// ─── 高亮树节点 ────────────────────────────────────────────────────────────
window.highlightTreeNode = function(id) { highlightNode(id); };

// ─── 暗色主题 ──────────────────────────────────────────────────────────────
function setupDarkMode() {
    const btn = document.getElementById("btn-dark-mode");
    if (!btn) return;
    syncDarkBtn(btn);
    btn.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode");
        localStorage.setItem(DARK_STORAGE_KEY, document.body.classList.contains("dark-mode") ? "1" : "0");
        syncDarkBtn(btn);
        refreshTreeOnly();
    });
}
function syncDarkBtn(btn) {
    const dark = document.body.classList.contains("dark-mode");
    btn.textContent = dark ? "☀ 亮色" : "🌙 暗色";
    btn.title = dark ? "切换亮色主题 (D)" : "切换暗色主题 (D)";
    btn.classList.toggle("dark-active", dark);
}

// ─── 键盘快捷键 ────────────────────────────────────────────────────────────
function setupKeyboard() {
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            const ov = document.getElementById("modal-overlay");
            if (ov.style.display !== "none") { ov.style.display = "none"; return; }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "n") { e.preventDefault(); document.getElementById("btn-add-person").click(); }
        if ((e.ctrlKey || e.metaKey) && e.key === "e") { e.preventDefault(); document.getElementById("btn-export-json").click(); }
        if ((e.ctrlKey || e.metaKey) && e.key === "p") { e.preventDefault(); window.print(); }
        if (!e.ctrlKey && !e.metaKey) {
            if (e.key === "+" || e.key === "=") { svgScale = Math.min(3, svgScale * 1.15); applyTransform(); }
            if (e.key === "-")                  { svgScale = Math.max(0.2, svgScale / 1.15); applyTransform(); }
            if (e.key === "0")                  { svgScale = 1; svgPanOffset = { x: 0, y: 0 }; applyTransform(); }
            if (e.key === "f" || e.key === "F") { autoFitTree(); }
            if (e.key === "d" || e.key === "D") { document.getElementById("btn-dark-mode")?.click(); }
        }
    });
}

// ─── 额外按钮绑定 ──────────────────────────────────────────────────────────
function setupExtraButtons() {
    document.getElementById("btn-stats").addEventListener("click", showStatsModal);
    document.getElementById("btn-export-png").addEventListener("click", exportTreeAsPNG);
    document.getElementById("btn-fit-view").addEventListener("click", autoFitTree);
    document.getElementById("btn-share").addEventListener("click", generateShareLink);
    document.getElementById("btn-print").addEventListener("click", () => window.print());

    const resetDrag = document.getElementById("btn-reset-drag");
    if (resetDrag) {
        resetDrag.addEventListener("click", () => {
            clearCustomOffsets();
            saveDragOffsets();
            refreshTreeOnly();
            showToast("节点位置已重置");
        });
    }
}

// ─── SVG 平移 & 缩放 ───────────────────────────────────────────────────────
function setupTreePan() {
    const container = document.getElementById("center-panel");
    const svg = document.getElementById("tree-area");

    container.addEventListener("wheel", e => {
        e.preventDefault();
        svgScale = Math.min(3, Math.max(0.2, svgScale * (e.deltaY > 0 ? 0.9 : 1.1)));
        applyTransform();
    }, { passive: false });

    svg.addEventListener("mousedown", e => {
        if (e.button !== 0 || window._nodeDragActive) return;
        isPanning = true;
        panStart = { x: e.clientX - svgPanOffset.x, y: e.clientY - svgPanOffset.y };
        svg.style.cursor = "grabbing";
    });
    window.addEventListener("mousemove", e => {
        if (!isPanning || window._nodeDragActive) return;
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
        if (e.touches.length === 1)
            touchStart = { x: e.touches[0].clientX - svgPanOffset.x, y: e.touches[0].clientY - svgPanOffset.y };
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
