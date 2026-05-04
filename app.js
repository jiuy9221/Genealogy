// app.js - 入口，协调各模块

const DRAG_STORAGE_KEY = "genealogy_customOffsets";
const DARK_STORAGE_KEY = "genealogy_darkMode";

let familyData   = { persons: [], relationships: [], marriages: [] };
let currentFileId = null;
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
    loadLang();
    if (localStorage.getItem(DARK_STORAGE_KEY) === "1") {
        document.body.classList.add("dark-mode");
    }
    applyI18n();
    setCustomOffsets(loadDragOffsets());
    setDragEndCallback(() => { saveDragOffsets(); refreshTreeOnly(); });
    window._onLangChange = () => {
        applyI18n();
        syncDarkBtn(document.getElementById("btn-dark-mode"));
        refresh();
    };

    // 迁移旧版存储并加载当前族谱
    const hadLegacyData = migrateFromLegacy();

    const shareData = tryLoadShareHash();
    if (shareData) {
        currentFileId = getActiveFileId();
        familyData = shareData;
        if (currentFileId) saveGenealogyById(currentFileId, familyData);
        history.replaceState(null, "", location.pathname);
        setTimeout(() => showToast && showToast(
            t("toast-share-loaded").replace("{n}", familyData.persons.length)
        ), 600);
    } else {
        currentFileId = getActiveFileId();
        if (currentFileId) {
            familyData = loadGenealogyById(currentFileId) || defaultData();
            // 新安装且无历史数据时尝试加载 family.json
            if (!familyData.persons.length && !hadLegacyData) {
                try {
                    const res = await fetch("family.json");
                    const json = await res.json();
                    if (json.persons?.length) {
                        familyData = json;
                        saveGenealogyById(currentFileId, familyData);
                    }
                } catch {}
            }
        } else {
            try {
                const res = await fetch("family.json");
                familyData = await res.json();
            } catch { familyData = defaultData(); }
            currentFileId = createGenealogyFile("默认族谱", familyData);
            setActiveFileId(currentFileId);
        }
    }

    updateFileNameDisplay();
    initUI();
    refresh();
    setupTreePan();
    setupKeyboard();
    setupExtraButtons();
    setupDarkMode();
    setupLangSwitcher();
    setupFileManager();
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
    if (currentFileId) saveGenealogyById(currentFileId, familyData);
    else saveToLocal(familyData);
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

// ─── 多族谱文件管理 ────────────────────────────────────────────────────────
function updateFileNameDisplay() {
    const el = document.getElementById("current-file-name");
    if (!el) return;
    const list = loadFileList();
    const entry = list.find(f => f.id === currentFileId);
    el.textContent = entry ? entry.name : "";
}

function switchToFile(id) {
    if (id === currentFileId) return;
    if (currentFileId) saveGenealogyById(currentFileId, familyData);
    currentFileId = id;
    setActiveFileId(id);
    familyData = loadGenealogyById(id) || defaultData();
    updateFileNameDisplay();
    _didInitialFit = false;
    refresh();
    requestAnimationFrame(() => { autoFitTree(); _didInitialFit = true; });
}

function setupFileManager() {
    const btn = document.getElementById("btn-file-manager");
    if (btn) btn.addEventListener("click", showFileManagerDialog);
}

