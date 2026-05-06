// modules/ui.js - UI 渲染与事件绑定

let _data = null;
let _selectedId = null;
let _onDataChange = null;
let _searchQuery = "";

function _escHtml(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
// Fix: expose for legacy inline usage in buildPersonForm
window.escHtml = _escHtml;

// ─── 初始化 ────────────────────────────────────────────────────────────
function init(data, onDataChange) {
    _data = data;
    _onDataChange = onDataChange;
    bindButtons();
}

function bindButtons() {
    document.getElementById("btn-add-person").addEventListener("click", showAddPersonModal);
    document.getElementById("btn-export-json").addEventListener("click", () => { exportJSON(_data); showToast(t("toast-json-exported")); });
    document.getElementById("btn-export-md").addEventListener("click",   () => { exportMarkdown(_data); showToast(t("toast-md-exported")); });
    document.getElementById("btn-import-json").addEventListener("click", () => triggerFileInput("application/json", importJSONWithDialog));
    document.getElementById("btn-import-md").addEventListener("click",   () => triggerFileInput(".md,text/markdown", importMDWithDialog));
    document.getElementById("btn-reset").addEventListener("click", () => {
        if (confirm(t("confirm-clear"))) {
            clearLocal();
            _data = { persons: [], relationships: [], marriages: [] };
            _onDataChange(_data);
            showToast(t("toast-cleared"));
        }
    });

    // 搜索框
    const searchInput = document.getElementById("person-search");
    searchInput.addEventListener("input", e => {
        _searchQuery = e.target.value.trim().toLowerCase();
        renderPersonList(_data);
    });
    // Arrow key navigation from search input
    searchInput.addEventListener("keydown", e => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
        const items = [...document.querySelectorAll("#person-list .person-item")];
        if (!items.length) return;
        e.preventDefault();
        if (e.key === "Enter") {
            const sel = items.find(el => el.classList.contains("selected"));
            if (sel) sel.click();
            return;
        }
        const cur = items.findIndex(el => el.classList.contains("selected"));
        let next = e.key === "ArrowDown" ? cur + 1 : cur - 1;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        items[next].click();
        items[next].scrollIntoView({ block: "nearest" });
    });

    // 模态框关闭
    document.getElementById("modal-overlay").addEventListener("click", e => {
        if (e.target === document.getElementById("modal-overlay")) closeModal();
    });
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
}

// ─── 文件触发 & 导入 ──────────────────────────────────────────────────
function triggerFileInput(accept, callback) {
    const input = document.createElement("input");
    input.type = "file"; input.accept = accept;
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => callback(ev.target.result);
        reader.readAsText(file, "UTF-8");
    };
    input.click();
}

function importJSONWithDialog(text) {
    try {
        const parsed = JSON.parse(text);
        if (!parsed.persons) throw new Error("无效的 JSON 格式");
        showImportDialog(parsed, "JSON");
    } catch (e) { alert("JSON 导入失败：" + e.message); }
}

function importMDWithDialog(text) {
    try {
        const parsed = parseMarkdown(text);
        showImportDialog(parsed, "Markdown");
    } catch (e) { alert("Markdown 导入失败：" + e.message); }
}

// 导入确认对话框（合并/覆盖）
function showImportDialog(parsed, format) {
    const existingCount = _data.persons.length;
    const incomingCount = parsed.persons.length;
    const existingInfo = existingCount > 0
        ? `${t("import-existing-prefix")} <strong>${existingCount}</strong> ${t("import-existing-suffix")}`
        : t("import-no-existing");

    const bodyHTML = `
<div class="import-dialog">
  <p class="import-summary">
    ${t("import-title-prefix")}<strong>${format}</strong>，包含 <strong>${incomingCount}</strong> ${t("import-persons-unit")}。
    ${existingInfo}
  </p>
  <div class="import-options">
    <label class="import-option">
      <input type="radio" name="import-mode" value="overwrite" ${existingCount === 0 ? "checked" : ""} />
      <span><strong>${t("import-overwrite")}</strong>：${t("import-overwrite-desc")}</span>
    </label>
    <label class="import-option">
      <input type="radio" name="import-mode" value="merge" ${existingCount > 0 ? "checked" : ""} />
      <span><strong>${t("import-merge")}</strong>：${t("import-merge-desc")}</span>
    </label>
  </div>
</div>`;

    showModal(`${t("import-title-prefix")}${format}`, bodyHTML, () => {
        const mode = document.querySelector('input[name="import-mode"]:checked')?.value || "overwrite";
        if (mode === "overwrite") {
            _data = parsed;
        } else {
            const existingIds = new Set(_data.persons.map(p => p.id));
            parsed.persons.forEach(p => {
                if (!existingIds.has(p.id)) _data.persons.push(p);
            });
            parsed.relationships.forEach(r => {
                const dup = _data.relationships.some(x => x.parent === r.parent && x.child === r.child);
                if (!dup) _data.relationships.push(r);
            });
            parsed.marriages.forEach(m => {
                const dup = _data.marriages.some(x =>
                    (x.spouse1 === m.spouse1 && x.spouse2 === m.spouse2) ||
                    (x.spouse1 === m.spouse2 && x.spouse2 === m.spouse1)
                );
                if (!dup) _data.marriages.push(m);
            });
        }
        const modeLabel = mode === "overwrite" ? t("import-overwrite-toast") : t("import-merge-toast");
        _onDataChange(_data);
        showToast(`${format} 已${modeLabel}导入（${parsed.persons.length} ${t("import-persons-unit")}）`);
    }, t("import-overwrite"));
}

