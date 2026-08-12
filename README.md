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
│   └── img/logo.png      # 棱镜色散 Logo（PNG）
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

## 部署到 GitHub Pages（已上线）

✅ **站点已上线**：https://force99-lab.github.io/ （仓库 `force99-lab/force99-lab.github.io`，`main` 分支根目录，GitHub Pages 已开启）。

> 注：本机运行环境无法直连 `github.com` 的 Git 主机（`git push` 会被网络策略拦截），
> 但能访问 `api.github.com`，因此部署走的是 **GitHub REST API** 方式。
> 仓库内附 `deploy_via_api.py` 即为该部署脚本（不含任何凭据，token 通过环境变量传入）。

### 以后如何更新站点（从本环境，推荐）
1. 改好本地文件后，运行：
   ```bash
   REPO="force99-lab/force99-lab.github.io" \
   GITHUB_TOKEN="你的token" \
   BRANCH="main" \
   python deploy_via_api.py
   ```
2. 脚本会把 `assets/ / articles/ / animations/ / videos/ / works/` 等全部文件通过 Contents API 上传并覆盖，
   每次更新约 1 分钟构建完成后自动生效。

### 用 Git 部署（在能直连 github.com 的机器上）
1. 克隆或关联远程：
   ```bash
   git remote add origin https://github.com/force99-lab/force99-lab.github.io.git
   git branch -M main
   git pull origin main --rebase   # 先同步线上已有的提交历史
   ```
2. 本地改完提交后：
   ```bash
   git push -u origin main
   ```
3. 若从未开启 Pages：仓库 → **Settings → Pages → Source 选 `main` / `(root)`** → Save。

---

## 自定义小贴士
- **改主色**：编辑 `assets/css/style.css` 顶部的 `:root` 变量（`--teal`、`--teal-deep` 等）。
- **改标题/简介/统计数字**：`index.html` 的 Hero 与关于区块。
- **联系方式**：`index.html` 底部 `#contact` 的邮箱与链接。
- **字体**：默认走 Google Fonts（Noto Sans SC），离线会自动回退到系统字体。

---

© 2026 force99 · 用科技讲透物理
