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