// ─── 人员列表渲染（含搜索过滤）────────────────────────────────────────
function renderPersonList(data) {
    _data = data;
    const list = document.getElementById("person-list");
    list.innerHTML = "";

    let persons = data.persons;
    if (_searchQuery) {
        persons = persons.filter(p => {
            if (p.name.toLowerCase().includes(_searchQuery)) return true;
            const initials = getPinyinInitials(p.name);
            return initials.includes(_searchQuery);
        });
    }

    document.getElementById("person-count").textContent = data.persons.length;

    // Update search count indicator
    const countEl = document.getElementById("search-count");
    if (countEl) {
        if (_searchQuery) {
            countEl.textContent = t("search-count-filtered")
                .replace("{f}", persons.length)
                .replace("{n}", data.persons.length);
            countEl.style.display = "block";
        } else {
            countEl.style.display = "none";
        }
    }

    if (!persons.length) {
        const li = document.createElement("li");
        li.className = "empty-hint";
        li.textContent = _searchQuery ? t("no-match") : t("no-people");
        list.appendChild(li);
        return;
    }

    const sorted = [...persons].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    sorted.forEach(p => {
        const li = document.createElement("li");
        li.className = "person-item" + (p.id === _selectedId ? " selected" : "");
        li.dataset.id = p.id;

        const gTag = p.gender === "male"
            ? `<span class="tag male">${t("tag-male")}</span>`
            : p.gender === "female"
                ? `<span class="tag female">${t("tag-female")}</span>`
                : `<span class="tag">${t("tag-unknown")}</span>`;

        const birthYr = p.birth ? `<span class="person-birth">${p.birth.slice(0, 4)}</span>` : "";
        li.innerHTML = `<span class="person-name">${_searchQuery ? highlightMatch(p.name, _searchQuery) : p.name}</span>${birthYr}${gTag}`;
        li.addEventListener("click", () => selectPerson(p.id));
        list.appendChild(li);
    });
}

// 高亮搜索关键字
function highlightMatch(name, query) {
    const idx = name.toLowerCase().indexOf(query);
    if (idx === -1) return name;
    return name.slice(0, idx) +
        `<mark>${name.slice(idx, idx + query.length)}</mark>` +
        name.slice(idx + query.length);
}

// ─── 选中人员 ─────────────────────────────────────────────────────────
function selectPerson(id) {
    _selectedId = id;
    document.querySelectorAll(".person-item").forEach(el => {
        el.classList.toggle("selected", el.dataset.id === id);
    });
    renderPersonEditor(id);
    if (window.highlightTreeNode) window.highlightTreeNode(id);
}

