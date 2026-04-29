// modules/ui.js - UI 渲染与事件绑定

let _data = null;
let _selectedId = null;
let _onDataChange = null;

function init(data, onDataChange) {
    _data = data;
    _onDataChange = onDataChange;
    bindButtons();
}

function bindButtons() {
    document.getElementById("btn-add-person").addEventListener("click", showAddPersonModal);
    document.getElementById("btn-export-json").addEventListener("click", () => exportJSON(_data));
    document.getElementById("btn-export-md").addEventListener("click", () => exportMarkdown(_data));
    document.getElementById("btn-import-json").addEventListener("click", () => triggerFileInput("application/json", importJSON));
    document.getElementById("btn-import-md").addEventListener("click", () => triggerFileInput(".md,text/markdown", importMD));
    document.getElementById("btn-reset").addEventListener("click", () => {
        if (confirm("确认清除所有数据？此操作不可恢复。")) {
            clearLocal();
            _data = { persons: [], relationships: [], marriages: [] };
            _onDataChange(_data);
        }
    });

    // 模态框关闭
    document.getElementById("modal-overlay").addEventListener("click", e => {
        if (e.target === document.getElementById("modal-overlay")) closeModal();
    });
    document.getElementById("modal-close").addEventListener("click", closeModal);
}

function triggerFileInput(accept, callback) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => callback(ev.target.result);
        reader.readAsText(file, "UTF-8");
    };
    input.click();
}

function importJSON(text) {
    try {
        const parsed = JSON.parse(text);
        if (!parsed.persons) throw new Error("无效的 JSON 格式");
        _data = parsed;
        _onDataChange(_data);
    } catch (e) {
        alert("JSON 导入失败：" + e.message);
    }
}

function importMD(text) {
    try {
        const parsed = parseMarkdown(text);
        _data = parsed;
        _onDataChange(_data);
    } catch (e) {
        alert("Markdown 导入失败：" + e.message);
    }
}

// --- 人员列表渲染 ---
function renderPersonList(data) {
    _data = data;
    const list = document.getElementById("person-list");
    list.innerHTML = "";

    if (!data.persons.length) {
        list.innerHTML = '<li class="empty-hint">暂无人员</li>';
        return;
    }

    data.persons.forEach(p => {
        const li = document.createElement("li");
        li.className = "person-item" + (p.id === _selectedId ? " selected" : "");
        li.dataset.id = p.id;
        const genderTag = p.gender === "male" ? '<span class="tag male">男</span>' : p.gender === "female" ? '<span class="tag female">女</span>' : '<span class="tag">?</span>';
        li.innerHTML = `<span class="person-name">${p.name}</span>${genderTag}`;
        li.addEventListener("click", () => selectPerson(p.id));
        list.appendChild(li);
    });
}

// --- 选中人员 ---
function selectPerson(id) {
    _selectedId = id;
    document.querySelectorAll(".person-item").forEach(el => {
        el.classList.toggle("selected", el.dataset.id === id);
    });
    renderPersonEditor(id);
    if (window.highlightTreeNode) window.highlightTreeNode(id);
}

// --- 右侧编辑面板 ---
function renderPersonEditor(id) {
    const panel = document.getElementById("person-editor");
    const p = _data.persons.find(x => x.id === id);
    if (!p) { panel.innerHTML = "<p class='placeholder'>请选择人员</p>"; return; }

    const parents = _data.relationships.filter(r => r.child === id).map(r => _data.persons.find(x => x.id === r.parent)).filter(Boolean);
    const children = _data.relationships.filter(r => r.parent === id).map(r => _data.persons.find(x => x.id === r.child)).filter(Boolean);
    const spouses = _data.marriages.filter(m => m.spouse1 === id || m.spouse2 === id).map(m => {
        const sid = m.spouse1 === id ? m.spouse2 : m.spouse1;
        return _data.persons.find(x => x.id === sid);
    }).filter(Boolean);

    const otherPersonsOptions = _data.persons.filter(x => x.id !== id)
        .map(x => `<option value="${x.id}">${x.name}</option>`).join("");

    panel.innerHTML = `
<div class="editor-section">
  <div class="editor-header">
    <h4>${p.name}</h4>
    <div class="editor-actions">
      <button class="btn-sm btn-primary" onclick="showEditPersonModal('${id}')">编辑</button>
      <button class="btn-sm btn-danger" onclick="confirmDeletePerson('${id}')">删除</button>
    </div>
  </div>
  <table class="info-table">
    <tr><td>性别</td><td>${p.gender === "male" ? "男" : p.gender === "female" ? "女" : "未知"}</td></tr>
    <tr><td>出生</td><td>${p.birth || "不详"}</td></tr>
    ${p.death ? `<tr><td>死亡</td><td>${p.death}</td></tr>` : ""}
    ${p.notes ? `<tr><td>备注</td><td>${p.notes}</td></tr>` : ""}
  </table>
</div>

<div class="editor-section">
  <h5>父母 <span class="count">${parents.length}</span></h5>
  <ul class="rel-list">
    ${parents.map(par => `<li>${par.name} <button class="btn-xs btn-danger" onclick="doRemoveRelationship('${par.id}','${id}')">移除</button></li>`).join("") || "<li class='empty'>暂无</li>"}
  </ul>
  <select id="sel-parent"><option value="">-- 选择父母 --</option>${otherPersonsOptions}</select>
  <button class="btn-sm" onclick="doAddParent('${id}')">添加父母</button>
</div>

<div class="editor-section">
  <h5>子女 <span class="count">${children.length}</span></h5>
  <ul class="rel-list">
    ${children.map(ch => `<li>${ch.name} <button class="btn-xs btn-danger" onclick="doRemoveRelationship('${id}','${ch.id}')">移除</button></li>`).join("") || "<li class='empty'>暂无</li>"}
  </ul>
  <select id="sel-child"><option value="">-- 选择子女 --</option>${otherPersonsOptions}</select>
  <button class="btn-sm" onclick="doAddChild('${id}')">添加子女</button>
</div>

<div class="editor-section">
  <h5>配偶 <span class="count">${spouses.length}</span></h5>
  <ul class="rel-list">
    ${spouses.map(sp => `<li>${sp.name} <button class="btn-xs btn-danger" onclick="doRemoveMarriage('${id}','${sp.id}')">移除</button></li>`).join("") || "<li class='empty'>暂无</li>"}
  </ul>
  <select id="sel-spouse"><option value="">-- 选择配偶 --</option>${otherPersonsOptions}</select>
  <button class="btn-sm" onclick="doAddSpouse('${id}')">添加配偶</button>
</div>
`;
}

