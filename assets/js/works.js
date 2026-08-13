/* ============================================================
   works.js  —  作品数据（集中管理，添加作品只需在此追加一条）
   字段说明：
     type   : 'article' 文章 | 'animation' HTML动画 | 'solve' 解题 | 'video' 视频 | 'work' 作品
     title  : 标题
     desc   : 一句话简介
     icon   : 封面图标（emoji，也可用 SVG）
     link   : 链接（文章页 / 动画 html / 视频地址 / 作品页）
     date   : 日期 YYYY-MM-DD
     tag    : 标签（可选）
   ============================================================ */

const WORKS = [
  /* ---------------- 文章 ---------------- */
  {
    type:"article", title:"高三物理一轮复习的四条主线",
    desc:"以「概念—模型—方法—误差」为主线重构复习框架，提升课堂效率。",
    icon:"📐", link:"articles/sample.html", date:"2026-07-20", tag:"复习策略"
  },
  {
    type:"article", title:"楞次定律的三种理解层次",
    desc:"从「阻碍」到「能量守恒」再到「动力学」，逐层拆解教学难点。",
    icon:"🧲", link:"articles/sample.html", date:"2026-06-11", tag:"电磁学"
  },
  {
    type:"article", title:"把实验搬进课堂：低成本演示装置设计",
    desc:"用日常材料搭建可量化演示实验，让抽象规律看得见。",
    icon:"🔬", link:"articles/sample.html", date:"2026-05-02", tag:"实验教学"
  },

  /* ---------------- HTML 动画 ---------------- */
  {
    type:"animation", title:"平抛运动：合成与分解",
    desc:"可调速、可暂停的交互动画，直观展示水平/竖直分运动。",
    icon:"🎯", link:"animations/demo.html", date:"2026-07-08", tag:"力学"
  },
  {
    type:"animation", title:"波的干涉实时演示",
    desc:"双波源叠加，相位差可调，呈现稳定干涉图样。",
    icon:"🌊", link:"animations/demo.html", date:"2026-04-19", tag:"波动"
  },
  {
    type:"animation", title:"棱镜色散与折射率",
    desc:"白光过三棱镜的色散过程，对应本站的科技视觉语言。",
    icon:"🌈", link:"animations/demo.html", date:"2026-03-30", tag:"光学"
  },
  {
    type:"animation", title:"波的叠加原理",
    desc:"双波源反向传播、质点依次被带动与脉冲模式，直观演示波的叠加。",
    icon:"🌊", cover:"assets/img/wave-superposition-cover.png",
    link:"animations/wave-superposition.html", date:"2026-08-13", tag:"波动"
  },
  {
    type:"animation", title:"波的反射与驻波",
    desc:"行波遇壁反射，与入射波叠加形成驻波，直观呈现波节与波腹。",
    icon:"〰️", cover:"assets/img/wave-reflection-standing-cover.png",
    link:"animations/wave-reflection-standing.html", date:"2026-08-13", tag:"波动"
  },
  {
    type:"animation", title:"纵波的产生",
    desc:"质点沿波传播方向振动，演示疏密相间的纵波形成过程。",
    icon:"📳", cover:"assets/img/longitudinal-wave-cover.png",
    link:"animations/longitudinal-wave.html", date:"2026-08-13", tag:"波动"
  },
  {
    type:"animation", title:"驻波的产生",
    desc:"两列同频反向波叠加，形成稳定波节与波腹的驻波图样。",
    icon:"🌐", cover:"assets/img/standing-wave-cover.png",
    link:"animations/standing-wave.html", date:"2026-08-13", tag:"波动"
  },

  /* ---------------- 解题 ---------------- */
  {
    type:"solve", title:"2026湖北高考物理压轴题",
    desc:"电场与磁场中的往复运动综合题，分步拆解高考压轴难点。",
    icon:"🏆", link:"solutions/2026-hubei-final.html", date:"2026-08-13", tag:"高考压轴"
  },
  {
    type:"solve", title:"例题：斜面上物块的受力与运动分析",
    desc:"分步拆解斜面模型的受力分析、正交分解与牛顿第二定律列式。",
    icon:"🧩", link:"solutions/sample.html", date:"2026-08-13", tag:"力学"
  },
  {
    type:"solve", title:"例题：带电粒子在匀强磁场中的圆周运动",
    desc:"从几何关系确定圆心半径，到周期与临界问题的完整解题套路。",
    icon:"⚡", link:"solutions/sample.html", date:"2026-08-13", tag:"电磁学"
  },

  /* ---------------- 视频 ---------------- */
  {
    type:"video", title:"实验：验证机械能守恒定律",
    desc:"导轨+光电门的规范操作与数据处理全流程实录。",
    icon:"🎬", link:"#", date:"2026-06-25", tag:"实验视频"
  },
  {
    type:"video", title:"微课：带电粒子在磁场中的运动",
    desc:"10 分钟讲清半径、周期与临界问题的解题套路。",
    icon:"⚡", link:"#", date:"2026-05-16", tag:"微课"
  },

  /* ---------------- 作品 ---------------- */
  {
    type:"work", title:"LXQ 教学品牌视觉设计",
    desc:"深蓝绿科技风 Logo 与规范，棱镜色散概念贯穿始终。",
    icon:"💠", link:"#", date:"2026-02-14", tag:"品牌设计"
  },
  {
    type:"work", title:"自编校本教材《物理可视化》",
    desc:"面向本校学生的可视化助学手册，配套动画与习题。",
    icon:"📚", link:"#", date:"2026-01-09", tag:"教材"
  },
];

/* 类型中文映射（用于筛选按钮与标签） */
const TYPE_LABEL = {
  article:"文章", animation:"HTML动画", solve:"解题", video:"视频", work:"作品"
};
const TYPE_GRAD = {
  article:"grad-article", animation:"grad-animation", solve:"grad-solve", video:"grad-video", work:"grad-work"
};