// ─── 右侧编辑面板 ─────────────────────────────────────────────────────
function renderPersonEditor(id) {
    const panel = document.getElementById("person-editor");
    const p = _data.persons.find(x => x.id === id);
    if (!p) { panel.innerHTML = `<p class='placeholder'>${t("editor-placeholder")}</p>`; return; }

    const parents  = _data.relationships.filter(r => r.child === id).map(r => _data.persons.find(x => x.id === r.parent)).filter(Boolean);
    const children = _data.relationships.filter(r => r.parent === id).map(r => _data.persons.find(x => x.id === r.child)).filter(Boolean);
    const spouses  = _data.marriages
        .filter(m => m.spouse1 === id || m.spouse2 === id)
        .map(m => _data.persons.find(x => x.id === (m.spouse1 === id ? m.spouse2 : m.spouse1)))
        .filter(Boolean);

    const otherOptions = _data.persons.filter(x => x.id !== id)
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
        .map(x => `<option value="${x.id}">${_escHtml(x.name)}</option>`).join("");

    const genderLabel = p.gender === "male" ? t("tag-male") : p.gender === "female" ? t("tag-female") : t("tag-unknown");
    const genderClass = p.gender === "male" ? "male" : p.gender === "female" ? "female" : "";
    const age = (() => {
        if (!p.birth) return "";
        const by = parseInt(p.birth);
        if (isNaN(by)) return "";
        const ey = p.death ? parseInt(p.death) : new Date().getFullYear();
        return `（${ey - by}${t("age-unit")}）`;
    })();

    const avatarBg    = p.gender === "male" ? "#dbeafe" : p.gender === "female" ? "#fce7f3" : "#f1f5f9";
    const avatarColor = p.gender === "male" ? "#1d4ed8" : p.gender === "female" ? "#db2777" : "#64748b";
    const avatarHtml  = p.photo
        ? `<img src="${p.photo}" class="editor-avatar-img" alt="头像" />`
        : `<div class="editor-avatar-initial" style="background:${avatarBg};color:${avatarColor}">${p.name.charAt(0)}</div>`;

    // 祖先路径
    const ancestorPath = getAncestorPath(_data, id);
    const pathHtml = buildAncestorPathHtml(ancestorPath, id);

    panel.innerHTML = `
<div class="editor-section">
  <div class="editor-header">
    <div class="editor-person-meta">
      ${avatarHtml}
      <div>
        <h4>${p.name} <span class="tag ${genderClass}">${genderLabel}</span></h4>
        ${age ? `<div class="age-hint">${age}</div>` : ""}
      </div>
    </div>
    <div class="editor-actions">
      <button class="btn-sm btn-primary" onclick="showEditPersonModal('${id}')">${t("editor-edit-btn")}</button>
      <button class="btn-sm btn-focus${window.isFocusActive && window.isFocusActive(id) ? " active" : ""}"
              onclick="window.toggleFocusMode && window.toggleFocusMode('${id}')"
              title="${t('focus-btn')}">🎯</button>
      <button class="btn-sm btn-danger"  onclick="confirmDeletePerson('${id}')">${t("editor-delete-btn")}</button>
    </div>
  </div>
  <table class="info-table">
    <tr><td>${t("editor-birth")}</td><td>${p.birth || t("birth-unknown")}</td></tr>
    ${p.death ? `<tr><td>${t("editor-death")}</td><td>${p.death}</td></tr>` : ""}
    ${p.notes ? `<tr><td>${t("editor-notes")}</td><td class="notes-cell">${p.notes}</td></tr>` : ""}
  </table>
</div>

${pathHtml}

<div class="editor-section">
  <h5>${t("editor-section-parents")} <span class="count-badge small">${parents.length}</span></h5>
  <ul class="rel-list">
    ${parents.map(par => `<li><span>${_escHtml(par.name)}</span><button class="btn-xs btn-danger" onclick="doRemoveRelationship('${par.id}','${id}')">${t("editor-remove-btn")}</button></li>`).join("") || `<li class='empty'>${t("empty-rel")}</li>`}
  </ul>
  <div class="rel-add-row">
    <select id="sel-parent"><option value="">${t("editor-select-parent")}</option>${otherOptions}</select>
    <button class="btn-sm btn-primary" onclick="doAddParent('${id}')">${t("editor-add-btn")}</button>
  </div>
</div>

<div class="editor-section">
  <h5>${t("editor-section-children")} <span class="count-badge small">${children.length}</span></h5>
  <ul class="rel-list">
    ${children.map(ch => `<li><span>${_escHtml(ch.name)}</span><button class="btn-xs btn-danger" onclick="doRemoveRelationship('${id}','${ch.id}')">${t("editor-remove-btn")}</button></li>`).join("") || `<li class='empty'>${t("empty-rel")}</li>`}
  </ul>
  <div class="rel-add-row">
    <select id="sel-child"><option value="">${t("editor-select-child")}</option>${otherOptions}</select>
    <button class="btn-sm btn-primary" onclick="doAddChild('${id}')">${t("editor-add-btn")}</button>
  </div>
</div>

<div class="editor-section">
  <h5>${t("editor-section-spouses")} <span class="count-badge small">${spouses.length}</span></h5>
  <ul class="rel-list">
    ${spouses.map(sp => `<li><span>${_escHtml(sp.name)}</span><button class="btn-xs btn-danger" onclick="doRemoveMarriage('${id}','${sp.id}')">${t("editor-remove-btn")}</button></li>`).join("") || `<li class='empty'>${t("empty-rel")}</li>`}
  </ul>
  <div class="rel-add-row">
    <select id="sel-spouse"><option value="">${t("editor-select-spouse")}</option>${otherOptions}</select>
    <button class="btn-sm btn-primary" onclick="doAddSpouse('${id}')">${t("editor-add-btn")}</button>
  </div>
</div>

${_buildEventsSection(p, id)}

${_buildMiniRelGraph(_data, id)}
`;
}

