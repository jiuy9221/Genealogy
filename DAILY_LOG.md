# Genealogy Daily Development Log

## 2026-04-29
- 更新文件：index.html, style.css, app.js, modules/data.js（新建）, modules/tree.js（新建）, modules/ui.js（新建）, architecture.md, DAILY_LOG.md（新建）
- 新增功能：
  - 创建 modules/ 目录，拆分 data.js / tree.js / ui.js 三个模块
  - data.js：人员 CRUD、亲子/婚姻关系增删、JSON 导出、Markdown 导出/导入解析、localStorage 持久化
  - tree.js：BFS 代际布局算法、配偶分组水平排列、SVG 渲染（贝塞尔亲子线 + 虚线配偶线）、按性别着色节点
  - ui.js：左栏人员列表（带性别标签选中高亮）、右侧关系编辑面板、复用模态框（新增/编辑人员）、JSON/MD 导入导出绑定
  - app.js：重构为模块协调器，SVG 鼠标平移 + 滚轮缩放 + 缩放按钮
  - index.html：三栏布局完善，加图例、缩放按钮、模态框 DOM
  - style.css：CSS 变量体系、完整组件样式（按钮/面板/列表/表单/模态框）、响应式布局
- 下一步：
  - 搜索人员过滤功能
  - 族谱树节点点击高亮视觉反馈
  - 支持导入 family.json 时提示合并/覆盖选项
  - 移动端适配优化

## 2026-05-01
- 更新文件：modules/tree.js、modules/ui.js、app.js、index.html、style.css
- 新增功能：
  - tree.js：重写连线渲染为**渔骨式（fishbone）**连接——两位父母底部各引竖线接水平 coupling bar，junction 点向下分叉到各子女；单亲则用折线；无子女配偶保留紫色虚线。节点顶部加性别色条（蓝/粉），显示生卒年范围（如 1940–2005），姓名超长省略。代际背景添加交替浅色带。新增 SVG `<filter id="glow">` 高亮效果，`_nodeGroups` 模块级追踪所有 `<g>` 元素，`highlightNode(id)` 正确添加发光滤镜+加粗描边。
  - app.js：`highlightTreeNode` 正确调用 `highlightNode()`；新增键盘快捷键（ESC 关闭模态框、Ctrl+N 新增人员、Ctrl+E 导出 JSON、+/- 缩放、0 重置视图）；补充触摸屏平移支持。
  - ui.js：人员列表增加**搜索/过滤**功能（实时关键字匹配 + 高亮 `<mark>` 标注）；列表按姓名字典序排序；显示出生年份；新增**导入合并/覆盖对话框**（按 ID 去重追加或完整覆盖）；新增 **Toast 通知**系统（新增/编辑/删除/导入导出均有提示）；编辑面板显示估算年龄；模态框聚焦第一个输入框；表单拆成两列布局。
  - index.html：左面板加搜索框；顶栏新增快捷键提示；图例增加键盘提示；引入 toast-container。
  - style.css：搜索框圆角样式；人员列表 `<mark>` 高亮；Toast 动画；导入对话框卡片样式；模态框 slideUp 动画；表单双列 `.form-row`；图例动态居中修正；按钮 active 缩放反馈；完整变量体系补全。
- 下一步：
  - 族谱树节点拖拽重排（可选位置微调）
  - 多根节点时自动居中并适应视口
  - 打印/导出为 PNG 或 PDF
  - 人员头像（初始字母头像或上传图片）
  - 统计视图（成员数、代际数、平均寿命等）

## 2026-05-02
- 更新文件：modules/data.js、modules/tree.js、modules/ui.js、app.js、index.html、style.css
- 新增功能：
  - **data.js**：新增 `computeStats(data)` — BFS 计算代际层数、平均寿命（带出生+死亡年份者）、子女最多人员、最年长者（按出生年升序）。
  - **tree.js**：NODE_W 从 130→148px；每个节点左侧增加**首字头像圆**（蓝/粉/灰按性别配色，显示姓名第一个字），名字与生卒年文本整体右移至 x=44，左对齐布局。生卒年格式精简为 `b.YYYY` / `YYYY–YYYY`。
  - **ui.js**：新增 `showStatsModal()` — 3×2 统计卡片网格（总人数、男/女含百分比、代际层数、婚姻对数、平均寿命），附"子女最多""最年长者"高亮行；新增 `exportTreeAsPNG()` — 序列化当前 SVG 为 Blob，2× 高清 Canvas 渲染后下载 PNG，内嵌背景色，支持出错提示。
  - **app.js**：新增 `autoFitTree()` — 首次加载时自动计算缩放比（min(containerW/svgW, containerH/svgH) × 0.88）居中适应视口，后续编辑保留用户操作状态；`_didInitialFit` 标志避免重复重置；新增 `setupExtraButtons()` 绑定「统计」「导出 PNG」「适应视口」三个按钮；键盘快捷键 `F` 触发适应视口。
  - **index.html**：顶栏新增「导出 PNG」「📊 统计」按钮；缩放区新增「适应视口（⇱）」按钮；图例更新快捷键说明。
  - **style.css**：新增 `.btn-stats`、`.stats-grid`、`.stat-card`（含 `.male`/`.female` 变体）、`.stat-value`、`.stat-pct`、`.stat-label`、`.stats-highlight`、`.stats-hl-label` 全套统计面板样式。
