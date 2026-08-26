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







  {



    type:"article", title:"物理笔忌：从课堂复印机到思维炼炉",



    desc:"反思物理课堂中的“复印机式”灌输，倡导把课堂从知识搬运变为思维炼炉。",



    icon:"✍️", link:"articles/physics-pitfalls.html", date:"2026-08-14", tag:"教学反思"



  },







  {

    type:"article", title:"从漫灌到导灌：高中物理课堂讲授法的内涵重塑与实践路径",

    desc:"从“漫灌”式讲授转向“导灌”式讲授，重塑高中物理课堂讲授法的内涵与实践路径。",

    icon:"📝", link:"articles/从漫灌到导灌.html", date:"2026-08-24", tag:"教学实践"

  },



  /* ---------------- HTML 动画 ---------------- */















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















    icon:"🎯", cover:"assets/img/oblique-projectile-cover.png",















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















    {



    type:"animation", title:"2026黑吉辽蒙T15 动画",



    desc:"时间分辨-能量分析仪物理过程动画：电场偏转、磁场约束与能量分析的动态演示。",



    icon:"🎬",     link:"animations/2026-heijiliaomeng-t15-animation.html", date:"2026-08-17", tag:"高考压轴"



  },







  {



    type:"animation", title:"运动学追赶动画",



    desc:"两物体直线追赶的运动学动画，可调初始间距与速度，直观演示追及过程与方法。",



    icon:"🏃", cover:"assets/img/kinematics-chase-cover.png", link:"animations/kinematics-chase.html", date:"2026-08-17", tag:"运动学"



  },







  {



    type:"animation", title:"匀变速位移逼近",



    desc:"匀变速直线运动中用矩形条逼近位移，直观演示极限思想与 v-t 图面积含义。",



    icon:"📐", cover:"assets/img/uniform-acceleration-displacement-cover.png", link:"animations/uniform-acceleration-displacement.html", date:"2026-08-17", tag:"运动学"



  },







  {



    type:"animation", title:"高中物理实验数据处理系统",



    desc:"高中物理实验数据处理系统：数据记录、数据变换、坐标建立、描点、线形拟合、由线出结果。",



    icon:"📊", link:"animations/物理实验数据处理系统.html", date:"2026-08-18", tag:"实验探究"



  },







  {
    type:"animation", title:"七彩喷泉粒子动画",
    desc:"喷泉彩色粒子动画，演示水流喷射与粒子扩散的视觉效果。",
    icon:"💧", cover:"assets/img/fountain-cover.png", link:"animations/fountain_animation.html", date:"2026-08-27", tag:"流体动画"
  },

    {
    type:"animation", title:"带电粒子在环形磁场中的运动",
    desc:"带电粒子在环形磁场中的圆周运动与偏转动画演示。",
    icon:"⭕", link:"animations/环形磁场_particle_ring_field.html", date:"2026-08-27", tag:"电磁学"
  },