// 构建祖先路径 HTML（面包屑式）
function buildAncestorPathHtml(path, currentId) {
    if (!path || path.length <= 1) return ""; // 无祖先，不显示
    return `
<div class="editor-section ancestor-path-section">
  <h5>${t("editor-ancestor-path")} <span class="count-badge small">${path.length}</span></h5>
  <div class="ancestor-path">
    ${path.map((p, i) => {
        const isCurrent = p.id === currentId;
        const cls = isCurrent ? "anc-item anc-current" : "anc-item";
        const clickable = isCurrent ? "" : `onclick="selectPerson('${p.id}')"`;
        const sep = i < path.length - 1 ? `<span class="anc-arrow">›</span>` : "";
        return `<span class="${cls}" ${clickable}>${p.name}</span>${sep}`;
    }).join("")}
  </div>
</div>`;
}

// ─── 生平事件区块构建 ─────────────────────────────────────────────────
const EVENT_TYPES = ["birth","death","marriage","migration","education","career","other"];

function _buildEventsSection(p, id) {
    const events = (p.events || []).slice().sort((a, b) => {
        const ya = a.year ? parseInt(a.year) : Infinity;
        const yb = b.year ? parseInt(b.year) : Infinity;
        return ya - yb;
    });
    const typeOptions = EVENT_TYPES
        .map(tp => `<option value="${tp}">${t("event-type-" + tp)}</option>`)
        .join("");
    const listHtml = events.map(ev => `
<li class="event-item">
  <span class="event-year">${_escHtml(ev.year || "?")}</span>
  <span class="event-type-tag ev-${ev.type}">${t("event-type-" + ev.type)}</span>
  <span class="event-desc">${_escHtml(ev.desc)}</span>
  <button class="btn-xs btn-danger" onclick="doRemoveEvent('${id}','${ev.id}')">&times;</button>
</li>`).join("") || `<li class="empty">${t("empty-events")}</li>`;

    return `
<div class="editor-section">
  <h5>${t("editor-section-events")} <span class="count-badge small">${events.length}</span></h5>
  <ul class="events-list">${listHtml}</ul>
  <div class="event-add-row">
    <input id="ev-year-inp" type="text" class="ev-year-input" placeholder="${t("ev-year-placeholder")}" maxlength="4" />
    <select id="ev-type-sel" class="ev-type-select">${typeOptions}</select>
    <input id="ev-desc-inp" type="text" class="ev-desc-input" placeholder="${t("ev-desc-placeholder")}" />
    <button class="btn-sm btn-primary" onclick="doAddEvent('${id}')">${t("ev-add-btn")}</button>
  </div>
</div>`;
}

window.doAddEvent = function(personId) {
    const year = (document.getElementById("ev-year-inp")?.value || "").trim();
    const type = document.getElementById("ev-type-sel")?.value || "other";
    const desc = (document.getElementById("ev-desc-inp")?.value || "").trim();
    if (!desc && !year) return;
    addLifeEvent(_data, personId, { year, type, desc });
    _onDataChange(_data);
    renderPersonEditor(personId);
    showToast(t("toast-event-added"));
};

window.doRemoveEvent = function(personId, eventId) {
    removeLifeEvent(_data, personId, eventId);
    _onDataChange(_data);
    renderPersonEditor(personId);
    showToast(t("toast-event-removed"));
};

// ─── 关系操作（innerHTML onclick 调用需挂到 window）──────────────────
window.doAddParent = function(childId) {
    const v = document.getElementById("sel-parent")?.value;
    if (!v) return;
    addRelationship(_data, v, childId);
    _onDataChange(_data); renderPersonEditor(childId);
};
window.doAddChild = function(parentId) {
    const v = document.getElementById("sel-child")?.value;
    if (!v) return;
    addRelationship(_data, parentId, v);
    _onDataChange(_data); renderPersonEditor(parentId);
};
window.doAddSpouse = function(personId) {
    const v = document.getElementById("sel-spouse")?.value;
    if (!v) return;
    addMarriage(_data, personId, v);
    _onDataChange(_data); renderPersonEditor(personId);
};
window.doRemoveRelationship = function(parentId, childId) {
    removeRelationship(_data, parentId, childId);
    _onDataChange(_data); renderPersonEditor(_selectedId);
};
window.doRemoveMarriage = function(s1, s2) {
    removeMarriage(_data, s1, s2);
    _onDataChange(_data); renderPersonEditor(_selectedId);
};
window.confirmDeletePerson = function(id) {
    const p = _data.persons.find(x => x.id === id);
    if (!confirm(`${t("confirm-delete-prefix")}${p?.name}${t("confirm-delete-suffix")}`)) return;
    deletePerson(_data, id);
    _selectedId = null;
    _onDataChange(_data);
    document.getElementById("person-editor").innerHTML = `<p class='placeholder'>${t("editor-placeholder")}</p>`;
    showToast(`${t("confirm-delete-prefix")}${p?.name}${t("confirm-delete-suffix").replace("？","").replace("?","")}`);
};

