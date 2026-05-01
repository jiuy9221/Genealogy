// modules/ui.js - UI 渲染与事件绑定

let _data = null;
let _selectedId = null;
let _onDataChange = null;
let _searchQuery = "";

// ─── 初始化 ────────────────────────────────────────────────────────────
function init(data, onDataChange) {
    _data = data;
    _onDataChange = onDataChange;
    bindButtons();
}

function bindButtons() {
    document.getElementById("btn-add-person").addEventListener("click", showAddPersonModal);
    document.getElementById("btn-export-json").addEventListener("click", () => { exportJSON(_data); showToast("JSON 已导出"); });
    document.getElementById("btn-export-md").addEventListener("click",   () => { exportMarkdown(_data); showToast("Markdown 已导出"); });
    document.getElementById("btn-import-json").addEventListener("click", () => triggerFileInput("application/json", importJSONWithDialog));
    document.getElementById("btn-import-md").addEventListener("click",   () => triggerFileInput(".md,text/markdown", importMDWithDialog));
    document.getElementById("btn-reset").addEventListener("click", () => {
        if (confirm("确认清除所有数据？此操作不可恢复。")) {
            clearLocal();
            _data = { persons: [], relationships: [], marriages: [] };
            _onDataChange(_data);
            showToast("数据已清空");
        }
    });

    // 搜索框
    const searchInput = document.getElementById("person-search");
    searchInput.addEventListener("input", e => {
        _searchQuery = e.target.value.trim().toLowerCase();
        renderPersonList(_data);
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

    const bodyHTML = `
<div class="import-dialog">
  <p class="import-summary">
    检测到 <strong>${format}</strong> 文件，包含 <strong>${incomingCount}</strong> 位人员。
    ${existingCount > 0 ? `当前已有 <strong>${existingCount}</strong> 位人员数据。` : "当前暂无数据。"}
  </p>
  <div class="import-options">
    <label class="import-option">
      <input type="radio" name="import-mode" value="overwrite" ${existingCount === 0 ? "checked" : ""} />
      <span><strong>覆盖</strong>：清除现有数据，完整导入</span>
    </label>
    <label class="import-option">
      <input type="radio" name="import-mode" value="merge" ${existingCount > 0 ? "checked" : ""} />
      <span><strong>合并</strong>：保留现有数据，追加导入人员与关系</span>
    </label>
  </div>
</div>`;

    showModal(`导入 ${format}`, bodyHTML, () => {
        const mode = document.querySelector('input[name="import-mode"]:checked')?.value || "overwrite";
        if (mode === "overwrite") {
            _data = parsed;
        } else {
            // 合并：按 ID 去重追加
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
        _onDataChange(_data);
        showToast(`${format} 已${mode === "overwrite" ? "覆盖" : "合并"}导入（${parsed.persons.length} 人）`);
    }, "导入");
}

// ─── 人员列表渲染（含搜索过滤）────────────────────────────────────────
function renderPersonList(data) {
    _data = data;
    const list = document.getElementById("person-list");
    list.innerHTML = "";

    let persons = data.persons;
    if (_searchQuery) {
        persons = persons.filter(p => p.name.toLowerCase().includes(_searchQuery));
    }

    document.getElementById("person-count").textContent = data.persons.length;

    if (!persons.length) {
        const li = document.createElement("li");
        li.className = "empty-hint";
        li.textContent = _searchQuery ? "无匹配结果" : "暂无人员";
        list.appendChild(li);
        return;
    }

    // 按姓名排序
    const sorted = [...persons].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    sorted.forEach(p => {
        const li = document.createElement("li");
        li.className = "person-item" + (p.id === _selectedId ? " selected" : "");
        li.dataset.id = p.id;

        const gTag = p.gender === "male"
            ? '<span class="tag male">男</span>'
            : p.gender === "female"
                ? '<span class="tag female">女</span>'
                : '<span class="tag">?</span>';

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
    if (!p) { panel.innerHTML = "<p class='placeholder'>请选择人员</p>"; return; }

    const parents  = _data.relationships.filter(r => r.child === id).map(r => _data.persons.find(x => x.id === r.parent)).filter(Boolean);
    const children = _data.relationships.filter(r => r.parent === id).map(r => _data.persons.find(x => x.id === r.child)).filter(Boolean);
    const spouses  = _data.marriages
        .filter(m => m.spouse1 === id || m.spouse2 === id)
        .map(m => _data.persons.find(x => x.id === (m.spouse1 === id ? m.spouse2 : m.spouse1)))
        .filter(Boolean);

    const otherOptions = _data.persons.filter(x => x.id !== id)
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
        .map(x => `<option value="${x.id}">${x.name}</option>`).join("");

    const genderLabel = p.gender === "male" ? "男" : p.gender === "female" ? "女" : "未知";
    const genderClass = p.gender === "male" ? "male" : p.gender === "female" ? "female" : "";
    const age = (() => {
        if (!p.birth) return "";
        const by = parseInt(p.birth);
        if (isNaN(by)) return "";
        const ey = p.death ? parseInt(p.death) : new Date().getFullYear();
        return `（${ey - by} 岁）`;
    })();

    panel.innerHTML = `
<div class="editor-section">
  <div class="editor-header">
    <div>
      <h4>${p.name} <span class="tag ${genderClass}">${genderLabel}</span></h4>
      ${age ? `<div class="age-hint">${age}</div>` : ""}
    </div>
    <div class="editor-actions">
      <button class="btn-sm btn-primary" onclick="showEditPersonModal('${id}')">编辑</button>
      <button class="btn-sm btn-danger"  onclick="confirmDeletePerson('${id}')">删除</button>
    </div>
  </div>
  <table class="info-table">
    <tr><td>出生</td><td>${p.birth || "不详"}</td></tr>
    ${p.death ? `<tr><td>逝世</td><td>${p.death}</td></tr>` : ""}
    ${p.notes ? `<tr><td>备注</td><td class="notes-cell">${p.notes}</td></tr>` : ""}
  </table>
</div>

<div class="editor-section">
  <h5>父母 <span class="count-badge small">${parents.length}</span></h5>
  <ul class="rel-list">
    ${parents.map(par => `<li><span>${par.name}</span><button class="btn-xs btn-danger" onclick="doRemoveRelationship('${par.id}','${id}')">移除</button></li>`).join("") || "<li class='empty'>暂无</li>"}
  </ul>
  <div class="rel-add-row">
    <select id="sel-parent"><option value="">— 选择父母 —</option>${otherOptions}</select>
    <button class="btn-sm btn-primary" onclick="doAddParent('${id}')">添加</button>
  </div>
</div>

<div class="editor-section">
  <h5>子女 <span class="count-badge small">${children.length}</span></h5>
  <ul class="rel-list">
    ${children.map(ch => `<li><span>${ch.name}</span><button class="btn-xs btn-danger" onclick="doRemoveRelationship('${id}','${ch.id}')">移除</button></li>`).join("") || "<li class='empty'>暂无</li>"}
  </ul>
  <div class="rel-add-row">
    <select id="sel-child"><option value="">— 选择子女 —</option>${otherOptions}</select>
    <button class="btn-sm btn-primary" onclick="doAddChild('${id}')">添加</button>
  </div>
</div>

<div class="editor-section">
  <h5>配偶 <span class="count-badge small">${spouses.length}</span></h5>
  <ul class="rel-list">
    ${spouses.map(sp => `<li><span>${sp.name}</span><button class="btn-xs btn-danger" onclick="doRemoveMarriage('${id}','${sp.id}')">移除</button></li>`).join("") || "<li class='empty'>暂无</li>"}
  </ul>
  <div class="rel-add-row">
    <select id="sel-spouse"><option value="">— 选择配偶 —</option>${otherOptions}</select>
    <button class="btn-sm btn-primary" onclick="doAddSpouse('${id}')">添加</button>
  </div>
</div>
`;
}

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
    if (!confirm(`确认删除「${p?.name}」？`)) return;
    deletePerson(_data, id);
    _selectedId = null;
    _onDataChange(_data);
    document.getElementById("person-editor").innerHTML = "<p class='placeholder'>请选择人员</p>";
    showToast(`已删除「${p?.name}」`);
};

// ─── 新增 / 编辑人员模态框 ────────────────────────────────────────────
function showAddPersonModal() {
    showModal("新增人员", buildPersonForm(null), data => {
        addPerson(_data, data);
        _onDataChange(_data);
        showToast(`已添加「${data.name}」`);
    });
}
window.showEditPersonModal = function(id) {
    const p = _data.persons.find(x => x.id === id);
    showModal("编辑人员", buildPersonForm(p), data => {
        updatePerson(_data, id, data);
        _onDataChange(_data);
        renderPersonEditor(id);
        showToast(`已更新「${data.name}」`);
    });
};

function buildPersonForm(p) {
    return `
<div class="form-group">
  <label>姓名 *</label>
  <input id="f-name" type="text" value="${p?.name || ""}" placeholder="请输入姓名" autofocus />
</div>
<div class="form-row">
  <div class="form-group half">
    <label>性别</label>
    <select id="f-gender">
      <option value="">未知</option>
      <option value="male"   ${p?.gender === "male"   ? "selected" : ""}>男</option>
      <option value="female" ${p?.gender === "female" ? "selected" : ""}>女</option>
    </select>
  </div>
</div>
<div class="form-row">
  <div class="form-group half">
    <label>出生日期</label>
    <input id="f-birth" type="date" value="${p?.birth || ""}" />
  </div>
  <div class="form-group half">
    <label>逝世日期</label>
    <input id="f-death" type="date" value="${p?.death || ""}" />
  </div>
</div>
<div class="form-group">
  <label>备注</label>
  <textarea id="f-notes" rows="3" placeholder="职位、籍贯、其他信息…">${p?.notes || ""}</textarea>
</div>`;
}

// ─── 模态框系统 ─────────────────────────────────────────────────────
function showModal(title, bodyHTML, onConfirm, confirmLabel = "确认") {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHTML;
    document.getElementById("modal-overlay").style.display = "flex";
    document.getElementById("modal-confirm").textContent = confirmLabel;

    // 重置确认按钮事件
    const old = document.getElementById("modal-confirm");
    const btn = old.cloneNode(true);
    old.parentNode.replaceChild(btn, old);
    btn.addEventListener("click", () => {
        // 若有表单则验证姓名
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
                notes:  document.getElementById("f-notes")?.value.trim() || ""
            });
        } else {
            onConfirm();
        }
        closeModal();
    });

    // 聚焦第一个输入框
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

// 供外部调用
window.showToast = showToast;
function getSelectedId() { return _selectedId; }