- 下一步：
  - 族谱树节点拖拽重排（手动微调位置）
  - 打印优化（@media print 隐藏面板，仅输出树图）
  - 人员照片上传（base64 存储到 localStorage）
  - 族谱分享：生成可分享的 URL hash（内嵌压缩 JSON）
  - 多语言支持（繁体中文 / English 切换）

## 2026-05-02（第三次推进）
- 更新文件：modules/tree.js、app.js、index.html、style.css
- 新增功能：
  - **暗色主题（Dark Mode）**：
    - style.css 新增 `body.dark-mode` CSS 变量覆盖块（bg/surface/border/text/primary/danger/male/female 全套），顶栏按钮、列表、编辑器、模态框、Toast、统计卡片、图例均适配深色背景；
    - tree.js 新增 `getNodeColors(gender)` 函数，节点填充色、描边、头像圆、顶部色条、姓名/生卒年文字颜色随主题切换；`_lineColor()` / `_bandFill()` 辅助函数控制连线与代际背景带；
    - app.js 新增 `setupDarkMode()`，页面加载前读取 localStorage 提前应用暗色类（避免闪白），点击按钮切换主题并触发 `refreshTreeOnly()` 重绘树；
    - 键盘快捷键 **D** 触发暗色/亮色切换；顶栏新增「🌙 暗色 / ☀ 亮色」按钮。
  - **节点拖拽重排**：
    - tree.js 引入 `_customOffsets`（personId→{dx,dy}）、`_basePositions`（布局算法原始坐标）、`_dragState` 模块级状态；
    - `initDragHandlers()` 只注册一次全局 `window.mousemove/mouseup`：移动时实时更新节点 `<g>` transform，mouseup 后调用 `_onDragEnd` 回调触发完整重绘（连线随之更新）；
    - 节点 mousedown 调用 `e.stopPropagation()` 阻止背景平移；`_wasDragging` 标志防止拖拽结束后误触 click；
    - app.js 在页面加载时通过 `setCustomOffsets(loadDragOffsets())` 恢复偏移，`setDragEndCallback` 注册保存+重绘；`window.getSvgScale` 供 tree.js 换算屏幕像素→SVG 用户坐标；pan 的 `mousemove` 检查 `window._nodeDragActive` 避免冲突；
    - 顶栏缩放区新增「↻ 重置节点位置」按钮（`btn-reset-drag`），清除所有拖拽偏移并重绘。
- 下一步：
  - 时间轴模式（横向时间线，按出生年展示各代成员）
  - 多语言切换（繁体中文 / English）
  - 搜索后自动在树中定位并滚动到对应节点

## 2026-05-02（第二次推进）
- 更新文件：family.json、style.css、modules/tree.js、modules/ui.js、index.html、app.js、architecture.md
- 新增功能：
  - **family.json**：扩展为三代七口示例数据（张大树 & 王桂花 → 张三 & 李四 → 张小明/小红/小刚），含出生/死亡年份。
  - **头像上传**（ui.js + tree.js）：
    - 新增/编辑人员表单加入「头像照片」上传区，点击圆形预览或按钮触发文件选择器，FileReader 读取为 base64 data URL 存入 person.photo（≤300KB 限制）；
    - 右侧编辑面板头部改为 `editor-person-meta` 布局，有照片显示 `<img>` 圆形头像，无照片显示性别配色首字母圆；
    - tree.js 节点渲染：有 `p.photo` 时在 `<defs>` 生成 `clipPath`，节点内用 `<image href>` 圆形裁剪展示照片，无照片保留原首字母圆。
  - **分享链接**（ui.js + app.js）：
    - `generateShareLink()` 将族谱数据（照片字段剥离）序列化为 Unicode-safe base64，生成 `#share=...` URL，优先写入剪贴板，不支持时弹出复制对话框；
    - app.js `tryLoadShareHash()` 在页面加载时检测 hash，自动解析并加载分享数据；
    - 顶栏新增「🔗 分享」按钮。
  - **打印优化**（style.css + app.js + index.html）：
    - `@media print` CSS：隐藏顶栏/左右面板/图例/Toast，body/layout/center-panel 全宽可见，`#tree-area` 清除 transform，`@page landscape` 横向输出；
    - 顶栏新增「🖨 打印」按钮（调用 `window.print()`），键盘快捷键 `Ctrl+P` 绑定。
- 下一步：
  - 族谱树节点拖拽重排（鼠标拖动节点到自定义位置）
  - 多语言支持（繁体中文 / English 切换）
  - 时间轴模式（横向展示各代际生卒时间线）
  - 暗色主题（Dark Mode）切换