// ─── 新增 / 编辑人员模态框 ────────────────────────────────────────────
function showAddPersonModal() {
    showModal(t("modal-add-person"), buildPersonForm(null), data => {
        addPerson(_data, data);
        _onDataChange(_data);
        showToast(`已添加「${data.name}」`);
    });
}
window.showEditPersonModal = function(id) {
    const p = _data.persons.find(x => x.id === id);
    showModal(t("modal-edit-person"), buildPersonForm(p), data => {
        updatePerson(_data, id, data);
        _onDataChange(_data);
        renderPersonEditor(id);
        showToast(`已更新「${data.name}」`);
    });
};

function buildPersonForm(p) {
    const escAttr = s => (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const initChar = p?.name?.charAt(0) || "?";
    const avatarContent = p?.photo
        ? `<img src="${escAttr(p.photo)}" alt="头像" />`
        : `<span class="avatar-initial">${escHtml(initChar)}</span>`;
    const clearBtn = p?.photo
        ? `<button type="button" class="btn-sm btn-danger-light" onclick="clearAvatar()">${t("clear-photo-btn")}</button>`
        : "";

    return `
<div class="form-group">
  <label>${t("form-name")}</label>
  <input id="f-name" type="text" value="${escAttr(p?.name)}" placeholder="${t("form-name-placeholder")}" autofocus />
</div>
<div class="form-row">
  <div class="form-group half">
    <label>${t("form-gender")}</label>
    <select id="f-gender">
      <option value="">${t("gender-unknown")}</option>
      <option value="male"   ${p?.gender === "male"   ? "selected" : ""}>${t("gender-male")}</option>
      <option value="female" ${p?.gender === "female" ? "selected" : ""}>${t("gender-female")}</option>
    </select>
  </div>
</div>
<div class="form-row">
  <div class="form-group half">
    <label>${t("form-birth")}</label>
    <input id="f-birth" type="text" value="${escAttr(p?.birth)}" placeholder="${t("form-birth-placeholder")}" />
  </div>
  <div class="form-group half">
    <label>${t("form-death")}</label>
    <input id="f-death" type="text" value="${escAttr(p?.death)}" placeholder="${t("form-death-placeholder")}" />
  </div>
</div>
<div class="form-group">
  <label>${t("form-photo")}</label>
  <div class="avatar-upload-area">
    <div class="avatar-preview-wrap" id="avatar-preview-wrap"
         onclick="document.getElementById('f-photo-file').click()" title="点击上传照片">
      ${avatarContent}
    </div>
    <div class="avatar-upload-btns">
      <button type="button" class="btn-sm" onclick="document.getElementById('f-photo-file').click()">${t("upload-photo-btn")}</button>
      ${clearBtn}
      <span class="avatar-size-hint">${t("photo-hint")}</span>
    </div>
    <input type="file" id="f-photo-file" accept="image/*" style="display:none"
           onchange="handleAvatarUpload(event)" />
  </div>
  <input type="hidden" id="f-photo" value="${escAttr(p?.photo)}" />
</div>
<div class="form-group">
  <label>${t("form-notes")}</label>
  <textarea id="f-notes" rows="3" placeholder="${t("form-notes-placeholder")}">${_escHtml(p?.notes)}</textarea>
</div>`;
}

// ─── 模态框系统 ─────────────────────────────────────────────────────
function showModal(title, bodyHTML, onConfirm, confirmLabel) {
    confirmLabel = confirmLabel || t("modal-confirm");
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHTML;
    document.getElementById("modal-overlay").style.display = "flex";
    document.getElementById("modal-confirm").textContent = confirmLabel;

    const old = document.getElementById("modal-confirm");
    const btn = old.cloneNode(true);
    old.parentNode.replaceChild(btn, old);
    btn.addEventListener("click", () => {
        const nameEl = document.getElementById("f-name");
        if (nameEl !== null) {
            const name = nameEl.value.trim();
            if (!name) { nameEl.focus(); nameEl.classList.add("input-error"); return; }
            nameEl.classList.remove("input-error");
            onConfirm({
                name,
                gender: document.getElementById("f-gender")?.value  || "",
                birth:  document.getElementById("f-birth")?.value   || "",
                death:  document.getElementById("f-death")?.value   || "",
                notes:  document.getElementById("f-notes")?.value.trim() || "",
                photo:  document.getElementById("f-photo")?.value   || ""
            });
        } else {
            onConfirm();
        }
        closeModal();
    });

    setTimeout(() => {
        const first = document.getElementById("modal-body").querySelector("input,select,textarea");
        if (first) first.focus();
    }, 50);
}

function closeModal() {
    document.getElementById("modal-overlay").style.display = "none";
}

// ─── Toast 通知 ─────────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => { toast.classList.add("toast-show"); });
    setTimeout(() => {
        toast.classList.remove("toast-show");
        setTimeout(() => container.removeChild(toast), 300);
    }, duration);
}

