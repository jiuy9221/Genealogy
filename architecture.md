# Architecture - Genealogy Offline Web App (v2)

## 文件结构
```
/Genealogy
  index.html          主界面（三栏布局 + 模态框 + 图例）
  style.css           UI 样式（CSS 变量、响应式）
  app.js              入口（数据初始化、SVG 平移缩放、模块协调）
  family.json         示例数据（persons / relationships / marriages）
  family.md           Markdown 格式示例数据
  requirements.md     功能需求文档
  architecture.md     本文件
  DAILY_LOG.md        每日开发日志
  /modules
    data.js           数据 CRUD、JSON/MD 导入导出、localStorage
    tree.js           族谱树布局算法 + SVG 渲染
    ui.js             事件绑定、列表渲染、编辑面板、模态框
```

## 数据模型（JSON）
```json
{
  "persons": [
    { "id": "p_abc123", "name": "张三", "gender": "male",
      "birth": "1950-01-01", "death": "", "notes": "" }
  ],
  "relationships": [
    { "parent": "p_abc123", "child": "p_def456" }
  ],
  "marriages": [
    { "spouse1": "p_abc123", "spouse2": "p_xyz789" }
  ]
}
```

## 模块职责

### app.js
- 页面加载：优先 localStorage，其次 fetch family.json
- 调用 init(data, onDataChange) 初始化 UI 模块
- refresh()：协调 renderPersonList / renderTree / person-count 更新
- SVG 平移（mousedown/mousemove/mouseup）+ 滚轮缩放
- 缩放按钮（+/−/重置）

### modules/data.js
- generateId()：时间戳 + 随机串生成唯一 ID
- loadFromLocal() / saveToLocal() / clearLocal()
- exportJSON(data) / exportMarkdown(data)：下载文件
- parseMarkdown(text)：解析 MD → 内部数据结构
- addPerson / updatePerson / deletePerson（级联删除关系）
- addRelationship / removeRelationship
- addMarriage / removeMarriage

### modules/tree.js
#### 布局算法
1. 以无父母节点为根，BFS 确定每人代际 level
2. 孤立节点归入 level 0
3. 同 level 按「主节点 + 配偶」分组，水平排列
4. 组内配偶紧邻主节点，组间保留 H_GAP 间距
5. 坐标以水平中轴为 0 对称展开（负 x → 正 x）

#### SVG 渲染
- 亲子连线：三次贝塞尔曲线（灰色实线）
- 配偶连线：水平粉紫色虚线
- 节点：圆角矩形（男=蓝、女=粉、未知=灰），姓名 + 出生年

### modules/ui.js
- init(data, onDataChange)：绑定所有顶栏按钮
- renderPersonList(data)：左栏人员列表（带性别标签、选中高亮）
- selectPerson(id)：同步列表选中 + 右侧编辑面板
- renderPersonEditor(id)：显示信息、父母/子女/配偶关系操作
- showModal(title, bodyHTML, onConfirm)：复用模态框
- showAddPersonModal / showEditPersonModal：人员表单
- 全局函数（供 innerHTML onclick 调用）：
  doAddParent / doAddChild / doAddSpouse
  doRemoveRelationship / doRemoveMarriage / confirmDeletePerson

## 渲染流程
```
页面加载
  → loadFromLocal() / fetch family.json
  → init(data, onDataChange)      [ui.js 绑定事件]
  → refresh()
      → renderPersonList(data)    [ui.js]
      → renderTree(data, svg, cb) [tree.js]
      → applyTransform()          [app.js]

用户操作（增删改、关系编辑）
  → onDataChange(newData)
      → saveToLocal()
      → refresh()
```

## 数据模型扩展（v3）
Person 对象新增 `photo` 字段（base64 data URL，空字符串表示无头像）：
```json
{ "id": "p1", "name": "张三", "gender": "male", "birth": "1950-01-01",
  "death": "", "notes": "", "photo": "data:image/jpeg;base64,..." }
```

## 功能扩展（v3，2026-05-02）
- **头像上传**：buildPersonForm 含文件选择器，FileReader 读为 base64 data URL，存入 person.photo
  - tree.js 渲染：若 p.photo 非空，在 `<defs>` 中生成 `<clipPath id="avatar-clip-{id}">` 圆形遮罩，节点内用 `<image href>` 渲染照片
  - ui.js 编辑器：renderPersonEditor 在头部显示圆形头像（有照片则 img，无照片则首字母）
- **打印优化**：@media print 隐藏所有面板只保留 #tree-area，@page landscape 横向布局
- **分享链接**：generateShareLink() 将数据序列化为 Unicode-safe base64，写入 URL hash `#share=...`；app.js 在 onload 中 tryLoadShareHash() 检测并解析

