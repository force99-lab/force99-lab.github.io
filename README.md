# force99 · 个人作品站

一个面向高中物理教学的**科技风个人作品站**，用于集中展示：

- 📐 **文章** —— 复习策略、重难点拆解、实验教学思考
- 🎯 **HTML 动画** —— 可调速、可交互的物理过程可视化
- 🎬 **视频** —— 实验实录与微课
- 💠 **作品** —— 品牌视觉、校本教材、教具设计

视觉语言统一为**深蓝绿主色 + 棱镜色散彩虹点缀 + 玻璃拟态 + 粒子背景**，与 LXQ 教学品牌一致。纯静态站点，零依赖、零构建，直接托管在 **GitHub Pages**。

---

## 目录结构

```
.
├── index.html            # 首页（Hero / 关于 / 作品总览筛选 / 联系）
├── articles.html         # 文章列表页
├── animations.html       # HTML 动画页（卡片网格）
├── videos.html           # 视频页
├── works.html            # 综合作品页
├── assets/
│   ├── css/style.css     # 全部样式（设计系统）
│   ├── js/works.js       # ⭐ 作品数据（添加作品只改这里）
│   ├── js/main.js        # 粒子背景 / 滚动揭示 / 筛选 / 渲染
│   └── img/logo.svg      # 棱镜色散 Logo
├── articles/             # 文章详情页（放 .html）
│   └── sample.html       # 示例文章
├── animations/           # HTML 动画页（放 .html）
│   └── demo.html         # 示例：平抛运动
├── videos/               # 视频（放文件或填外链）
└── works/                # 其他作品
```

---

## 如何添加作品（核心：只改 `assets/js/works.js`）

打开 `assets/js/works.js`，在 `WORKS` 数组里追加一条：

```js
{
  type:"article",            // article=文章 | animation=HTML动画 | video=视频 | work=作品
  title:"你的标题",
  desc:"一句话简介",
  icon:"📐",                // 封面 emoji（也可用 SVG）
  link:"articles/your.html",// 链接到详情页 / 视频地址 / "#"
  date:"2026-08-12",        // YYYY-MM-DD
  tag:"选修"                 // 可选标签
}
```

四种类型会自动套用对应配色与筛选分类，**首页和分类页会自动更新**，无需改 HTML。

### 添加文章
1. 复制 `articles/sample.html` 为 `articles/your.html`，替换正文。
2. 在 `works.js` 加一条 `type:"article"`，`link` 指向该文件。

### 添加 HTML 动画
1. 把做好的动画 `.html` 放进 `animations/`（可参考 `animations/demo.html`）。
2. 在 `works.js` 加一条 `type:"animation"`，`link` 指向它。

### 添加视频
- 本地视频：放进 `videos/`，`link` 写 `"videos/xxx.mp4"`（建议在详情页用 `<video>` 嵌入）。
- 外链（B 站 / YouTube）：`link` 直接填播放页地址，或嵌入 iframe。

---

## 部署到 GitHub Pages

> 当前环境未连接 GitHub（`gh` 未安装、连接器断开），无法由我直接推送。
> 下面两种方式任选其一，**方式 A 可让我代劳**（见文末）。

### 方式 A：把仓库交给我代部署（推荐）
提供以下信息，我即可创建仓库并推送、开启 Pages：
1. 你的 **GitHub 用户名**
2. 一个 **Personal Access Token**（勾选 `repo` 权限）：
   生成地址：`GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token`
3. 是否用 `用户名.github.io` 作为站点地址（用户页），或用普通仓库 `用户名/仓库名` + `/` 根路径。

> ⚠️ Token 仅用于本次推送，推送完成后可自行撤销。也可改为用 GitHub CLI 登录后再让我执行。

### 方式 B：你自己部署（3 分钟）
1. 在 GitHub 新建仓库（名随意，如 `force99-site`；若要用户页则必须叫 `用户名.github.io`）。
2. 把本文件夹全部内容上传（拖到仓库的 Add file，或用 Git）：
   ```bash
   git init
   git add .
   git commit -m "initial site"
   git branch -M main
   git remote add origin https://github.com/用户名/仓库名.git
   git push -u origin main
   ```
3. 仓库 → **Settings → Pages → Source 选 `main` 分支 / `(root)`** → Save。
4. 等待约 1 分钟，访问 `https://用户名.github.io/仓库名/` 即可。

---

## 自定义小贴士
- **改主色**：编辑 `assets/css/style.css` 顶部的 `:root` 变量（`--teal`、`--teal-deep` 等）。
- **改标题/简介/统计数字**：`index.html` 的 Hero 与关于区块。
- **联系方式**：`index.html` 底部 `#contact` 的邮箱与链接。
- **字体**：默认走 Google Fonts（Noto Sans SC），离线会自动回退到系统字体。

---

© 2026 force99 · 用科技讲透物理