window.showToast = showToast;
function getSelectedId() { return _selectedId; }

// ─── 统计视图 ─────────────────────────────────────────────────────────
function showStatsModal() {
    const s = computeStats(_data);
    if (s.total === 0) { showToast(t("toast-no-stats")); return; }

    const pct = n => s.total ? Math.round(n / s.total * 100) : 0;
    const lifespanVal = s.avgLifespan !== null
        ? `${s.avgLifespan}<span class='stat-pct'> ${t("age-unit")}</span>`
        : "—";

    const bodyHTML = `
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-value">${s.total}</div>
    <div class="stat-label">${t("stats-total")}</div>
  </div>
  <div class="stat-card male">
    <div class="stat-value">${s.males} <span class="stat-pct">${pct(s.males)}%</span></div>
    <div class="stat-label">${t("stats-male")}</div>
  </div>
  <div class="stat-card female">
    <div class="stat-value">${s.females} <span class="stat-pct">${pct(s.females)}%</span></div>
    <div class="stat-label">${t("stats-female")}</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${s.generations}</div>
    <div class="stat-label">${t("stats-generations")}</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${s.marriages}</div>
    <div class="stat-label">${t("stats-marriages")}</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${lifespanVal}</div>
    <div class="stat-label">${t("stats-lifespan")}</div>
  </div>
</div>
${s.maxChildrenPerson ? `
<div class="stats-highlight">
  <span class="stats-hl-label">${t("stats-most-children")}</span>
  <strong>${s.maxChildrenPerson.name}</strong>&thinsp;——&thinsp;${s.maxChildren}${t("children-unit")}
</div>` : ""}
${s.oldest ? `
<div class="stats-highlight">
  <span class="stats-hl-label">${t("stats-oldest")}</span>
  <strong>${s.oldest.name}</strong>&thinsp;——&thinsp;${t("born-label")} ${s.oldest.birth.slice(0, 4)} 年
</div>` : ""}`;

    showModal(t("stats-title"), bodyHTML, () => {}, t("modal-cancel"));
}

// ─── 头像上传 & 清除 ────────────────────────────────────────────────────
window.handleAvatarUpload = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 307200) {
        showToast(t("toast-photo-toobig"), 3000);
        return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
        const dataUrl = ev.target.result;
        document.getElementById("f-photo").value = dataUrl;
        const wrap = document.getElementById("avatar-preview-wrap");
        if (wrap) wrap.innerHTML = `<img src="${dataUrl}" alt="头像" />`;
        showToast(t("toast-photo-upload"));
    };
    reader.readAsDataURL(file);
};

window.clearAvatar = function() {
    document.getElementById("f-photo").value = "";
    const wrap = document.getElementById("avatar-preview-wrap");
    const name = document.getElementById("f-name")?.value?.trim() || "?";
    if (wrap) wrap.innerHTML = `<span class="avatar-initial">${name.charAt(0) || "?"}</span>`;
};

// ─── 生成分享链接 ────────────────────────────────────────────────────────
function generateShareLink() {
    if (!_data || !_data.persons.length) {
        showToast(t("toast-no-data"));
        return;
    }
    const shareData = {
        persons:       _data.persons.map(p => ({ ...p, photo: "" })),
        relationships: _data.relationships,
        marriages:     _data.marriages
    };
    const json = JSON.stringify(shareData);
    try {
        const encoded = btoa(
            encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (m, p1) =>
                String.fromCharCode(parseInt(p1, 16))
            )
        );
        if (encoded.length > 60000) {
            showToast(t("toast-share-toobig"), 4000);
            return;
        }
        const url = location.href.split("#")[0] + "#share=" + encoded;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url)
                .then(() => showToast(t("toast-share-copied")))
                .catch(() => promptShareUrl(url));
        } else {
            promptShareUrl(url);
        }
    } catch {
        showToast(t("toast-share-fail"));
    }
}
function promptShareUrl(url) {
    const modal = document.createElement("div");
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:3000";
    modal.innerHTML = `<div style="background:var(--color-surface,#fff);border-radius:12px;padding:24px;width:480px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="font-weight:700;font-size:15px;margin-bottom:12px">${t("share-dialog-title")}</div>
      <textarea style="width:100%;height:80px;border:1.5px solid var(--color-border,#e0e3e8);border-radius:7px;padding:8px;font-size:12px;resize:none;background:var(--color-bg,#f4f6fa);color:var(--color-text,#1e293b)" readonly>${url}</textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <button style="padding:6px 18px;border:1px solid var(--color-border,#e0e3e8);border-radius:6px;cursor:pointer;font-size:13px">${t("share-dialog-close")}</button>
      </div>
    </div>`;
    modal.querySelector("button").onclick = () => document.body.removeChild(modal);
    modal.addEventListener("click", e => { if (e.target === modal) document.body.removeChild(modal); });
    document.body.appendChild(modal);
    modal.querySelector("textarea").select();
}
window.generateShareLink = generateShareLink;