## 功能扩展（v4，2026-05-03）

### 双视图模式（族谱树 / 时间轴）
- `app.js` 新增 `_viewMode = "tree" | "timeline"` 状态变量
- `_renderView(svg)` 根据 `_viewMode` 调用 `renderTree` 或 `renderTimeline`
- 顶栏新增 `view-toggle-group` 分段按钮组，按钮 id：`btn-view-tree` / `btn-view-timeline`
- 键盘快捷键 `T` 切换两种视图

### 族谱树视图（tree）
- 上→下层级布局，配偶水平聚合，子代对齐父母中点
- 节点支持拖拽（`_customOffsets` 持久化到 localStorage）
- `_basePositions` 存储布局原始坐标，`getNodeCenter(id)` = basePos + customOffset + (W/2, H/2)

### 时间轴视图（timeline）
- X 轴：出生年份（由数据最小/最大出生年自动计算范围，10px/年）
- Y 轴：代际层数（与族谱树一致）
- 无出生年的人员排在最右侧
- 碰撞回避：同代同年的节点自动向右推移
- 今年位置用红色虚线标注；每10年一条浅灰网格线，世纪线加重
- 不支持节点拖拽（位置由出生年决定）

### 节点选中自动居中
- `window.highlightTreeNode(id)` 现在同时调用 `centerOnNode(id)`
- `centerOnNode(id)` 利用 `window.getNodeCenter(id)` 计算节点中心，更新 `svgPanOffset` 将节点居中到视口

### 代码架构更新
- `tree.js` 提取 `_renderNodeGroup(p, pos, onNodeClick, enableDrag)` 公共节点构建函数，`renderTree` 和 `renderTimeline` 均调用
- `_currentViewMode` 模块变量记录当前渲染模式，供 `getNodeCenter` 决定是否加 customOffset

## 功能扩展（v5，2026-05-03 第二次推进）

### 多语言支持（i18n）
- 新增 `modules/i18n.js`：包含 `zh-CN` / `zh-TW` / `en` 三套翻译表（100+ 键值对）
- `t(key)` 全局函数：从当前语言翻译表取值，缺失时回退到 zh-CN
- `setLang(code)` / `getCurrentLang()` / `loadLang()`：语言状态管理，持久化到 `genealogy_lang` localStorage 键
- `applyI18n()`：遍历 `[data-i18n]` 元素更新 `textContent`（`<input>` 更新 `placeholder`）；遍历 `[data-i18n-title]` 更新 `title` 属性
- 顶栏新增 `<select id="lang-select">` 下拉语言切换器（样式化为原生 select，隐藏系统箭头，替换为 SVG 箭头）
- `window._onLangChange` 回调：语言切换后调用 `applyI18n()` + `syncDarkBtn()` + `refresh()`（重新渲染动态内容）
- `i18n.js` 在 `index.html` 所有其他脚本之前加载，确保 `t()` 在 data.js / ui.js / app.js 中均可调用
- `document.title` 通过 `<title data-i18n="app-title">` 同步更新

### 祖先路径显示
- `data.js` 新增 `getAncestorPath(data, personId)`：DFS 向上遍历，找到从最高祖先到目标人员的最长路径，返回 person 对象数组
- `ui.js` `renderPersonEditor` 中新增 `.ancestor-path-section`：面包屑式祖先路径（`anc-item` + `anc-arrow`）
  - 每个祖先节点可点击跳转到对应人员（调用 `selectPerson(id)`）
  - 当前人员用 `.anc-current` 样式高亮（蓝底白字）
  - 仅有父母时才显示该区段（单节点不显示）

### 触摸设备双指捏合缩放（pinch-to-zoom）
- `app.js` `setupTreePan()` 重构触摸事件逻辑：
  - `touchstart` 2 指：记录初始两指距离 `pinchDist` 和当前缩放 `pinchScaleStart`
  - `touchmove` 2 指：`e.preventDefault()`（需 `passive:false`），按距离变化比例更新 `svgScale`
  - `touchmove` 1 指：正常单指平移
  - `touchend`：清理 `pinchDist` / `touchStart` 状态
  - 支持范围：`svgScale` 同步限制在 [0.2, 3]

## 存储格式（localStorage）
Key: `genealogy_familyData`
Value: JSON.stringify({ persons, relationships, marriages })
（person.photo 为 base64 字符串，可能较大，建议单个家庭照片控制在 300KB 以内）

Key: `genealogy_lang`
Value: "zh-CN" | "zh-TW" | "en"（语言偏好）