/* ---------------- 解题 ---------------- */















  {















    type:"solve", title:"2026湖北高考物理压轴题",















    desc:"电场与磁场中的往复运动综合题，分步拆解高考压轴难点。",















    icon:"🏆", link:"solutions/2026-hubei-final.html", cover:"assets/img/2026-hubei-final-cover.jpg", date:"2026-08-13", tag:"高考压轴"















  },















  /* ---- 题典三页式解题讲解（2026-08-14 批量注册）---- */







  {







    type:"solve", title:"2025河南卷T3 · 磁场电场复合场",







    desc:"复合场中粒子的偏转与运动，三步拆解电场+磁场综合题。",







    icon:"🧲", link:"solutions/magnetic2_animation.html", cover:"assets/img/2025-henan-t3-cover.png", date:"2026-08-14", tag:"电磁学"







  },







  {







    type:"solve", title:"2026四川卷T15 · 带电粒子在组合磁场中的运动",







    desc:"组合磁场中粒子的临界与周期性运动，逐问拆解。",







    icon:"🌀", link:"solutions/magnetic3_animation.html", cover:"assets/img/2026-sichuan-t15-cover.png", date:"2026-08-14", tag:"电磁学"







  },







  {







    type:"solve", title:"2025甘肃卷T10 · 托卡马克环形磁场（三粒子轨迹）",







    desc:"托卡马克截面磁场中三类粒子的轨迹比较与半径判定。",







    icon:"⚛️", link:"solutions/magnetic4_animation.html", cover:"assets/img/2025-gansu-cover.png", date:"2026-08-14", tag:"电磁学"







  },







  {







    type:"solve", title:"2025广西卷T10 · 速度选择器与偏转磁场",







    desc:"速度选择器筛选原理 + 偏转磁场中的圆周运动通法。",







    icon:"🎯", link:"solutions/magnetic5_animation.html", cover:"assets/img/2025-guangxi-cover.png", date:"2026-08-14", tag:"电磁学"







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







    icon:"🤖", link:"solutions/physics_animation.html", cover:"assets/img/2026-guangdong-cover.png", date:"2026-08-14", tag:"力学"







  },



  {



    type:"solve",



    title:"2026黑吉辽蒙T14 · 单摆碰撞弹簧系统",



    desc:"单摆与弹簧系统的碰撞综合问题，三页式交互讲解：试题环绕、物理过程动画、交互式填空解题。",



    icon:"🪀",



    cover:"assets/img/doc7-solve-cover.png",



    link:"solutions/doc7_animation.html",



    date:"2026-08-16",



    tag:"力学"



  },



  {



    type:"solve",



    title:"2026云南卷T15 · 弹球游戏装置",



    desc:"弹球游戏装置的碰撞与能量综合问题，三页式交互讲解：试题环绕、物理过程动画、交互式填空解题。",



    icon:"🔵",



    cover:"assets/img/doc4-solve-cover.png",



    link:"solutions/doc4_animation.html",



    date:"2026-08-16",



    tag:"力学"



  },















    {



    type:"solve", title:"2026黑吉辽蒙T15 解题",



    desc:"2026 黑吉辽蒙高考物理压轴题分步拆解：电场+磁场+能量分析完整解题过程。",



    icon:"💡", link:"solutions/2026-heijiliaomeng-t15-solution.html", date:"2026-08-17", tag:"高考压轴"



  },







  /* ---------------- 视频 ---------------- */















  {















    type:"video", title:"钱塘大潮",















    desc:"钱塘江潮汐涌潮航拍实录：把自然界中的“波”搬进物理课堂。",















    icon:"🌊", cover:"assets/img/qiantang-tide-cover.png",















    link:"videos/qiantang-tide.html", date:"2026-08-13", tag:"自然现象"















  },















  {















    type:"video", title:"杨氏双缝干涉实验",















    desc:"单色光通过双缝产生等间距干涉条纹，验证光的波动性。",















    icon:"🔬", link:"videos/young-double-slit.html", cover:"assets/img/young-double-slit-cover.jpg", date:"2026-08-14", tag:"光学"















  },















  {















    type:"video", title:"蛇形摆（摆波）",















    desc:"摆长略异的单摆同步释放，呈现蛇形、聚散与复原的周期性图案。",















    icon:"🌀", link:"videos/蛇形摆.html", cover:"assets/img/snake-pendulum-cover.jpg", date:"2026-08-14", tag:"机械振动"















  },















  {















    type:"video", title:"密立根油滴实验",















    desc:"带电油滴在电场中受力平衡，测定基本电荷 e，证实电荷量子化。",















    icon:"💧", cover:"assets/img/millikan-oil-drop-cover.jpg", link:"videos/millikan-oil-drop.html", date:"2026-08-14", tag:"电场"















  },















  {















    type:"video", title:"伽利略斜面实验",















    desc:"用斜面“冲淡重力”研究自由落体，是匀变速运动与实验科学方法的经典开端。",















    icon:"🧪", cover:"assets/img/galileo_inclined_plane-cover.jpg", link:"videos/galileo_inclined_plane.html", date:"2026-08-14", tag:"运动学"















  },















  {















    type:"video", title:"伽利略理想斜面实验",















    desc:"思想实验：无摩擦小球将沿水平面匀速永远运动，为惯性定律埋下伏笔。",















    icon:"🧪", cover:"assets/img/galileo_ideal_inclined_plane-cover.jpg", link:"videos/galileo_ideal_inclined_plane.html", date:"2026-08-14", tag:"运动学"















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



    type:"animation",



    title:"传感器测速",



    desc:"脉冲测距与实时速度计算的传感器测速交互动画，演示测速原理、脉冲测距与速度数据处理过程。",



    icon:"📡",



    cover:"assets/img/sensor-cover.png",



    link:"animations/传感器测量.html",



    date:"2026-08-15",



    tag:"力学"



  },



  {



    type:"animation",



    title:"电势电场线 3D（四类电荷）",



    desc:"演示四类电荷分布下的电场线与等势面三维模型，支持 2D/3D 切换与实时旋转观察。",



    icon:"⚡",



    cover:"assets/img/field-lines-cover.png",



    link:"animations/电势电场线3D.html",



    date:"2026-08-15",



    tag:"电磁学"



  },



  {



    type:"animation",



    title:"水下点光源折射与全反射",



    desc:"演示水下点光源发出的光线经水面折射与全反射的三维光路，可调折射率与光源深度观察临界角与光斑。",



    icon:"💡",



    cover:"assets/img/underwater-cover.png",



    link:"animations/水下点光源折射全反射.html",



    date:"2026-08-16",



    tag:"光学"



  },



  {



    type:"solve",



    title:"2026江苏卷T16 · 四球双弹簧弹性碰撞",



    desc:"江苏卷压轴：四个小球通过两根弹簧连接，弹簧振子与弹性碰撞耦合，三段式交互讲解碰撞序列与能量分配。",



    icon:"🔵",



    cover:"assets/img/doc2-solve-cover.png",



    link:"solutions/doc2_animation.html",



    date:"2026-08-16",



    tag:"力学"



  },



  {



    type:"solve",



    title:"2026湖北卷T15 · 光滑轨道弹性碰撞链",



    desc:"光滑轨道上的弹性碰撞链问题，三页式交互讲解：试题环绕、物理过程动画、交互式填空解题。",



    icon:"🔵",



    cover:"assets/img/2026-hubei-t15-cover.png",



    link:"solutions/doc3_animation.html",



    date:"2026-08-16",



    tag:"力学"



  },



  {



    type:"animation",



    title:"传送带上的滑块运动",



    desc:"水平传送带滑块动力学：可调传送带速度、滑块初速与摩擦系数，实时观察相对运动、摩擦方向切换与加速过程。",



    icon:"🏭",



    cover:"assets/img/conveyor-belt-cover.png",



    link:"animations/传送带滑块运动.html",



    date:"2026-08-16",



    tag:"力学"



  },



  {



    type:"animation",



    title:"滑块与木板模型",



    desc:"滑块在木板上的相对运动动力学动画，直观展示摩擦力、加速度与相对位移的关系。",



    icon:"🧱",



    cover:"assets/img/block-plank-cover.png",



    link:"animations/滑块木板模型.html",



    date:"2026-08-16",



    tag:"力学"



  },



  {



    type:"solve",



    title:"2026四川T14 · U形框导体棒弹簧电磁感应",



    desc:"U形框-导体棒-弹簧电磁感应系统，演示导体棒在磁场中运动产生感应电流与阻尼振动的过程。",



    icon:"🧲",



    link:"animations/doc8_animation.html",



    date:"2026-08-17",



    tag:"电磁学"



  },



















  {



    type:"article",



    title:"物理迁移能力的野蛮生长",



    desc:"知识半衰期缩到三五年，AI 让“记住答案”一文不值。本文探讨物理迁移能力如何把一处长出的思维扦插到另一处照样成活。",



    icon:"🌱",



    link:"articles/物理迁移能力的野蛮生长.html",



    date:"2026-08-15",



    tag:"学习方法"



  },



  {







    type:"article", title:"与高考物理命题老师的思维同频共振",







    desc:"透视高考物理命题的金字塔结构（一核四层四翼），拆解命题人“建塔”逻辑，给出反向拆题与同频备考路径。",







    icon:"🧠", link:"articles/与高考物理命题老师思维同频共振.html", date:"2026-08-15", tag:"命题思维"







  },



  {



    type:"video", title:"卡文迪许扭秤实验",



    desc:"用光路放大法测量微小引力，首次测得万有引力常量 G 并称量地球质量。",



    icon:"⚖️", cover:"assets/img/cavendish-torsion-balance-cover.png",



    link:"videos/cavendish_torsion_balance_video.html", date:"2026-08-15", tag:"万有引力"



  },







  {



    type:"video", title:"傅科摆",



    desc:"单摆摆动平面随时间缓慢进动，直观证明地球自转，是课堂上经典的地转演示。",



    icon:"🌍", link:"videos/foucault_pendulum.html", date:"2026-08-16", tag:"机械振动"



  },







  {



    type:"video", title:"时钟变慢",



    desc:"从爱因斯坦到光钟推导，用动画看懂狭义相对论的时间膨胀。物理小新口播讲解。",



    icon:"⏳", link:"videos/time_dilation.html", date:"2026-08-17", tag:"近代物理"



  }



];







const TYPE_LABEL = {



  article:"文章", animation:"HTML动画", solve:"解题", video:"视频", work:"作品"



};







const TYPE_GRAD = {



  article:"grad-article", animation:"grad-animation", solve:"grad-solve", video:"grad-video", work:"grad-work"



};







