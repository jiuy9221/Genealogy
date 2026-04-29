# Architecture - Genealogy Offline Web App

## 文件结构
/project
  index.html
  style.css
  app.js
  /modules
    data.js       - 数据处理（JSON/MD）
    tree.js       - 树形结构绘制
    ui.js         - UI 操作
  family.json
  family.md

## 数据模型（JSON 格式）
Person:
{
  "id": "uuid",
  "name": "",
  "gender": "",
  "birth": "",
  "death": "",
  "notes": ""
}

Relationship:
{
  "parent": "person-id",
  "child": "person-id"
}

Marriage:
{
  "spouse1": "person-id",
  "spouse2": "person-id"
}

## 模块关系
- app.js
  - 初始化
  - 加载数据
  - 事件绑定
  - 调用 UI 和 Tree

- data.js
  - 解析 JSON
  - 解析 Markdown
  - 生成 JSON
  - 导出 Markdown
  - localStorage 自动保存

- tree.js
  - 将 JSON 数据构建为树
  - 生成绘图节点
  - 绘制到 SVG / Canvas

- ui.js
  - 三栏布局控制
  - 绑定按钮操作
  - 表单编辑人员信息

## 渲染流程
1. app.js 读取 JSON/MD
2. data.js 转为内部结构
3. tree.js 生成族谱树图形数据
4. tree.js 渲染到 SVG
5. ui.js 更新页面