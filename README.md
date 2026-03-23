# task_center mobile

`task_center_mobile` 是给 `task_center` 做的一个**独立移动端前端初版**，使用 **React + TypeScript + Vite**，不修改桌面端代码。

## 项目目标

这一版优先把移动端的信息架构和交互骨架搭对，而不是把桌面端硬压缩到手机上。

已按要求落地：

- 独立项目目录 + 独立 git 仓库
- 开发端口改为 **5174**
- 开发环境通过 **Vite proxy 代理 `/api`**，避免浏览器直接跨域打后端
- 底部导航 4 项：**今日 / 计划 / 看板 / 历史**
- 任务详情采用**移动端详情层 / 轻详情页风格**

## 页面结构

### 1) 今日（默认）
- 首屏直接看任务
- 顶部极简摘要：今天 x 项｜逾期 x｜已完成 x
- 分组展示：
  - 逾期
  - 今天到期
  - 进行中
  - 稍后 / 无具体时间
  - 已完成（默认折叠）

### 2) 计划
- agenda 风格
- 按天分组
- 每天按时间排序
- 不做桌面式卡片墙

### 3) 看板
- 默认单列分组列表
- 支持：
  - 按状态分组
  - 按项目分组
- 这版**不做多列横向拖拽看板**

### 4) 历史
- 默认最近更新列表
- 筛选入口收进顶部按钮
- 当前以轻量 sheet 形式提供筛选

### 5) 详情
- 轻详情层而不是桌面大弹层
- 主体展示：
  - 标题
  - 状态
  - 时间
  - 项目
  - 描述
- 当前动作区：
  - 完成
  - 改时间
  - 延期
  - 取消

## 启动

```bash
cd task_center_mobile
cp .env.example .env.local
npm install
npm run dev
```

默认开发地址：

- `http://localhost:5174`

## 构建

```bash
npm run build
npm run preview
```

## 反向代理 / 避免跨域

开发环境默认采用**同源 `/api` + Vite proxy**：

- 浏览器请求：`/api/...`
- Vite dev server 监听：`5174`
- Vite 将 `/api` 代理到真实后端，例如：`http://127.0.0.1:8000`
- 后端保留 `/api` 前缀，不做 rewrite

### `.env.example`

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
```

### `vite.config.ts`

```ts
server: {
  host: '0.0.0.0',
  port: 5174,
  proxy: {
    '/api': {
      target: proxyTarget,
      changeOrigin: true,
    },
  },
}
```

这意味着：

- 前端开发时只访问 `5174`
- 浏览器不会直接跨到 `8000`
- 联调时不会因为前端直接跨域请求后端而撞 CORS

## API 契约

移动端项目内独立复制并收口了桌面端的 API adapter / types，没有反向修改桌面端代码。

当前使用的接口包括：

- `GET /api/dashboard/today`
- `GET /api/dashboard/board`
- `GET /api/dashboard/history`
- `GET /api/tasks`
- `GET /api/tasks/:id`
- `PATCH /api/tasks/:id`
- `POST /api/tasks/:id/complete`
- `POST /api/tasks/:id/defer`
- `POST /api/tasks/:id/cancel`
- `GET /api/projects`

同时保留了桌面端里对历史状态值的兼容归一化：

- `open -> todo`
- `completed -> done`
- `cancelled -> canceled`

## 目前已知的占位 / 未做完

这版是“先有骨架，再逐步补肉”，所以有些地方故意收着做：

1. **详情动作的输入方式还比较朴素**
   - `改时间` / `延期` 目前用 `window.prompt`
   - 先保证链路通，后续再换成移动端原生感更强的日期时间 sheet

2. **设置入口是轻量占位**
   - 顶部更多按钮目前先提示占位

3. **历史筛选只有基础项**
   - 目前支持关键词 / 状态 / 日期
   - 更复杂筛选条件以后再扩

4. **没有做创建任务 / 完整编辑表单**
   - 本版重点是浏览、分组、详情和基础动作

5. **没有做多列横向看板 / 拖拽**
   - 这次按要求保留单列分组版为默认形态

6. **没有接入 Router / React Query**
   - 当前保持初版轻量结构
   - 适合下一轮再做 URL 状态、缓存和 mutation 优化

## 目录结构

```text
task_center_mobile/
├─ src/
│  ├─ App.tsx
│  ├─ api.ts
│  ├─ config.ts
│  ├─ hooks.ts
│  ├─ main.tsx
│  ├─ styles.css
│  ├─ types.ts
│  ├─ utils.ts
│  └─ vite-env.d.ts
├─ .env.example
├─ .gitignore
├─ index.html
├─ package.json
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts
```
