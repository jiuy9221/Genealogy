// app.js - 入口，协调各模块

const DRAG_STORAGE_KEY = "genealogy_customOffsets";
const DARK_STORAGE_KEY = "genealogy_darkMode";

let familyData   = { persons: [], relationships: [], marriages: [] };
let svgPanOffset = { x: 0, y: 0 };
let svgScale     = 1;
let isPanning    = false;
let panStart     = { x: 0, y: 0 };
let _didInitialFit = false;
let _viewMode    = "tree"; // "tree" | "timeline"

// 暴露给 tree.js 拖拽换算
window.getSvgScale = () => svgScale;

// ─── 视口自动居中到节点 ────────────────────────────────────────────────────
function centerOnNode(id) {
    const center = window.getNodeCenter ? window.getNodeCenter(id) : null;
    if (!center) return;
    const container = document.getElementById("center-panel");
    const cW = container.clientWidth  / 2;
    const cH = container.clientHeight / 2;
    svgPanOffset = { x: cW - center.x * svgScale, y: cH - center.y * svgScale };
    applyTransform();
}

window.onload = async () => {
    // 语言优先加载（避免闪烁）
    loadLang();

    // 暗色主题预先应用（避免闪白）
    if (localStorage.getItem(DARK_STORAGE_KEY) === "1") {
        document.body.classList.add("dark-mode");
    }

    // 应用静态 i18n
    applyI18n();

    // 加载拖拽偏移
    setCustomOffsets(loadDragOffsets());
    setDragEndCallback(() => { saveDragOffsets(); refreshTreeOnly(); });

    // 语言切换后重新渲染
    window._onLangChange = () => {
        applyI18n();
        syncDarkBtn(document.getElementById("btn-dark-mode"));
        refresh();
    };

    // 数据加载
    const shareData = tryLoadShareHash();
    if (shareData) {
        familyData = shareData;
        saveToLocal(familyData);
        history.replaceState(null, "", location.pathname);
        setTimeout(() => showToast && showToast(
            t("toast-share-loaded").replace("{n}", familyData.persons.length)
        ), 600);
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
    setupLangSwitcher();
};

// ─── 解析 URL hash 分享数据 ────────────────────────────────────────
function tryLoadShareHash() {
    const hash = location.hash;
    if (!hash.startsWith("#share=")) return null;
    try {
        const json = decodeURIComponent(
            atob(hash.slice(7)).split("").map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
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

function _renderView(svg) {
    if (_viewMode === "timeline") {
        renderTimeline(familyData, svg, id => selectPerson(id));
    } else {
        renderTree(familyData, svg, id => selectPerson(id));
    }
}

function refresh() {
    renderPersonList(familyData);
    document.getElementById("person-count").textContent = familyData.persons.length;
    const svg = document.getElementById("tree-area");
    _renderView(svg);
    applyTransform();
    if (!_didInitialFit) {
        requestAnimationFrame(() => { autoFitTree(); _didInitialFit = true; });
    }
}

function refreshTreeOnly() {
    const svg = document.getElementById("tree-area");
    _renderView(svg);
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

// ─── 高亮并居中树节点 ──────────────────────────────────────────────────────
window.highlightTreeNode = function(id) {
    highlightNode(id);
    centerOnNode(id);
};

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
    if (!btn) return;
    const dark = document.body.classList.contains("dark-mode");
    btn.textContent = dark ? t("dark-btn-on") : t("dark-btn-off");
    btn.title       = dark ? t("dark-title-on") : t("dark-title-off");
    btn.classList.toggle("dark-active", dark);
}

// ─── 语言切换 ──────────────────────────────────────────────────────────────
function setupLangSwitcher() {
    const sel = document.getElementById("lang-select");
    if (!sel) return;
    sel.value = getCurrentLang();
    sel.addEventListener("change", () => setLang(sel.value));
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
            if (e.key === "t" || e.key === "T") {
                const next = _viewMode === "tree" ? "timeline" : "tree";
                window._switchView && window._switchView(next);
            }
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
            showToast(t("toast-drag-reset"));
        });
    }

    // 视图切换（族谱树 / 时间轴）
    const btnViewTree     = document.getElementById("btn-view-tree");
    const btnViewTimeline = document.getElementById("btn-view-timeline");
    if (btnViewTree && btnViewTimeline) {
        const switchView = mode => {
            if (_viewMode === mode) return;
            _viewMode = mode;
            btnViewTree.classList.toggle("active", mode === "tree");
            btnViewTimeline.classList.toggle("active", mode === "timeline");
            const rd = document.getElementById("btn-reset-drag");
            if (rd) rd.style.display = mode === "tree" ? "" : "none";
            _didInitialFit = false;
            refreshTreeOnly();
            requestAnimationFrame(() => { autoFitTree(); _didInitialFit = true; });
        };
        btnViewTree.addEventListener("click",     () => switchView("tree"));
        btnViewTimeline.addEventListener("click",  () => switchView("timeline"));
        window._switchView = switchView;
    }
}

// ─── SVG 平移 & 缩放（含触摸双指缩放）────────────────────────────────────
function setupTreePan() {
    const container = document.getElementById("center-panel");
    const svg = document.getElementById("tree-area");

    // 鼠标滚轮缩放
    container.addEventListener("wheel", e => {
        e.preventDefault();
        svgScale = Math.min(3, Math.max(0.2, svgScale * (e.deltaY > 0 ? 0.9 : 1.1)));
        applyTransform();
    }, { passive: false });

    // 鼠标平移
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

    // ─── 触摸：单指平移 + 双指捏合缩放 ──────────────────────────────────
    let touchStart  = null;
    let pinchDist   = null;
    let pinchScaleStart = null;

    svg.addEventListener("touchstart", e => {
        if (e.touches.length === 2) {
            // 双指：开始捏合缩放，禁用单指平移
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchDist = Math.sqrt(dx * dx + dy * dy);
            pinchScaleStart = svgScale;
            touchStart = null;
        } else if (e.touches.length === 1) {
            touchStart = {
                x: e.touches[0].clientX - svgPanOffset.x,
                y: e.touches[0].clientY - svgPanOffset.y
            };
        }
    }, { passive: true });

    svg.addEventListener("touchmove", e => {
        if (e.touches.length === 2 && pinchDist !== null) {
            e.preventDefault(); // 阻止浏览器原生捏合缩放
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const newDist = Math.sqrt(dx * dx + dy * dy);
            svgScale = Math.max(0.2, Math.min(3, pinchScaleStart * (newDist / pinchDist)));
            applyTransform();
        } else if (touchStart && e.touches.length === 1) {
            svgPanOffset = {
                x: e.touches[0].clientX - touchStart.x,
                y: e.touches[0].clientY - touchStart.y
            };
            applyTransform();
        }
    }, { passive: false }); // passive:false 允许 preventDefault 阻止原生缩放

    svg.addEventListener("touchend", e => {
        if (e.touches.length < 2) pinchDist = null;
        if (e.touches.length === 0) touchStart = null;
    });

    // 缩放按钮
    document.getElementById("btn-zoom-in").addEventListener("click",    () => { svgScale = Math.min(3, svgScale * 1.2); applyTransform(); });
    document.getElementById("btn-zoom-out").addEventListener("click",   () => { svgScale = Math.max(0.2, svgScale / 1.2); applyTransform(); });
    document.getElementById("btn-zoom-reset").addEventListener("click", () => { svgScale = 1; svgPanOffset = { x: 0, y: 0 }; applyTransform(); });
}

function applyTransform() {
    const svg = document.getElementById("tree-area");
    svg.style.transform = `translate(${svgPanOffset.x}px, ${svgPanOffset.y}px) scale(${svgScale})`;
    svg.style.transformOrigin = "center center";
}
