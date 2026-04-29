// --- 数据变量 ---
let familyData = {
    persons: [],
    relationships: [],
    marriages: []
};

// --- 页面加载 ---
window.onload = () => {
    loadInitialData();
    renderPersonList();
    renderTree();
};

// --- 载入初始数据 ---
function loadInitialData() {
    // 先尝试 localStorage
    const saved = localStorage.getItem("familyData");
    if (saved) {
        familyData = JSON.parse(saved);
        return;
    }

    // fallback: 加载 family.json
    fetch("family.json")
        .then(r => r.json())
        .then(json => {
            familyData = json;
            saveToLocal();
            renderPersonList();
            renderTree();
        });
}

// --- 保存到 localStorage ---
function saveToLocal() {
    localStorage.setItem("familyData", JSON.stringify(familyData));
}

// --- 渲染人员列表 ---
function renderPersonList() {
    const list = document.getElementById("person-list");
    list.innerHTML = "";

    familyData.persons.forEach(p => {
        const li = document.createElement("li");
        li.textContent = p.name;
        li.onclick = () => showPersonEditor(p.id);
        list.appendChild(li);
    });
}

// --- 渲染族谱树（占位） ---
function renderTree() {
    const svg = document.getElementById("tree-area");
    svg.innerHTML = "";
    // Daily Run 将自动补充族谱树绘制算法
}

// --- 显示编辑页面 ---
function showPersonEditor(id) {
    const panel = document.getElementById("person-editor");
    const p = familyData.persons.find(x => x.id === id);

    panel.innerHTML = `
        <p>姓名：${p.name}</p>
        <p>性别：${p.gender}</p>
        <p>出生：${p.birth}</p>
        <p>备注：${p.notes}</p>
    `;
}