function showFileManagerDialog() {
    const old = document.getElementById("fm-overlay");
    if (old) old.remove();

    const rebuildList = () => {
        const list = loadFileList();
        if (!list.length) return `<p class="fm-empty">${t("file-manager-empty")}</p>`;
        return list.map(f => {
            const isActive = f.id === currentFileId;
            const dateStr = f.modified || f.created || "";
            return `
<div class="fm-item${isActive ? " fm-active" : ""}">
  <div class="fm-item-info">
    <span class="fm-name">${escHtmlFm(f.name)}${isActive ? `<span class="fm-badge">${t("file-manager-active")}</span>` : ""}</span>
    <span class="fm-date">${t("file-modified-on")} ${dateStr}</span>
  </div>
  <div class="fm-btns">
    ${!isActive ? `<button class="btn-sm btn-primary fm-action" data-action="switch" data-id="${f.id}">${t("file-manager-switch")}</button>` : ""}
    <button class="btn-sm fm-action" data-action="rename" data-id="${f.id}">${t("file-manager-rename")}</button>
    ${list.length > 1 ? `<button class="btn-sm btn-danger fm-action" data-action="delete" data-id="${f.id}">${t("file-manager-delete")}</button>` : ""}
  </div>
</div>`;
        }).join("");
    };

    const overlay = document.createElement("div");
    overlay.id = "fm-overlay";
    overlay.className = "fm-overlay";
    overlay.innerHTML = `
<div class="fm-box">
  <div class="fm-header">
    <span>${t("file-manager-title")}</span>
    <button class="fm-close-x">&times;</button>
  </div>
  <div class="fm-actions-top">
    <button class="btn-sm btn-primary" id="fm-new-btn">${t("file-manager-new")}</button>
  </div>
  <div class="fm-list" id="fm-list">${rebuildList()}</div>
  <div class="fm-footer">
    <button class="btn-sm fm-close-x">${t("file-manager-close")}</button>
  </div>
</div>`;

    const close = () => overlay.remove();
    overlay.querySelectorAll(".fm-close-x").forEach(b => b.addEventListener("click", close));
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

    overlay.querySelector("#fm-new-btn").addEventListener("click", () => {
        const name = prompt(t("file-manager-name-prompt"), t("file-manager-default-name"));
        if (!name?.trim()) return;
        const id = createGenealogyFile(name.trim());
        showToast(t("toast-file-created").replace("{name}", name.trim()));
        switchToFile(id);
        close();
    });

    overlay.querySelector("#fm-list").addEventListener("click", e => {
        const btn = e.target.closest(".fm-action");
        if (!btn) return;
        const { action, id } = btn.dataset;
        const entry = loadFileList().find(f => f.id === id);

        if (action === "switch") {
            switchToFile(id);
            showToast(t("toast-file-switched").replace("{name}", entry?.name || ""));
            close();
        } else if (action === "rename") {
            const newName = prompt(t("file-manager-rename-prompt"), entry?.name || "");
            if (!newName?.trim()) return;
            renameGenealogyFile(id, newName.trim());
            if (id === currentFileId) updateFileNameDisplay();
            showToast(t("toast-file-renamed").replace("{name}", newName.trim()));
            overlay.querySelector("#fm-list").innerHTML = rebuildList();
        } else if (action === "delete") {
            const allFiles = loadFileList();
            if (allFiles.length <= 1) { showToast(t("toast-file-last")); return; }
            if (!confirm(t("confirm-delete-file").replace("{name}", entry?.name || id))) return;
            if (id === currentFileId) {
                const other = allFiles.find(f => f.id !== id);
                if (other) switchToFile(other.id);
            }
            deleteGenealogyById(id);
            showToast(t("toast-file-deleted").replace("{name}", entry?.name || ""));
            overlay.querySelector("#fm-list").innerHTML = rebuildList();
        }
    });

    document.body.appendChild(overlay);
}

function escHtmlFm(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
            const fm = document.getElementById("fm-overlay");
            if (fm) { fm.remove(); return; }
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

    let touchStart = null, pinchDist = null, pinchScaleStart = null;
    svg.addEventListener("touchstart", e => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchDist = Math.sqrt(dx * dx + dy * dy);
            pinchScaleStart = svgScale;
            touchStart = null;
        } else if (e.touches.length === 1) {
            touchStart = { x: e.touches[0].clientX - svgPanOffset.x, y: e.touches[0].clientY - svgPanOffset.y };
        }
    }, { passive: true });

    svg.addEventListener("touchmove", e => {
        if (e.touches.length === 2 && pinchDist !== null) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            svgScale = Math.max(0.2, Math.min(3, pinchScaleStart * (Math.sqrt(dx*dx+dy*dy) / pinchDist)));
            applyTransform();
        } else if (touchStart && e.touches.length === 1) {
            svgPanOffset = { x: e.touches[0].clientX - touchStart.x, y: e.touches[0].clientY - touchStart.y };
            applyTransform();
        }
    }, { passive: false });

    svg.addEventListener("touchend", e => {
        if (e.touches.length < 2) pinchDist = null;
        if (e.touches.length === 0) touchStart = null;
    });

    document.getElementById("btn-zoom-in").addEventListener("click",    () => { svgScale = Math.min(3, svgScale * 1.2); applyTransform(); });
    document.getElementById("btn-zoom-out").addEventListener("click",   () => { svgScale = Math.max(0.2, svgScale / 1.2); applyTransform(); });
    document.getElementById("btn-zoom-reset").addEventListener("click", () => { svgScale = 1; svgPanOffset = { x: 0, y: 0 }; applyTransform(); });
}

function applyTransform() {
    const svg = document.getElementById("tree-area");
    svg.style.transform = `translate(${svgPanOffset.x}px, ${svgPanOffset.y}px) scale(${svgScale})`;
    svg.style.transformOrigin = "center center";
}