## 2026-05-03
- 更新文件：modules/tree.js、app.js、index.html、style.css、architecture.md、requirements.md
- 新增功能：
  - **时间轴视图（Timeline View）**（tree.js + app.js + index.html + style.css）：
    - 顶栏新增「🌳 族谱树 / 📅 时间轴」分段按钮组，点击或按 `T` 键切换视图；
    - `renderTimeline(data, svgEl_el, onNodeClick)`：以出生年为 X 轴（10px/年，范围自动由数据推算）、代际层数为 Y 轴绘制各人员节点；
    - 代际背景条（偶数代加色带）+ 每10年一条刻度线 + 世纪线加粗；
    - 今年位置用红色虚线 + "今" 标记；
    - 无出生年人员排列在最右侧；同代同年节点自动碰撞推移避免重叠；
    - 复用 `renderConnections` 绘制亲子/配偶连线；
    - 时间轴模式不启用节点拖拽（`btn-reset-drag` 自动隐藏）。
  - **节点选中自动居中**（app.js + tree.js）：
    - `getNodeCenter(id)` 计算节点真实中心（树模式考虑 customOffset，时间轴模式直接用布局坐标）；
    - `centerOnNode(id)` 根据中心坐标更新 `svgPanOffset`，使选中节点在视口居中；
    - 左侧人员列表点击、搜索选中后，树/时间轴视图自动平移对焦。
  - **代码重构**（tree.js）：
    - 提取 `_renderNodeGroup(p, pos, onNodeClick, enableDrag)` 公共函数，`renderTree` 和 `renderTimeline` 均调用，消除重复节点渲染代码（减少约60行重复代码）；
    - 新增 `_currentViewMode` 模块变量，`getNodeCenter` 按当前视图模式决定是否叠加拖拽偏移。
- 下一步：
  - 多语言切换（繁体中文 / English）
  - 祖先路径显示（右侧面板显示从选中人员到根节点的路径）
  - 触摸设备双指缩放（pinch-to-zoom）
  - 搜索支持拼音首字母模糊匹配

## 2026-05-03（第二次推进）
- 更新文件：modules/i18n.js（新建）、index.html、modules/data.js、modules/ui.js、app.js、style.css、architecture.md、requirements.md
- 新增功能：
  - **多语言支持（i18n）**：
    - 新建 `modules/i18n.js`：包含 `zh-CN`（简体）/ `zh-TW`（繁体）/ `en`（英文）三套完整翻译表（100+ 键值），`t(key)` 全局函数按当前语言取值并回退到 zh-CN；
    - `setLang(code)` 切换语言并持久化到 `genealogy_lang`；`loadLang()` 在页面加载时预读避免闪烁；`applyI18n()` 遍历 `[data-i18n]` / `[data-i18n-title]` 元素自动更新文本与 title；
    - 顶栏新增 `<select id="lang-select">` 样式化原生下拉选择器（带自定义 SVG 箭头，亮/暗主题双套）；
    - `window._onLangChange` 回调：语言切换后自动触发 `applyI18n()` + `syncDarkBtn()` + `refresh()` 全量重渲；
    - `i18n.js` 在所有模块前加载（HTML script 顺序最先），保证全局 `t()` 在任意 JS 中可用；
    - `modules/ui.js` 全面接入 `t()` 替换硬编码字符串（按钮标签、section 标题、Toast 消息、模态标题、表单标签、导入对话框等）；`app.js` 同步接入（Toast、暗色按钮标签等）。
  - **祖先路径显示**：
    - `modules/data.js` 新增 `getAncestorPath(data, personId)`：DFS 向上遍历亲子关系，找从最高祖先到目标人员的最长路径，返回 person 对象数组；
    - `modules/ui.js` `renderPersonEditor` 新增 `.ancestor-path-section` 区段：面包屑式祖先路径，每个祖先为 `.anc-item` 标签，可点击调用 `selectPerson(id)` 跳转；当前人员标注 `.anc-current`（蓝底白字）；仅两节点及以上才渲染；
    - `style.css` 新增 `.ancestor-path`、`.anc-item`、`.anc-arrow`、`.anc-current` 全套样式（含深色主题适配）。
  - **触摸双指捏合缩放（pinch-to-zoom）**：
    - `app.js` `setupTreePan()` 重构触摸逻辑：`touchstart` 检测双指时记录初始距离 `pinchDist` 和 `pinchScaleStart`；`touchmove` 双指时 `e.preventDefault()`（`passive:false`）阻止浏览器原生缩放，按距离比例更新 `svgScale`；单指保持原平移逻辑；`touchend` 清理两套状态互不干扰；缩放范围限 [0.2, 3]。
- 下一步：
  - 搜索支持拼音首字母模糊匹配
  - 人员详情页显示完整生卒/年龄统计
  - 导出 PDF（jsPDF 离线库）
  - 多族谱文件管理（本地多份族谱切换）