// --- 关系操作（全局函数供 innerHTML onclick 调用）---
window.doAddParent = function(childId) {
    const sel = document.getElementById("sel-parent");
    if (!sel.value) return;
    addRelationship(_data, sel.value, childId);
    _onDataChange(_data);
    renderPersonEditor(childId);
};

window.doAddChild = function(parentId) {
    const sel = document.getElementById("sel-child");
    if (!sel.value) return;
    addRelationship(_data, parentId, sel.value);
    _onDataChange(_data);
    renderPersonEditor(parentId);
};

window.doAddSpouse = function(personId) {
    const sel = document.getElementById("sel-spouse");
    if (!sel.value) return;
    addMarriage(_data, personId, sel.value);
    _onDataChange(_data);
    renderPersonEditor(personId);
};

window.doRemoveRelationship = function(parentId, childId) {
    removeRelationship(_data, parentId, childId);
    _onDataChange(_data);
    renderPersonEditor(_selectedId);
};

window.doRemoveMarriage = function(s1, s2) {
    removeMarriage(_data, s1, s2);
    _onDataChange(_data);
    renderPersonEditor(_selectedId);
};

window.confirmDeletePerson = function(id) {
    const p = _data.persons.find(x => x.id === id);
    if (!confirm(`确认删除「${p?.name}」？`)) return;
    deletePerson(_data, id);
    _selectedId = null;
    _onDataChange(_data);
    document.getElementById("person-editor").innerHTML = "<p class='placeholder'>请选择人员</p>";
};

// --- 新增人员模态框 ---
function showAddPersonModal() {
    showModal("新增人员", buildPersonForm(null), data => {
        addPerson(_data, data);
        _onDataChange(_data);
    });
}

window.showEditPersonModal = function(id) {
    const p = _data.persons.find(x => x.id === id);
    showModal("编辑人员", buildPersonForm(p), data => {
        updatePerson(_data, id, data);
        _onDataChange(_data);
        renderPersonEditor(id);
    });
};

function buildPersonForm(p) {
    return `
<div class="form-group">
  <label>姓名 *</label>
  <input id="f-name" type="text" value="${p?.name || ""}" placeholder="请输入姓名" />
</div>
<div class="form-group">
  <label>性别</label>
  <select id="f-gender">
    <option value="">未知</option>
    <option value="male" ${p?.gender === "male" ? "selected" : ""}>男</option>
    <option value="female" ${p?.gender === "female" ? "selected" : ""}>女</option>
  </select>
</div>
<div class="form-group">
  <label>出生日期</label>
  <input id="f-birth" type="date" value="${p?.birth || ""}" />
</div>
<div class="form-group">
  <label>死亡日期</label>
  <input id="f-death" type="date" value="${p?.death || ""}" />
</div>
<div class="form-group">
  <label>备注</label>
  <textarea id="f-notes" rows="3">${p?.notes || ""}</textarea>
</div>
`;
}

function showModal(title, bodyHTML, onConfirm) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHTML;
    document.getElementById("modal-overlay").style.display = "flex";

    const confirmBtn = document.getElementById("modal-confirm");
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    newBtn.addEventListener("click", () => {
        const name = document.getElementById("f-name")?.value.trim();
        if (!name) { alert("姓名不能为空"); return; }
        onConfirm({
            name,
            gender: document.getElementById("f-gender")?.value || "",
            birth: document.getElementById("f-birth")?.value || "",
            death: document.getElementById("f-death")?.value || "",
            notes: document.getElementById("f-notes")?.value.trim() || ""
        });
        closeModal();
    });
}

function closeModal() {
    document.getElementById("modal-overlay").style.display = "none";
}

function getSelectedId() { return _selectedId; }
