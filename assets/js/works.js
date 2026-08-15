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

    type:"article", title:"2026年高考物理压轴题系统性分析",

    desc:"逐题拆解 2026 高考物理压轴题的命题思路、模型建构与解题通法。",

    icon:"🏅", link:"articles/2026-gaokao-physics-final-analysis.html", date:"2026-08-13", tag:"高考研究"

  },

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




  {

    type:"article", title:"物理如何「开窍」· 教育理论重构（实例版）",

    desc:"以「开窍」为核心重构物理教学：从直觉唤醒到模型建构的实例路径。",

    icon:"💡", link:"articles/物理开窍教育理论文章.html", date:"2026-08-14", tag:"教育理论"

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

    type:"animation", title:"三棱镜色散",

    desc:"白光经三棱镜分解为七色光谱，直观演示光的色散与折射率。",

    icon:"🌈", cover:"assets/img/prism-dispersion-cover.png",

    link:"animations/三棱镜色散.html", date:"2026-08-14", tag:"光学"

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

 {

    type:"animation", title:"示波器工作原理",

    desc:"演示电子束在电场中偏转、逐点扫描合成波形，直观呈现示波器成像原理。",

    icon:"📺", cover:"assets/img/oscilloscope-cover.jpg",

    link:"animations/oscilloscope.html", date:"2026-08-13", tag:"电学"

  },

  {

    type:"animation", title:"游标卡尺交互动画",

    desc:"10/20 分度游标卡尺的刻度原理与加减法读数交互演示。",

    icon:"📏", cover:"assets/img/vernier-caliper-cover.jpg",

    link:"animations/vernier-caliper.html", date:"2026-08-14", tag:"测量"

  },

  {

    type:"animation", title:"圆形磁场区·磁聚焦与磁发散",

    desc:"带电粒子在圆形边界磁场中的聚焦与发散轨迹交互演示。",

    icon:"🧲", cover:"assets/img/circular-bfield-focus-cover.jpg",

    link:"animations/circular-bfield-focus.html", date:"2026-08-14", tag:"电磁学"

  },

  {

    type:"animation", title:"带电粒子射入圆形边界磁场",

    desc:"粒子射入圆形边界磁场的偏转、临界与边界轨迹分析。",

    icon:"⚡", cover:"assets/img/charged-particle-circular-boundary-cover.jpg",

    link:"animations/charged-particle-circular-boundary.html", date:"2026-08-14", tag:"电磁学"

  },

  {

    type:"animation", title:"斜抛运动",

    desc:"二维斜抛运动的轨迹、射程与最高点交互演示。",

    icon:"🎯", cover:"assets/img/oblique-projectile-cover.jpg",

    link:"animations/oblique-projectile.html", date:"2026-08-14", tag:"力学"

  },

  {

    type:"animation", title:"波的反向与驻波",

    desc:"入射波与反向波叠加形成驻波，演示波节与波腹。",

    icon:"〰️", cover:"assets/img/wave-reflection-standing-2-cover.jpg",

    link:"animations/wave-reflection-standing-2.html", date:"2026-08-14", tag:"波动"

  },

  {

    type:"animation", title:"放射源粒子在匀强磁场中的运动",

    desc:"放射源向各方向发射带电粒子，在匀强磁场中做圆周运动。",

    icon:"☢️", cover:"assets/img/magnetic-radioactive-source-cover.jpg",

    link:"animations/磁场放射源粒子.html", date:"2026-08-14", tag:"电磁学"

  },

  /* ---------------- 解题 ---------------- */

  {

    type:"solve", title:"2026湖北高考物理压轴题",

    desc:"电场与磁场中的往复运动综合题，分步拆解高考压轴难点。",

    icon:"🏆", link:"solutions/2026-hubei-final.html", cover:"assets/img/2026-hubei-final-cover.jpg", date:"2026-08-13", tag:"高考压轴"

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

  /* ---- 题典三页式解题讲解（2026-08-14 批量注册）---- */
  {
    type:"solve", title:"2025河南卷T3 · 磁场电场复合场",
    desc:"复合场中粒子的偏转与运动，三步拆解电场+磁场综合题。",
    icon:"🧲", link:"solutions/magnetic2_animation.html", cover:"solutions/magnetic2_animation.png", date:"2026-08-14", tag:"电磁学"
  },
  {
    type:"solve", title:"2026四川卷T15 · 带电粒子在组合磁场中的运动",
    desc:"组合磁场中粒子的临界与周期性运动，逐问拆解。",
    icon:"🌀", link:"solutions/magnetic3_animation.html", cover:"solutions/magnetic3_animation.png", date:"2026-08-14", tag:"电磁学"
  },
  {
    type:"solve", title:"2025甘肃卷T10 · 托卡马克环形磁场（三粒子轨迹）",
    desc:"托卡马克截面磁场中三类粒子的轨迹比较与半径判定。",
    icon:"⚛️", link:"solutions/magnetic4_animation.html", cover:"solutions/magnetic4_animation.png", date:"2026-08-14", tag:"电磁学"
  },
  {
    type:"solve", title:"2025广西卷T10 · 速度选择器与偏转磁场",
    desc:"速度选择器筛选原理 + 偏转磁场中的圆周运动通法。",
    icon:"🎯", link:"solutions/magnetic5_animation.html", cover:"solutions/magnetic5_animation.png", date:"2026-08-14", tag:"电磁学"
  },
  {
    type:"solve", title:"2025广东深圳三模 · 叠加场中小球的运动",
    desc:"叠加场中小球受力与运动过程的分段拆解。",
    icon:"🔋", link:"solutions/magnetic6_animation.html", cover:"solutions/magnetic6_animation.png", date:"2026-08-14", tag:"电磁学"
  },
  {
    type:"solve", title:"2026宁夏吴忠三模T24 · 圆弧槽与弹簧",
    desc:"圆弧槽+弹簧系统的能量与动量综合，分步建模。",
    icon:"🪀", link:"solutions/mock_exam_animation.html", cover:"solutions/mock_exam_animation.png", date:"2026-08-14", tag:"力学"
  },
  {
    type:"solve", title:"2026广东高考物理 · 球形机器人跳跃",
    desc:"球形机器人跳跃的能量转化与动力学过程拆解。",
    icon:"🤖", link:"solutions/physics_animation.html", cover:"solutions/physics_animation.png", date:"2026-08-14", tag:"力学"
  },




  /* ---------------- 视频 ---------------- */

  {

    type:"video", title:"钱塘大潮",

    desc:"钱塘江潮汐涌潮航拍实录：把自然界中的“波”搬进物理课堂。",

    icon:"🌊", cover:"assets/img/qiantang-tide-cover.png",

    link:"videos/qiantang-tide.html", date:"2026-08-13", tag:"自然现象"

  },

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



  {

    type:"video", title:"杨氏双缝干涉实验",

    desc:"单色光通过双缝产生等间距干涉条纹，验证光的波动性。",

    icon:"🔬", link:"videos/young-double-slit.html", cover:"assets/img/young-double-slit-cover.jpg", date:"2026-08-14", tag:"光学"

  },

  {

    type:"video", title:"蛇形摆（摆波）",

    desc:"摆长略异的单摆同步释放，呈现蛇形、聚散与复原的周期性图案。",

    icon:"🌀", link:"videos/蛇形摆.html", date:"2026-08-14", tag:"机械振动"

  },

  {

    type:"video", title:"密立根油滴实验",

    desc:"带电油滴在电场中受力平衡，测定基本电荷 e，证实电荷量子化。",

    icon:"💧", link:"videos/millikan-oil-drop.html", date:"2026-08-14", tag:"电场"

  },


  {

    type:"video", title:"伽利略斜面实验",

    desc:"用斜面“冲淡重力”研究自由落体，是匀变速运动与实验科学方法的经典开端。",

    icon:"🧪", link:"videos/galileo_inclined_plane.html", date:"2026-08-14", tag:"运动学"

  },

  {

    type:"video", title:"伽利略理想斜面实验",

    desc:"思想实验：无摩擦小球将沿水平面匀速永远运动，为惯性定律埋下伏笔。",

    icon:"🧪", link:"videos/galileo_ideal_inclined_plane.html", date:"2026-08-14", tag:"运动学"

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

  },,
  {
    type:"animation",
    title:"卡文迪许扭秤实验·交互动画讲解",
    desc:"装置设计精妙、光路放大法测微小扭转、操作数据处理与万有引力常量 G 的现实意义，含光路转动动画。",
    icon:"⚖️",
    cover:"assets/img/cavendish-torsion-balance-cover.png",
    link:"animations/cavendish-torsion-balance.html",
    date:"2026-08-14",
    tag:"万有引力"
  },
  {
    type:"article",
    title:"物理迁移能力的野蛮生长",
    desc:"知识半衰期缩到三五年，AI 让“记住答案”一文不值。本文探讨物理迁移能力如何把一处长出的思维扦插到另一处照样成活。",
    icon:"🌱",
    link:"articles/物理迁移能力的野蛮生长.html",
    date:"2026-08-15",
    tag:"学习方法"
  }

];

const TYPE_LABEL = {
  article:"文章", animation:"HTML动画", solve:"解题", video:"视频", work:"作品"
};

const TYPE_GRAD = {
  article:"grad-article", animation:"grad-animation", solve:"grad-solve", video:"grad-video", work:"grad-work"
};

