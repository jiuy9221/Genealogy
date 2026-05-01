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