// ─── 导出族谱树为 PNG ──────────────────────────────────────────────────
function exportTreeAsPNG() {
    const svg = document.getElementById("tree-area");
    const w = parseFloat(svg.getAttribute("width"))  || 0;
    const h = parseFloat(svg.getAttribute("height")) || 0;
    if (!w || !h) { showToast(t("toast-png-empty")); return; }

    const vb = (svg.getAttribute("viewBox") || "0 0 0 0").split(" ");
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("font-family", "Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif");

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", vb[0]); bg.setAttribute("y", vb[1]);
    bg.setAttribute("width", w); bg.setAttribute("height", h);
    bg.setAttribute("fill", document.body.classList.contains("dark-mode") ? "#0f172a" : "#f4f6fa");
    clone.insertBefore(bg, clone.firstChild);

    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url  = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
        const scale  = 2;
        const canvas = document.createElement("canvas");
        canvas.width  = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const dateStr = new Date().toLocaleDateString("zh-CN").replace(/\//g, "-");
        const a = document.createElement("a");
        a.download = `${t("app-title")}_${dateStr}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
        showToast(t("toast-png-done"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); showToast(t("toast-png-fail")); };
    img.src = url;
}

// ─── 迷你关系图（人员卡片内嵌 SVG）──────────────────────────────────────────
const MN_W = 76, MN_H = 28, MN_HG = 10, MN_VG = 40, MN_PAD = 14;

function _miniGenderClass(gender) {
    if (gender === "male")   return "mg-male";
    if (gender === "female") return "mg-female";
    return "mg-other";
}
function _miniBarColor(gender) {
    if (gender === "male")   return "#3b82f6";
    if (gender === "female") return "#ec4899";
    return "#94a3b8";
}

function _buildMiniRelGraph(data, focusId) {
    const focal = data.persons.find(x => x.id === focusId);
    if (!focal) return "";

    const parents = data.relationships
        .filter(r => r.child === focusId)
        .map(r => data.persons.find(x => x.id === r.parent))
        .filter(Boolean);

    const spouses = data.marriages
        .filter(m => m.spouse1 === focusId || m.spouse2 === focusId)
        .map(m => data.persons.find(x => x.id === (m.spouse1 === focusId ? m.spouse2 : m.spouse1)))
        .filter(Boolean);

    const children = data.relationships
        .filter(r => r.parent === focusId)
        .map(r => data.persons.find(x => x.id === r.child))
        .filter(Boolean);

    if (!parents.length && !spouses.length && !children.length) {
        return `<div class="editor-section mini-graph-section">
  <h5>${t("mini-graph-title")}</h5>
  <p class="mini-graph-empty">${t("mini-graph-no-rels")}</p>
</div>`;
    }

    // Rows: row-0 = parents (if any), row-1 = focal+spouses, row-2 = children (if any)
    const hasParents  = parents.length  > 0;
    const hasChildren = children.length > 0;
    const focalRow    = hasParents ? 1 : 0;
    const rows = [];
    if (hasParents)  rows.push({ row: 0,          persons: parents });
    rows.push(                  { row: focalRow,   persons: [focal, ...spouses] });
    if (hasChildren) rows.push( { row: focalRow + 1, persons: children });

    const maxCols = Math.max(...rows.map(r => r.persons.length));
    const numRows = focalRow + 1 + (hasChildren ? 1 : 0);
    const svgW    = Math.max(210, maxCols * (MN_W + MN_HG) - MN_HG + MN_PAD * 2);
    const svgH    = numRows * (MN_H + MN_VG) - MN_VG + MN_PAD * 2;

    // Compute node positions
    const pos = {};
    rows.forEach(({ row, persons }) => {
        const rowW   = persons.length * MN_W + (persons.length - 1) * MN_HG;
        const startX = (svgW - rowW) / 2;
        persons.forEach((person, i) => {
            if (!person) return;
            pos[person.id] = {
                x: startX + i * (MN_W + MN_HG),
                y: MN_PAD + row * (MN_H + MN_VG)
            };
        });
    });

    const LC = "#94a3b8"; // line color (overridden by CSS for dark mode via class)
    let lines = "";
    let nodes = "";

    // Parents → focal connecting lines
    if (hasParents) {
        const fp = pos[focusId];
        const pps = parents.map(pr => pos[pr.id]).filter(Boolean);
        if (fp && pps.length) {
            const botY  = pps[0].y + MN_H;
            const topY  = fp.y;
            const midY  = botY + (topY - botY) * 0.5;
            const fcx   = fp.x + MN_W / 2;
            if (pps.length === 1) {
                const px = pps[0].x + MN_W / 2;
                lines += `<line x1="${px}" y1="${botY}" x2="${fcx}" y2="${topY}" class="mg-line"/>`;
            } else {
                const lx = Math.min(...pps.map(p => p.x + MN_W / 2));
                const rx = Math.max(...pps.map(p => p.x + MN_W / 2));
                pps.forEach(p => {
                    lines += `<line x1="${p.x + MN_W / 2}" y1="${botY}" x2="${p.x + MN_W / 2}" y2="${midY}" class="mg-line"/>`;
                });
                lines += `<line x1="${lx}" y1="${midY}" x2="${rx}" y2="${midY}" class="mg-line"/>`;
                lines += `<line x1="${fcx}" y1="${midY}" x2="${fcx}" y2="${topY}" class="mg-line"/>`;
            }
        }
    }

    // Focal ↔ spouses (dashed purple)
    const fp = pos[focusId];
    spouses.forEach(sp => {
        const spp = pos[sp.id];
        if (!fp || !spp) return;
        const y  = fp.y + MN_H / 2;
        const x1 = Math.min(fp.x + MN_W, spp.x);
        const x2 = Math.max(fp.x + MN_W, spp.x);
        lines += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="mg-line-spouse"/>`;
    });

    // Focal → children connecting lines
    if (hasChildren) {
        const fpp = pos[focusId];
        const cps = children.map(ch => pos[ch.id]).filter(Boolean);
        if (fpp && cps.length) {
            const botY = fpp.y + MN_H;
            const topY = cps[0].y;
            const midY = botY + (topY - botY) * 0.5;
            const fcx  = fpp.x + MN_W / 2;
            if (cps.length === 1) {
                const cx = cps[0].x + MN_W / 2;
                lines += `<line x1="${fcx}" y1="${botY}" x2="${cx}" y2="${topY}" class="mg-line"/>`;
            } else {
                const lx = Math.min(...cps.map(p => p.x + MN_W / 2));
                const rx = Math.max(...cps.map(p => p.x + MN_W / 2));
                lines += `<line x1="${fcx}" y1="${botY}" x2="${fcx}" y2="${midY}" class="mg-line"/>`;
                lines += `<line x1="${lx}" y1="${midY}" x2="${rx}" y2="${midY}" class="mg-line"/>`;
                cps.forEach(p => {
                    lines += `<line x1="${p.x + MN_W / 2}" y1="${midY}" x2="${p.x + MN_W / 2}" y2="${topY}" class="mg-line"/>`;
                });
            }
        }
    }

    // Build node SVG elements
    const allPersons = [...parents, focal, ...spouses, ...children];
    allPersons.forEach(person => {
        if (!person) return;
        const p = pos[person.id];
        if (!p) return;
        const isFocal  = person.id === focusId;
        const gcls     = _miniGenderClass(person.gender);
        const bar      = _miniBarColor(person.gender);
        const clickAttr = isFocal ? "" : `onclick="selectPerson('${person.id}')"`;
        const name     = person.name.length > 5 ? person.name.slice(0, 5) + "…" : person.name;
        const birthYr  = person.birth ? person.birth.slice(0, 4) : "";
        const nodeCls  = `mg-node ${isFocal ? "mg-focal" : "mg-clickable"}`;

        nodes += `<g class="${nodeCls}" ${clickAttr}>
  <title>${_escHtml(person.name)}${birthYr ? " b." + birthYr : ""}</title>
  <rect x="${p.x}" y="${p.y}" width="${MN_W}" height="${MN_H}" rx="6" ry="6"
        class="mg-rect ${gcls}${isFocal ? " mg-focal-rect" : ""}"/>
  <rect x="${p.x}" y="${p.y}" width="${MN_W}" height="3" rx="3" ry="3"
        fill="${bar}" class="mg-bar"/>
  <text x="${p.x + 5}" y="${p.y + 18}" class="mg-name${isFocal ? " mg-focal-name" : ""}"
        font-size="10" font-family="Arial,'PingFang SC','Microsoft YaHei',sans-serif">${_escHtml(name)}</text>
  ${birthYr ? `<text x="${p.x + MN_W - 3}" y="${p.y + 26}" class="mg-year"
        font-size="8" text-anchor="end" font-family="Arial,sans-serif">${birthYr}</text>` : ""}
</g>`;
    });

    return `
<div class="editor-section mini-graph-section">
  <h5>${t("mini-graph-title")}</h5>
  <div class="mini-graph-wrap">
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${svgW}" height="${svgH}"
         viewBox="0 0 ${svgW} ${svgH}"
         class="mini-graph-svg">
      ${lines}${nodes}
    </svg>
  </div>
</div>`;
}

// selectPerson 供外部调用
window.selectPerson = selectPerson;
