/* ============================================================
   物理一对一 · 异地同板教室  —  前端核心
   钢笔多色 / 橡皮 / 框擦 / 激光 / 力矢量 / 力合成 / 电路符号
   实时同步：op 增量 + live 笔迹跟手 + 光标 + 全量 sync
   ============================================================ */
const $ = (s) => document.querySelector(s);
const cv = $('#cv');
const stage = $('#stage');
const anno = document.getElementById('anno');
const ctx = cv.getContext('2d');
const cvInk = document.getElementById('cvInk');
const ikctx = cvInk.getContext('2d');
const cvPred = document.getElementById('cvPred');
const pkctx = cvPred.getContext('2d');

const PALETTE = ['#2c333f', '#b83a2e', '#e04b3a', '#1d63c9', '#1c7f56', '#7a3fb0', '#c47a00', '#0f8a9a'];

const S = {
  role: '',
  name: '',
  room: '',
  ws: null,
  myId: Math.random().toString(36).slice(2, 9),
  connected: false,
  peerOnline: false,
  canDraw: true,
  tool: 'pen',
  color: '#2c333f',
  size: 3,
  view: { x: 40, y: 30, scale: 1 },
  pages: [[]],
  page: 0,
  draft: null,
  live: new Map(),       // 对方正在画的笔迹 id -> el
  liveTimers: {},
  peerCursor: null,
  peerLaser: null,
  myLaser: null,
  peer: null,
  dragEl: null,
  dragging: null,
  boxSel: null,
  history: [],
  future: [],
  images: new Map(),
  symKind: 'battery',
  symRot: 0,
  lastLive: 0,
  lastCursor: 0,
  showCursor: true,
  laserShare: true,
  spaceDown: false,
  needSync: false,
  followView: true,      // 学生端：是否跟着老师的视角走（投影大屏用）
  viewT: null,           // 学生端视角目标（平滑过渡）
  viewSent: null,        // 老师端上一次广播出去的视角
  viewAt: 0,
  lastPeerView: null,    // 学生端：老师最近一次的视角（窗口变化时据此重算）
  anno: [],              // 课件上的标注笔画（世界坐标）
  annoMode: false,
  annoTool: 'pen',
  liveVer: 0,            // 对端笔迹每更新一次 +1
  contentVer: 0,         // 板书内容被改动（增/删/拖动/擦除）+1，用来决定底层要不要重画
  annoDraft: null,
  penSeen: false,        // iPad：见过 Apple Pencil 之后，手指一律不再当笔（防掌托抢笔）
  lastEvT: 0,            // 最近一次指针事件时间（看门狗用来判断"抬起事件是不是丢了"）
  lastPenAt: 0,          // 最近一次"笔尖接触屏幕"的移动时间（用来判断落笔/抬笔事件是否漏发）
  penPressSeen: false,   // 这台设备是否上报压力/按键（不上报时就不能用压力判断接触，得退回事件类型）
  cancelPos: null,       // 笔被系统掐断时最后一个点（判定是否原地续写）
  canceledAt: 0,
  canceledDraft: false,
};

/* ---------------- 工具函数 ---------------- */
/* 画布分辨率上限：iPad 上 2 倍像素意味着 2700×2000 的画布，写字时每帧的搬运量翻倍。
   平时用满，一旦检测到写字掉帧就自动往下调一档（观感几乎无差，跟手明显变好）。 */
const dprCap = { v: 2, at: 0, slow: 0 };
const dpr = () => Math.min(window.devicePixelRatio || 1, dprCap.v);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Math.random().toString(36).slice(2, 10);
const cur = () => S.pages[S.page];
const bumpContent = () => { S.contentVer = (S.contentVer || 0) + 1; };

function toWorld(e) {
  const r = cv.getBoundingClientRect();
  return {
    x: (e.clientX - r.left - S.view.x) / S.view.scale,
    y: (e.clientY - r.top - S.view.y) / S.view.scale,
  };
}

/* ---------------- 画布尺寸 ---------------- */
function resize() {
  const d = dpr();
  const w = stage.clientWidth, h = stage.clientHeight;
  cv.width = Math.round(w * d);
  cv.height = Math.round(h * d);
  cvInk.width = cv.width; cvInk.height = cv.height;
  cvPred.width = cv.width; cvPred.height = cv.height;
  plog('resize', 'w=' + cv.width + ' h=' + cv.height + ' d=' + d);
  stageKey = '';
  buildBase(d);
  stageKey = contentKey();
  if (S.inkOwn && S.draft) inkRedraw(S.draft);
  annoResize();
  S.viewSent = null;   // 画布尺寸变了，老师端下次重绘时重新广播一次视角
  render();
}
window.addEventListener('resize', () => {
  // 学生端跟随中：窗口/投影尺寸一变，按老师视野重算一次，屏幕里内容不跑偏
  if (S.role === 'student' && S.followView && S.lastPeerView) {
    S.view = followViewTarget(S.lastPeerView);
    updateZoom();
  }
  courseLayout();
  resize();
});

/* ---------------- 渲染 ---------------- */
/* 两层画布：
     cvBase —— 白底 + 网格 + 已经写好的板书，只在内容/视角变化时重画一次；
     cv     —— 透明叠在上面，只画"正在写的这一笔、对端笔迹、光标、激光"这些每帧都在动的东西。
   iPad 上这样写一个字的代价 ≈ 清一块透明层 + 画一条曲线，不再每帧重画整幅板书；
   而且两层由浏览器自己做合成，不做整屏位图拷贝（Safari 上那种拷贝容易出闪烁/断口）。 */
const bcv = document.getElementById('cvBase');
const bx = bcv ? bcv.getContext('2d') : null;
let stageKey = '';

function contentKey() {
  return [
    cur().length,
    S.view.x.toFixed(2), S.view.y.toFixed(2), S.view.scale.toFixed(4),
    S.page || 0, cv.width, cv.height, S.contentVer || 0,
  ].join('|');
}

function syncBaseSize() {
  if (!bcv) return;
  const W = Math.max(1, cv.width), H = Math.max(1, cv.height);
  if (bcv.width !== W || bcv.height !== H) {
    bcv.width = W;
    bcv.height = H;
    stageKey = '';
  }
}

let rafLock = false;
let lastFrameAt = 0;
function requestRender() {
  if (rafLock) return;
  rafLock = true;
  requestAnimationFrame(() => {
    rafLock = false;
    const now = performance.now();
    // 只在"正在写字"时判断掉帧：写字的每一帧都该在 16ms 内交付
    if (S.draft && lastFrameAt) {
      const dt = now - lastFrameAt;
      if (dt > 26) dprCap.slow++;
      else dprCap.slow = Math.max(0, dprCap.slow - 1);
      if (dprCap.slow >= 5 && dprCap.v > 1.25 && now - dprCap.at > 2500) {
        dprCap.v = Math.max(1.25, dprCap.v - 0.25);
        dprCap.at = now;
        dprCap.slow = 0;
        lastFrameAt = 0;
        resize();
        toast('书写有点吃力，已自动降低一档渲染精度来保证跟手（不影响板书内容）', 4000);
        return;
      }
    }
    const dtFrame = lastFrameAt ? now - lastFrameAt : 0;
    lastFrameAt = now;
    if (dtFrame > 34) plog('slowframe', Math.round(dtFrame) + 'ms');
    render();
  });
}

/* ---------------- 墨迹层：逐段追加，毫秒级跟手 ----------------
   Notability / GoodNotes 那类 iPad 手写的关键不是"画得快"，而是：
   1) 一笔开始后，这一笔的每一段只增量画到专用墨迹层，绝不清屏、绝不重画整页；
   2) 落笔即画，不等下一帧（少了 rAF 那最多 16ms 的等待）；
   3) 用系统的预测笔迹在前面"放"一小段，视觉上贴着笔尖。 */
/* ---------------- 湿墨 = 直接画在"底板"上 ----------------
   为什么不再用单独的墨迹层：iPad Chrome/Safari 对多层 canvas 的合成并不总是可靠，
   一层看不见就等于"写了没墨"。底板(cvBase) 是屏幕上确定可见的那一层，
   所以正在写的这一笔就直接逐段画上去，只是把"整页重画"推迟到落笔之后。
   代价：一笔的每一段只是几十个 lineTo，不到 0.2ms；收益：所见即所写，永不出层。 */
function baseCtx() {
  if (!bx || !bcv) return null;
  const d = dpr();
  const sc = S.view.scale * d;
  bx.setTransform(sc, 0, 0, sc, S.view.x * d, S.view.y * d);
  return bx;
}
function paintSeg(el, from) {
  if (!el || !el.pts || !el.pts.length) return;
  const g = baseCtx();
  if (!g) return;
  const pts = el.pts;
  const i0 = Math.max(0, (from || 1) - 1);
  g.globalAlpha = el.mode === 'hl' ? 0.4 : 1;
  g.strokeStyle = el.color || '#2c333f';
  g.fillStyle = el.color || '#2c333f';
  g.lineWidth = el.w || 3;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (pts.length === 1) {
    g.beginPath(); g.arc(pts[0].x, pts[0].y, (el.w || 3) / 2, 0, Math.PI * 2); g.fill();
  } else {
    g.beginPath();
    g.moveTo(pts[i0].x, pts[i0].y);
    for (let i = i0 + 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.stroke();
  }
  g.globalAlpha = 1;
  bx.setTransform(1, 0, 0, 1, 0, 0);
}
function inkBegin(el) {
  S.inkOwn = true;
  paintSeg(el, 1);
}
function inkAppend(el, from) {
  if (!S.inkOwn) return;
  paintSeg(el, from);
}
function inkRedraw(el) {
  if (!el || !el.pts || !el.pts.length) return;
  paintSeg(el, 1);
}
function inkViewKey() { return ''; }
function inkSetup(g) { /* 保留空实现，兼容旧调用 */ }
function inkCommit() {
  const painted = !!S.inkOwn;
  inkEnd();
  return painted;
}
function inkEnd() {
  S.inkOwn = false;
  S.inkBlit = false;
  if (ikctx) { ikctx.setTransform(1, 0, 0, 1, 0, 0); ikctx.clearRect(0, 0, cvInk.width, cvInk.height); }
  if (pkctx) { pkctx.setTransform(1, 0, 0, 1, 0, 0); pkctx.clearRect(0, 0, cvPred.width, cvPred.height); }
}
/* 预测笔迹：Safari/Chrome 有 getPredictedEvents 时，把"系统猜的下一小段"先画出来 */
function inkPredict(el, e) {
  if (!pkctx) return;
  pkctx.setTransform(1, 0, 0, 1, 0, 0);
  pkctx.clearRect(0, 0, cvPred.width, cvPred.height);
  if (!el || !el.pts || !el.pts.length || typeof e.getPredictedEvents !== 'function') return;
  let list = [];
  try { list = e.getPredictedEvents() || []; } catch (_) { return; }
  if (!list.length) return;
  inkSetup(pkctx);
  pkctx.strokeStyle = el.color || '#2c333f';
  pkctx.globalAlpha = 0.92;
  pkctx.lineWidth = (el.w || 3);
  const last = el.pts[el.pts.length - 1];
  pkctx.beginPath();
  pkctx.moveTo(last.x, last.y);
  for (const ev of list) { const q = toWorld(ev); pkctx.lineTo(q.x, q.y); }
  pkctx.stroke();
  pkctx.globalAlpha = 1;
}

function render() {
  // 老师端：视角（平移/缩放）变了就广播给学生，让大屏投影始终对着老师正在写的区域
  if (S.role === 'teacher' && S.peer) {
    const now0 = performance.now();
    const lv = S.viewSent;
    if (!lv || Math.abs(lv.x - S.view.x) > 0.6 || Math.abs(lv.y - S.view.y) > 0.6 || Math.abs(lv.scale - S.view.scale) > 0.004) {
      if (now0 - (S.viewAt || 0) > 80) {
        S.viewAt = now0;
        S.viewSent = { x: S.view.x, y: S.view.y, scale: S.view.scale };
        relay({ type: 'view', x: S.view.x, y: S.view.y, scale: S.view.scale, w: stage.clientWidth, h: stage.clientHeight });
      }
    }
  }
  const d = dpr();
  syncBaseSize();
  const key = contentKey();
  if (key !== stageKey) {
    if (S.drawMode && S.inkOwn) {
      S.needRebuild = true;              // 正在写：先别刷底板，落笔后再重画
    } else {
      buildBase(d);
      stageKey = key;
      S.needRebuild = false;
    }
  }
  // 前景层整块清成透明（比搬一张大位图便宜得多）
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);

  const sc = S.view.scale * d;
  ctx.setTransform(sc, 0, 0, sc, S.view.x * d, S.view.y * d);

  for (const el of S.live.values()) drawEl(ctx, el, true);   // 对端正在写的笔迹
  if (S.draft && !S.inkOwn) drawEl(ctx, S.draft, true);      // 自己正在写的这一笔（钢笔已由墨迹层接管）
  drawAnglePts(ctx);

  // 选择框
  if (S.boxSel) {
    ctx.save();
    ctx.strokeStyle = 'rgba(29,99,201,.8)';
    ctx.fillStyle = 'rgba(29,99,201,.06)';
    ctx.lineWidth = 1 / S.view.scale;
    const b = normRect(S.boxSel);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.restore();
  }

  drawLaser();
  drawCursors();
  drawAnno();
}

/* 重画底层：白底 + 网格 + 已提交板书 */
function buildBase(d) {
  if (!bx) return;
  const _tb = performance.now();
  bx.setTransform(1, 0, 0, 1, 0, 0);
  bx.fillStyle = '#ffffff';
  bx.fillRect(0, 0, bcv.width, bcv.height);
  const sc = S.view.scale * d;
  bx.setTransform(sc, 0, 0, sc, S.view.x * d, S.view.y * d);
  drawGrid(bx);
  for (const el of cur()) drawEl(bx, el);
  bx.setTransform(1, 0, 0, 1, 0, 0);
  plog('buildBase', 'els=' + cur().length + ' 耗时=' + Math.round(performance.now() - _tb) + 'ms');
}

function drawAnglePts(g) {
  if (!S.angPts || !S.angPts.length) return;
  g.save();
  g.fillStyle = '#b83a2e';
  S.angPts.forEach((q, i) => {
    g.beginPath();
    g.arc(q.x, q.y, 4 / S.view.scale, 0, Math.PI * 2);
    g.fill();
    g.font = (11 / S.view.scale) + 'px sans-serif';
    g.fillText(i === 0 ? '顶点' : '边' + i, q.x + 8 / S.view.scale, q.y - 6 / S.view.scale);
  });
  g.restore();
}

function drawGrid(g) {
  g = g || ctx;
  const sc = S.view.scale;
  const r = { width: cv.clientWidth, height: cv.clientHeight };
  const gap = 40;
  const x0 = Math.floor((-S.view.x / sc) / gap) * gap;
  const y0 = Math.floor((-S.view.y / sc) / gap) * gap;
  const x1 = (r.width - S.view.x) / sc;
  const y1 = (r.height - S.view.y) / sc;
  ctx.save();
  g.strokeStyle = '#f0f2f6';
  g.lineWidth = 1 / sc;
  g.beginPath();
  for (let x = x0; x < x1; x += gap) { g.moveTo(x, 0); g.lineTo(x, y1); }
  for (let y = y0; y < y1; y += gap) { g.moveTo(0, y); g.lineTo(x1, y); }
  g.stroke();
  g.restore();
}

function normRect(b) {
  return {
    x: Math.min(b.x1, b.x2),
    y: Math.min(b.y1, b.y2),
    w: Math.abs(b.x2 - b.x1),
    h: Math.abs(b.y2 - b.y1),
  };
}

/* ---------------- 元素绘制 ---------------- */
function drawEl(g, el, isPreview) {
  if (!el) return;
  g.save();
  g.strokeStyle = el.color || '#2c333f';
  g.fillStyle = el.color || '#2c333f';
  g.lineWidth = el.w || 3;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (isPreview) g.globalAlpha = el.type === 'path' ? 0.9 : 0.75;

  switch (el.type) {
    case 'path': drawPath(g, el); break;
    case 'line': drawLine(g, el, false); break;
    case 'dash': drawLine(g, el, true); break;
    case 'arrow': drawArrow(g, el.x1, el.y1, el.x2, el.y2, el.w || 3, el.color, el.label); break;
    case 'vecsum': drawVecSum(g, el); break;
    case 'circle': drawCircleEl(g, el); break;
    case 'angle': drawAngleEl(g, el); break;
    case 'symbol': drawSymbol(g, el); break;
    case 'text': drawText(g, el); break;
    case 'image': drawImage(g, el); break;
  }
  g.restore();
}

function drawPath(g, el) {
  const p = el.pts;
  if (!p || !p.length) return;
  if (p.length === 1) {
    g.beginPath();
    g.arc(p[0].x, p[0].y, (el.w || 3) / 2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (el.mode === 'hl') {
    g.globalAlpha = (g.globalAlpha) * 0.34;
    g.lineWidth = (el.w || 3) * 3.2;
  }
  g.beginPath();
  g.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i].x + p[i + 1].x) / 2;
    const my = (p[i].y + p[i + 1].y) / 2;
    g.quadraticCurveTo(p[i].x, p[i].y, mx, my);
  }
  const last = p[p.length - 1];
  g.lineTo(last.x, last.y);
  g.stroke();
}

function drawLine(g, el, dashed) {
  if (dashed) g.setLineDash([9, 7]);
  g.beginPath();
  g.moveTo(el.x1, el.y1);
  g.lineTo(el.x2, el.y2);
  g.stroke();
}

function drawArrow(g, x1, y1, x2, y2, w, color, label) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const head = clamp(len * 0.28, 8, 20);
  g.strokeStyle = color;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();

  g.beginPath();
  g.moveTo(x2, y2);
  g.lineTo(x2 - ux * head - uy * head * 0.5, y2 - uy * head + ux * head * 0.5);
  g.lineTo(x2 - ux * head + uy * head * 0.5, y2 - uy * head - ux * head * 0.5);
  g.closePath();
  g.fill();

  if (label) {
    g.save();
    g.fillStyle = color;
    g.font = '600 17px "PingFang SC","Microsoft Yahei",sans-serif';
    g.fillText(label, x2 + ux * 10 + 4, y2 + uy * 10 - 4);
    g.restore();
  }
}

function drawVecSum(g, el) {
  const { ox, oy, ax, ay, bx, by } = el;
  const cx = ax + bx - ox, cy = ay + by - oy;
  g.save();
  // 平行四边形补线
  g.strokeStyle = 'rgba(120,130,150,.9)';
  g.lineWidth = 1.6;
  g.setLineDash([8, 6]);
  g.beginPath();
  g.moveTo(ax, ay); g.lineTo(cx, cy);
  g.moveTo(bx, by); g.lineTo(cx, cy);
  g.stroke();
  g.restore();

  drawArrow(g, ox, oy, ax, ay, 2.6, el.color, el.la || 'F₁');
  drawArrow(g, ox, oy, bx, by, 2.6, el.color, el.lb || 'F₂');
  drawArrow(g, ox, oy, cx, cy, 4.2, '#1d63c9', el.lr || 'F合');
}

function drawCircleEl(g, el) {
  g.beginPath();
  g.arc(el.cx, el.cy, el.r, 0, Math.PI * 2);
  g.stroke();
}

function drawAngleEl(g, el) {
  const { ax, ay, bx, by, cx, cy } = el; // 顶点 b
  g.beginPath();
  g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy);
  g.stroke();
  const a1 = Math.atan2(ay - by, ax - bx);
  const a2 = Math.atan2(cy - by, cx - bx);
  let diff = a2 - a1;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const r = Math.min(34, Math.hypot(ax - bx, ay - by) * 0.5, Math.hypot(cx - bx, cy - by) * 0.5);
  g.beginPath();
  g.arc(bx, by, r, a1, a1 + diff, diff < 0);
  g.stroke();
  const deg = Math.round(Math.abs(diff) * 180 / Math.PI);
  if (deg > 4 && deg < 176) {
    g.save();
    g.font = '600 14px sans-serif';
    g.fillStyle = el.color;
    const mid = a1 + diff / 2;
    g.fillText(deg + '°', bx + Math.cos(mid) * (r + 12) - 8, by + Math.sin(mid) * (r + 12) + 5);
    g.restore();
  }
}

/* 电路符号 */
function drawSymbol(g, el) {
  const x = el.x, y = el.y, s = el.s || 1;
  g.save();
  g.translate(x, y);
  g.rotate(el.rot || 0);
  g.scale(s, s);
  g.lineWidth = el.w || 2.4;
  const half = 26;

  switch (el.sym) {
    case 'battery':
      g.beginPath();
      g.moveTo(-half, 0); g.lineTo(-7, 0); g.moveTo(7, 0); g.lineTo(half, 0); g.stroke();
      g.beginPath(); g.moveTo(-7, -15); g.lineTo(-7, 15); g.stroke();
      g.beginPath(); g.moveTo(7, -8); g.lineTo(7, 8); g.stroke();
      break;
    case 'resistor':
      g.beginPath(); g.moveTo(-half, 0); g.lineTo(-13, 0); g.moveTo(13, 0); g.lineTo(half, 0); g.stroke();
      g.strokeRect(-13, -8, 26, 16);
      break;
    case 'rheostat':
      g.beginPath(); g.moveTo(-half, 0); g.lineTo(-16, 0); g.moveTo(16, 0); g.lineTo(half, 0); g.stroke();
      g.strokeRect(-16, -8, 32, 16);
      g.beginPath(); g.moveTo(0, -24); g.lineTo(0, -15); g.stroke();
      g.beginPath(); g.moveTo(-7, -27); g.lineTo(0, -22); g.lineTo(7, -27); g.stroke();
      break;
    case 'switch':
      g.beginPath(); g.moveTo(-half, 0); g.lineTo(-12, 0); g.moveTo(6, 0); g.lineTo(half, 0); g.stroke();
      g.beginPath(); g.arc(-12, 0, 3, 0, 7); g.stroke();
      g.beginPath(); g.arc(6, 0, 3, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(-11, -2); g.lineTo(5, -14); g.stroke();
      break;
    case 'bulb':
      g.beginPath(); g.moveTo(-half, 0); g.lineTo(-14, 0); g.moveTo(14, 0); g.lineTo(half, 0); g.stroke();
      g.beginPath(); g.arc(0, 0, 14, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(-10, -10); g.lineTo(10, 10); g.moveTo(10, -10); g.lineTo(-10, 10); g.stroke();
      break;
    case 'capacitor':
      g.beginPath(); g.moveTo(-half, 0); g.lineTo(-5, 0); g.moveTo(5, 0); g.lineTo(half, 0); g.stroke();
      g.beginPath(); g.moveTo(-5, -13); g.lineTo(-5, 13); g.moveTo(5, -13); g.lineTo(5, 13); g.stroke();
      break;
    case 'ammeter':
      g.beginPath(); g.moveTo(-half, 0); g.lineTo(-15, 0); g.moveTo(15, 0); g.lineTo(half, 0); g.stroke();
      g.beginPath(); g.arc(0, 0, 15, 0, 7); g.stroke();
      g.save(); g.font = '600 15px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('A', 0, 0.5); g.restore();
      break;
    case 'voltmeter':
      g.beginPath(); g.moveTo(-half, 0); g.lineTo(-15, 0); g.moveTo(15, 0); g.lineTo(half, 0); g.stroke();
      g.beginPath(); g.arc(0, 0, 15, 0, 7); g.stroke();
      g.save(); g.font = '600 15px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('V', 0, 0.5); g.restore();
      break;
    case 'spring':
      g.beginPath();
      g.moveTo(-half, 0);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const x0 = -half + (i + 0.5) * (2 * half / n);
        g.lineTo(x0, -7);
        g.lineTo(x0 + (half / n), 7);
      }
      g.lineTo(half, 0);
      g.stroke();
      break;
    case 'ground':
      g.beginPath(); g.moveTo(0, -12); g.lineTo(0, 0); g.moveTo(-16, 0); g.lineTo(16, 0);
      g.moveTo(-10, 7); g.lineTo(10, 7); g.moveTo(-5, 13); g.lineTo(5, 13);
      g.stroke();
      break;
    case 'coil':
      g.beginPath(); g.moveTo(-half, 0); g.lineTo(-20, 0); g.stroke();
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(-13 + i * 9, 0, 6, -Math.PI / 2, Math.PI / 2);
        g.stroke();
      }
      g.beginPath(); g.moveTo(23, 0); g.lineTo(half, 0); g.stroke();
      break;
  }
  g.restore();
}

/* 文字：支持 ^ 上标、_ 下标 */
function drawText(g, el) {
  const fs = el.size || 20;
  g.font = `${el.weight || 500} ${fs}px "PingFang SC","Microsoft Yahei",sans-serif`;
  g.fillStyle = el.color || '#2c333f';
  g.textBaseline = 'alphabetic';
  const lines = (el.text || '').split('\n');
  let y = el.y;
  for (const line of lines) {
    drawRichLine(g, line, el.x, y, fs);
    y += fs * 1.5;
  }
}

function drawRichLine(g, str, x, y, fs) {
  let cx = x;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '^' || ch === '_') {
      let j = i + 1, buf = '';
      if (str[j] === '{') {
        j++;
        while (j < str.length && str[j] !== '}') buf += str[j++];
        i = j;
      } else {
        while (j < str.length && !' ^_'.includes(str[j])) buf += str[j++];
        i = j - 1;
      }
      const small = Math.max(10, fs * 0.66);
      g.save();
      g.font = `${g.fontWeight || 500} ${small}px "PingFang SC","Microsoft Yahei",sans-serif`;
      g.fillText(buf, cx, ch === '^' ? y - fs * 0.45 : y + fs * 0.22);
      cx += g.measureText(buf).width;
      g.restore();
      continue;
    }
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width;
  }
}

function drawImage(g, el) {
  let img = S.images.get(el.src);
  if (!img) {
    img = new Image();
    img.onload = () => { S.images.set(el.src, img); requestRender(); };
    img.src = el.src;
    S.images.set(el.src, img);
    return;
  }
  if (!img.complete || !img.width) return;
  g.drawImage(img, el.x, el.y, el.w, el.h);
}

function drawLaser() {
  const now = performance.now();
  [S.myLaser, S.peerLaser].forEach((l) => {
    if (!l) return;
    const age = now - l.t;
    if (age > 1600) return;
    const a = 1 - age / 1600;
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = l === S.peerLaser ? '#ff5a3c' : '#e01b1b';
    ctx.beginPath();
    ctx.arc(l.x, l.y, 5 / S.view.scale + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = a * 0.22;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 16 / S.view.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawCursors() {
  if (!S.showCursor || !S.peerCursor) return;
  const now = performance.now();
  if (now - S.peerCursor.t > 5000) return;
  const c = S.peerCursor;
  ctx.save();
  ctx.fillStyle = '#b83a2e';
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 3 / S.view.scale + 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ---------------- 网络 ---------------- */
// 每个标签页一个固定身份号：刷新/掉线重连时，服务端能认出"这是同一个人"，
// 把上一次没断干净的旧连接顶掉，避免"房间已有老师"这种卡门
function getClientId() {
  try {
    let id = sessionStorage.getItem('pt_cid');
    if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); sessionStorage.setItem('pt_cid', id); }
    return id;
  } catch (_) { return 'anon' + Math.random().toString(36).slice(2, 8); }
}
const CLIENT_ID = getClientId();

let RECONNECT_TS = null;
/* 静态托管（GitHub Pages 等）没有 node 服务，走自带 MQTT 中继；本机服务仍走 WebSocket */
const STATIC_RELAY = /github\.io$/i.test(location.hostname) || new URLSearchParams(location.search).get('mqtt') === '1';
function genRoom() { return String(Math.floor(10000 + Math.random() * 89999)); }
function connect() {
  try { if (S.ws && S.ws.readyState <= 1) S.ws.close(); } catch (_) {}
  if (STATIC_RELAY && window.RelayMQTT) return connectMqtt();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}`);
  S.ws = ws;

  ws.onopen = () => {
    S.connected = true;
    updateConn(true);
    ws.send(JSON.stringify({ t: 'join', role: S.role, room: S.room, name: S.name, clientId: CLIENT_ID }));
  };

  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch (_) { return; }
    handleMsg(m);
  };

  ws.onclose = () => {
    if (S.ws !== ws) return;          // 已经被新连接替换掉的旧连接，事件不再理会
    S.connected = false;
    updateConn(false);
    // 学生正在等老师开课时，交给等候卡的定时器去重试，免得两条通道互相抢
    if (!$('#waitCard').hidden) return;
    clearTimeout(RECONNECT_TS);
    RECONNECT_TS = setTimeout(() => { RECONNECT_TS = null; if (!S.connected && S.ws === ws) connect(); }, 2500);
  };
  ws.onerror = () => {};
}

function restoreLocal() {
  try {
    const raw = localStorage.getItem('pt_save_' + (S.room || 'local'));
    if (!raw) return;
    const j = JSON.parse(raw);
    if (Array.isArray(j.pages) && j.pages.length) {
      S.pages = j.pages;
      S.page = 0;
      setTimeout(() => toast('已恢复上次板书'), 300);
    }
  } catch (_) {}
}

/* 静态模式：房间号由浏览器生成，加入房间=订阅 topic，其余消息格式与本机服务完全一致 */
function connectMqtt() {
  if (S.rtc) { try { S.rtc.close(); } catch (_) {} S.rtc = null; }   // 重连时直连一起重建
  if (!S.room) {                      // 老师的房间号存本机，刷新后还是同一个，链接永久有效
    let saved = null;
    try { saved = localStorage.getItem('pt_myroom'); } catch (_) {}
    S.room = saved || genRoom();
    try { localStorage.setItem('pt_myroom', S.room); } catch (_) {}
    updateMeta();
  }
  const broker = new URLSearchParams(location.search).get('broker');
  const net = RelayMQTT.create({ topic: 'pt/' + S.room, cid: CLIENT_ID, role: S.role, name: S.name, url: broker || undefined });
  S.ws = net;
  net.onopen = () => {
    S.connected = true;
    updateConn(true);
    handleMsg({ t: 'joined', room: S.room });
    setupRtc(net);
  };
  net.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (S.rtc && S.rtc.signalIn(m)) return;
    handleMsg(m);
  };
  net.onclose = () => {
    if (S.ws !== net) return;
    S.connected = false;
    updateConn(false);
    if (window.__STATIC_OFFLINE__) return;
    if (!$('#waitCard').hidden) return;
    clearTimeout(RECONNECT_TS);
    RECONNECT_TS = setTimeout(() => { RECONNECT_TS = null; if (!S.connected && S.ws === net) connect(); }, 2500);
  };
}

function send(obj) {
  // 直连通了就走点对点（同城约 20ms），没通或掉线时照旧走中继
  if (S.rtc && S.rtc.send(obj)) return;
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj));
}

/* 端到端直连：用中继传 SDP/ICE，通了以后书写和 PDF 都走 P2P，延迟从 ~200ms 掉到 ~20ms */
function setupRtc(net) {
  if (S.rtc || !window.RTCLink || !RTCLink.supported) return;
  S.rtc = RTCLink.create({
    role: S.role,
    hasPeer: () => !!S.peer,
    signal: (o) => { try { net.send(JSON.stringify(o)); } catch (_) {} },
    onStream: (m) => { if (m) handleMsg(m); },
    onOpen: () => {
      updateConn(true);
      toast('已切到端到端直连，书写更跟手');
    },
  });
}
function relay(d) { send({ t: 'relay', d }); }

let toastTimer = null;
function toast(text, ms = 2600) {
  const el = $('#raiseToast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

let WAIT_TIMER = null;
function startWaitRetry() {
  if (WAIT_TIMER) return;
  WAIT_TIMER = setInterval(() => {
    const stillWaiting = !$('#waitCard').hidden;
    if (!stillWaiting) { stopWaitRetry(); return; }
    try { if (S.ws) S.ws.close(); } catch (_) {}
    S.connected = false;
    connect();
  }, 3200);
}
function stopWaitRetry() {
  if (WAIT_TIMER) { clearInterval(WAIT_TIMER); WAIT_TIMER = null; }
}

function handleMsg(m) {
  if (m.t === 'need') {                       // 学生没收到板书：请老师重发一次全量
    if (S.role === 'teacher') setTimeout(() => pushSync(), 60);
    return;
  }
  if (m.t === 'joined') {
    stopWaitRetry();
    $('#waitCard').hidden = true;
    S.room = m.room;
    $('#roomTag b').textContent = m.room;
    $('#mRoom').textContent = m.room;
    updateConn(true);
    if (m.role === 'teacher' && S.role === 'teacher') {
      // 老师：若已有学生在，请求对方重发（这里以老师为状态权威，直接推 sync）
      if (m.peer) {
        S.peer = { name: m.peer.name, role: 'student' };
        setPeer(true);
        setTimeout(() => pushSync(), 300);
      }
      if (!S.inviteHinted) {
        S.inviteHinted = true;
        setTimeout(() => toast('房间 ' + m.room + '：点右上角【学生链接】复制地址发给学生，点开即进同一块白板', 6500), 900);
      }
    }
    if (STATIC_RELAY && S.role === 'student') {
      // 进来几秒还没收到板书（多半是那条大包在中继上丢了），直接让老师补发
      setTimeout(() => { if (!S.gotSync) send({ t: 'need' }); }, 3500);
      setTimeout(() => { if (!S.gotSync) send({ t: 'need' }); }, 7000);
    }
    if (m.role === 'student' && m.peer) {
      S.peer = { name: m.peer.name, role: 'teacher' };
      setPeer(true);
    }
    return;
  }
  if (m.t === 'peer-joined') {
    S.peer = { name: m.name, role: m.role };
    setPeer(true);
    toast(`${m.name} 已进入教室`);
    if (S.role === 'teacher') {
      // 把当前白板全量推给新进来的学生
      setTimeout(() => pushSync(), 120);
      relay({ type: 'perm', canDraw: $('#swDraw').checked });
      // 如果课件窗口正开着，也补推一次，学生进来就能看到同一页课件
      if (COURSE.on) {
        setTimeout(() => relay({
          type: 'course', action: 'open', url: COURSE.url, name: COURSE.name,
          rx: COURSE.rx, ry: COURSE.ry, rw: COURSE.rw, rh: COURSE.rh,
        }), 260);
      }
    }
    return;
  }
  if (m.t === 'peer-left') {
    S.peer = null;
    setPeer(false);
    return;
  }
  if (m.t === 'error') {
    // 学生点开链接但老师还没开课：别弹一串报错，摆一张等候卡，后台自己重连
    if (S.role === 'student' && (m.wait || /房间不存在|尚未开课/.test(m.msg))) {
      $('#wcRoom').textContent = S.room || '-----';
      $('#waitCard').hidden = false;
      startWaitRetry();
      return;
    }
    if ($('#gate').hidden === false) $('#gateErr').textContent = m.msg;
    else toast(m.msg, 3200);
    return;
  }
  if (m.t === 'relay') {
    handlePeerData(m.d);
  }
}

function handlePeerData(d) {
  if (!d || !d.type) return;
  switch (d.type) {
    case 'sync': {
      if (S.role !== 'student') return;
      S.gotSync = true;
      S.pages = d.pages && d.pages.length ? d.pages : [[]];
      S.page = d.page || 0;
      bumpContent();
      if (d.view) {
        if (S.followView && d.w && d.h && d.view.scale) {
          // 跟随模式：把老师视野的中心对齐到自己屏幕的中心（大屏投影用）
          S.lastPeerView = { x: d.view.x, y: d.view.y, scale: d.view.scale, w: d.w, h: d.h };
          S.view = followViewTarget(S.lastPeerView);
        } else {
          S.view = d.view;
        }
      }
      S.live.clear();
      renderPages();
      updateZoom();
      requestRender();
      // 手机/平板窄屏：第一次收到板书时自动缩放到全部内容
      // 但"跟随老师视角"开着时不抢视角（大屏投影要保持和老师同一个画面）
      if (!S.firstSync) {
        S.firstSync = true;
        if (stage.clientWidth < 900 && !S.followView) setTimeout(fitAll, 60);
      }
      break;
    }
    case 'view': {
      if (S.role !== 'student' || !S.followView) return;
      S.lastPeerView = { x: d.x, y: d.y, scale: d.scale, w: d.w, h: d.h };
      S.viewT = followViewTarget(d);
      animateView();
      break;
    }
    case 'anno': {
      if (S.role !== 'student') return;
      applyAnno(d);
      break;
    }
    case 'course': {
      if (S.role !== 'student') return;
      if (d.action === 'open') {
        courseOpen({ url: d.url, html: d.html || '', name: d.name, rx: d.rx, ry: d.ry, rw: d.rw, rh: d.rh }, false);
        toast('老师打开了课件');
      } else if (d.action === 'close') {
        courseClose(false);
      } else if (d.action === 'layout') {
        COURSE.on = true;
        COURSE.rx = d.rx; COURSE.ry = d.ry; COURSE.rw = d.rw; COURSE.rh = d.rh;
        courseLayout();
      }
      break;
    }
    case 'op': {
      applyOp(d);
      break;
    }
    case 'live': {
      if (!d.el) break;
      S.live.set(d.el.id, d.el);
      S.liveVer++;
      clearTimeout(S.liveTimers[d.el.id]);
      S.liveTimers[d.el.id] = setTimeout(() => {
        S.live.delete(d.el.id);
        S.liveVer++;
        requestRender();
      }, 900);
      requestRender();
      break;
    }
    case 'perm': {
      if (S.role !== 'student') return;
      S.canDraw = !!d.canDraw;
      updateStudentPerm();
      break;
    }
    case 'cursor': {
      S.peerCursor = { x: d.x, y: d.y, t: performance.now() };
      requestRender();
      break;
    }
    case 'laser': {
      if (!S.laserShare) return;
      S.peerLaser = { x: d.x, y: d.y, t: performance.now() };
      requestRender();
      break;
    }
    case 'page': {
      if (S.role !== 'student') return;
      while (S.pages.length <= d.page) S.pages.push([]);
      renderPages();
      setPage(d.page, false);
      break;
    }
    case 'audio': {
      playRemoteAudio(d.d);
      break;
    }
    case 'raise': {
      if (S.role !== 'teacher') return;
      toast('🙋 ' + (S.peer && S.peer.name ? S.peer.name : '学生') + ' 举手了', 4000);
      beep();
      break;
    }
  }
}

function pushSync() {
  if (S.role !== 'teacher') return;
  relay({
    type: 'sync',
    pages: S.pages,
    page: S.page,
    view: S.view,
    w: stage.clientWidth,
    h: stage.clientHeight,
  });
}

function applyOp(d) {
  const pages = S.pages;
  const pi = d.page == null ? S.page : d.page;
  const target = pages[pi];
  if (!target) return;
  if (d.a === 'add') {
    const idx = target.findIndex((e) => e.id === d.el.id);
    if (idx >= 0) target[idx] = d.el;
    else target.push(d.el);
    S.live.delete(d.el.id);
  } else if (d.a === 'del') {
    const i = target.findIndex((e) => e.id === d.id);
    if (i >= 0) target.splice(i, 1);
  } else if (d.a === 'clear') {
    pages[pi] = [];
  } else if (d.a === 'upd') {
    const i = target.findIndex((e) => e.id === d.el.id);
    if (i >= 0) target[i] = d.el;
  }
  bumpContent();
  requestRender();
  updateMeta();
}

function beep() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.12;
    o.connect(g); g.connect(ac.destination);
    o.start();
    setTimeout(() => { o.stop(); ac.close(); }, 160);
  } catch (e) {}
}

/* ---------------- 提交元素 ---------------- */
const HL_TTL = 5000;   // 荧光笔标注保留 5 秒后自动擦除

function scheduleHlFade(el) {
  if (!el || el.mode !== 'hl') return;
  const page = el.page;
  setTimeout(() => {
    const arr = S.pages[page];
    if (!arr) return;
    const i = arr.findIndex((e) => e.id === el.id);
    if (i < 0) return;                 // 已被撤销或清空
    arr.splice(i, 1);
    S.history.push({ a: 'del', page, el });
    S.future.length = 0;
    relay({ type: 'op', a: 'del', page, id: el.id });
    requestRender();
    updateMeta();
  }, HL_TTL);
}

function commit(el) {
  PLOG.st++;
  plog('commit', 'type=' + el.type + ' mode=' + (el.mode || '-') + ' pts=' + (el.pts ? el.pts.length : '-') + ' blit=' + (S.inkBlit ? 1 : 0));
  el.id = el.id || uid();
  el.owner = S.myId;
  el.page = S.page;
  cur().push(el);
  S.history.push({ a: 'add', page: S.page, el });
  S.future.length = 0;
  relay({ type: 'op', a: 'add', page: S.page, el });
  bumpContent();
  const inkPainted = S.inkBlit;
  S.inkBlit = false;
  if (inkPainted && el.type === 'path') {
    if (!S.needRebuild) stageKey = contentKey();   // 湿墨已经画在底板上，跳过整页重建
    S.needRebuild = false;
  }
  if (el.type === 'path' && el.mode === 'hl') scheduleHlFade(el);
  requestRender();
  updateMeta();
  return el;
}

function removeEl(el, broadcast = true, record = true) {
  const arr = cur();
  const i = arr.findIndex((e) => e.id === el.id);
  if (i < 0) return;
  arr.splice(i, 1);
  bumpContent();
  if (broadcast) relay({ type: 'op', a: 'del', page: S.page, id: el.id });
  if (record) {
    S.history.push({ a: 'del', page: S.page, el });
    S.future.length = 0;
  }
  requestRender();
  updateMeta();
}

function undo() {
  const h = S.history.pop();
  if (!h) return;
  applyHistory(h, true);
  S.future.push(h);
}

function redo() {
  const h = S.future.pop();
  if (!h) return;
  applyHistory(h, false);
  S.history.push(h);
}

function applyHistory(h, reverse) {
  const page = S.pages[h.page];
  if (!page) return;
  bumpContent();
  const shouldAdd = (h.a === 'add' && !reverse) || (h.a === 'del' && reverse);
  if (shouldAdd) {
    if (!page.find((e) => e.id === h.el.id)) page.push(h.el);
    relay({ type: 'op', a: 'add', page: h.page, el: h.el });
  } else {
    const i = page.findIndex((e) => e.id === h.el.id);
    if (i >= 0) page.splice(i, 1);
    relay({ type: 'op', a: 'del', page: h.page, id: h.el.id });
  }
  requestRender();
  updateMeta();
}

/* ---------------- 打开方式检测 ---------------- */
(function checkOpenMode(){
  const bad = location.protocol === 'file:';
  const bar = document.getElementById('warnBar');
  if (bad && bar) bar.hidden = false;
  window.__FILE_MODE__ = bad;
})();

/* ---------------- 指针交互 ---------------- */
cv.addEventListener('pointerdown', onDown);
cv.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'touch') { TCH.delete(e.pointerId); if (TCH.size < 2) PINCH = null; }
  // ★ iPad 关键：只有"当前正在写的那个指针"抬起才收笔。
  //   没有当前指针时（掌托抬起、笔被系统掐断后的等待期），一律不碰这一笔，
  //   否则掌托一抬手就把正在写的笔画提前落笔，后半截永远不会显示。
  if (S.activePointer === undefined || S.activePointer === null) return;
  if (e.pointerId !== S.activePointer) return;
  onUp(e);
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
cv.addEventListener('pointercancel', (e) => {
  if (e.pointerType === 'touch') { TCH.delete(e.pointerId); if (TCH.size < 2) PINCH = null; }
  if (S.activePointer === undefined || S.activePointer === null || e.pointerId !== S.activePointer) return;
  if (e.pointerType === 'pen' && S.draft && S.drawMode) {
    // 系统把笔的输入流掐断了（掌托压上、笔尖滑到屏幕边缘、iOS 手势抢占）。
    // 这一笔保持"半成品"，指针位用 -1 占住：掌托的移动、抬起就再也碰不到它，
    // 笔在半秒内原地重新落下，就直接接着写，缝成同一笔。
    const d = S.draft;
    const last = d.pts && d.pts.length ? d.pts[d.pts.length - 1] : null;
    S.cancelPos = last ? { x: last.x, y: last.y } : null;
    S.canceledAt = performance.now();
    S.activePointer = -1;          // 占位：等待笔重新落下
    S.drawingWithPen = false;
    S.canceledDraft = true;
    requestRender();
    return;
  }
  finishPointer(e);
});
cv.addEventListener('pointerleave', (e) => {
  // 只对手指收笔；Apple Pencil 短暂离开感应区不收笔，否则一笔会被切成好几段
  if (e.pointerType === 'touch' && S.activePointer === e.pointerId) finishPointer(e);
});


/* =========================================================================
   ★★★ 触摸兜底通道（根因：WebKit #269535）
   现象：手掌先压在屏上，Apple Pencil 的 PointerEvents 会被 WebKit 整个吞掉 ——
        页面活着（心跳照跳），但一条 pointerdown/pointermove 都收不到，
        视频里"笔尖在屏上滑动、探针只有 beat"就是这个。
   事实：同一时刻 Touch 事件仍然照常送达（Canva 就是靠它绕开的）。
   做法：用 Touch 事件驱动同一套落笔/落笔流程，位移大的是笔、位移小的是掌托。
        笔的 PointerEvents 正常工作时（lastPenPtrAt 刚刷新），这条通道全程不启动，
        所以不会出现"一笔画两遍"。
   ========================================================================= */
const TF = { on: false, ptr: undefined, tracks: new Map(), seq: 0 };
const TF_TOOLS = { pen: 1, hl: 1, eraser: 1, laser: 1, dash: 1, line: 1, arrow: 1, vecsum: 1, circle: 1, angle: 1, symbol: 1 };
S.lastPenPtrAt = 0;

/* 只要真笔的 PointerEvents 还在来，就记下时间；兜底通道用它判断"笔是不是被吞了" */
['pointerdown'].forEach((k) => {
  window.addEventListener(k, (e) => {
    S.lastPtrDownAt = performance.now();
    S.lastPtrDown = { t: S.lastPtrDownAt, x: e.clientX, y: e.clientY };
    if (e.pointerType === 'pen') S.lastPenPtrAt = performance.now();
  }, { capture: true, passive: true });
});

function tfEv(track, x, y) {
  return {
    pointerType: 'pen', pointerId: 7100 + track.id, isPrimary: true, button: 0,
    buttons: 1, pressure: 0.5, clientX: x, clientY: y, target: cv,
    isTrusted: false, preventDefault() {}, stopPropagation() {},
  };
}

function tfAbort() {
  if (!TF.on) return;
  const cur = TF.tracks.get(TF.ptr);
  TF.on = false; TF.ptr = undefined;
  if (cur) cur.dead = true;
  if (S.draft && S.draft.pts && S.draft.pts.length < 3) {
    S.draft = null; S.drawMode = false; S.activePointer = undefined; S.drawingWithPen = false;
    requestRender();
  } else if (S.draft) {
    finishPointer(tfEv(cur || { id: 99, x: 0, y: 0 }, 0, 0));
  }
}

function tfActivate(track) {
  if (TF.on) return;
  if (TCH.size >= 2) return;          // 两根手指 = 缩放，不接管
  if (!TF_TOOLS[S.tool]) return;      // 文字/选择/平移这些工具不接管
  TF.on = true;
  TF.ptr = track.id;
  plog('tf-start', 'id=' + track.id + ' n=' + TF.tracks.size + ' xy=' + Math.round(track.sx) + ',' + Math.round(track.sy));
  onDown(tfEv(track, track.sx, track.sy));
  onMove(tfEv(track, track.x, track.y));
}

function tfFinish(track) {
  if (!TF.on || TF.ptr !== track.id) return;
  plog('tf-end', 'id=' + track.id);
  TF.on = false;
  TF.ptr = undefined;
  const ev = tfEv(track, track.x, track.y);
  finishPointer(ev);
}

cv.addEventListener('touchstart', (e) => {
  const now = performance.now();
  PLOG.tc += e.changedTouches.length;
  for (const t of e.changedTouches) {
    if (TF.tracks.size > 8) break;
    TF.tracks.set(t.identifier, {
      id: t.identifier, sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY,
      moved: 0, t0: now, dead: false,
    });
  }
}, { passive: true });

cv.addEventListener('touchmove', (e) => {
  const now = performance.now();
  if (PLOG.tc % 10 < e.changedTouches.length) PLOG.tc += e.changedTouches.length;
  for (const t of e.changedTouches) {
    const tr = TF.tracks.get(t.identifier);
    if (!tr || tr.dead) continue;
    tr.x = t.clientX; tr.y = t.clientY;
    tr.moved = Math.max(tr.moved, Math.hypot(tr.x - tr.sx, tr.y - tr.sy));

    if (TF.on && TF.ptr === tr.id) { onMove(tfEv(tr, tr.x, tr.y)); continue; }
    if (TF.on) {
      /* 已接管的是"另一个触点"：如果它在动、而当前接管点几乎没动，说明刚接管的是掌托，
         真正的笔（被吞掉 pointer 的那个触点）现在才开始动 → 换过来。 */
      const cur = TF.tracks.get(TF.ptr);
      if (cur && cur.moved < 12 && tr.moved > 14) {
        TF.on = false; TF.ptr = undefined;
        if (S.draft && S.draft.pts && S.draft.pts.length < 3) {
          S.draft = null; S.drawMode = false; S.activePointer = undefined; S.drawingWithPen = false;
        } else if (S.draft) { finishPointer(tfEv(cur, cur.x, cur.y)); }
        tfActivate(tr);
      }
      continue;
    }
    /* 只有在"真笔的 pointer 事件已经断供 250ms 以上"时才启用兜底，避免正常写字时重复落笔 */
    if (now - tr.t0 < 55) continue;
    /* 这个触点的"出生"附近，刚刚有过 pointerdown → 它已经走 pointer 通道了，别重复画 */
    if (S.lastPtrDown && Math.abs(tr.t0 - S.lastPtrDown.t) < 140 &&
        Math.hypot(tr.sx - S.lastPtrDown.x, tr.sy - S.lastPtrDown.y) < 28) { tr.hasPtr = true; continue; }
    /* 关键：只看"这一笔有没有走 pointer 通道"。Safari 在笔快速连写时会漏发 PointerEvents，
       但同一笔的 Touch 事件照常送达 —— 那时 lastPtrDownAt 是旧的，这里就会接管。 */
    if (now - (S.lastPtrDownAt || 0) < 180) continue;
    if (tr.moved < 8) continue;
    /* 另一个触点也在动 = 双指操作（缩放），不是"手掌压着 + 笔在写"，不接管 */
    let busy = false;
    TF.tracks.forEach((o) => { if (o.id !== tr.id && o.moved > 14) busy = true; });
    if (busy) continue;
    tfActivate(tr);
  }
}, { passive: true });

function tfTouchEnd(e) {
  for (const t of e.changedTouches) {
    const tr = TF.tracks.get(t.identifier);
    if (!tr) continue;
    tr.x = t.clientX; tr.y = t.clientY;
    if (TF.on && TF.ptr === tr.id) tfFinish(tr);
    TF.tracks.delete(t.identifier);
  }
}
window.addEventListener('touchend', tfTouchEnd, { passive: true });
window.addEventListener('touchcancel', tfTouchEnd, { passive: true });

/* 掌托一直压着不动、触点在表里越积越多时清理掉，防止误接管 */
setInterval(() => {
  const now = performance.now();
  TF.tracks.forEach((tr, id) => {
    if (now - tr.t0 > 6000 && !(TF.on && TF.ptr === id)) TF.tracks.delete(id);
  });
}, 2000);

/* 真笔的 pointer 回来了：先把手里的兜底笔落笔，交给正常通道，绝不重复画 */
window.addEventListener('pointerdown', (e) => {
  if (!TF.on) return;
  /* 真的 pointer 通道回来了：把兜底画的那半笔直接丢掉（不提交），
     交给 pointer 重新画，否则同一段会出现双线。 */
  const cur = TF.tracks.get(TF.ptr);
  if (cur) cur.dead = true;
  TF.on = false; TF.ptr = undefined;
  S.draft = null; S.drawMode = false; S.activePointer = undefined; S.drawingWithPen = false;
  S.canceledDraft = false;
  stageKey = ''; bumpContent(); requestRender();
}, { capture: true, passive: true });

function canUseTool() {
  return S.role === 'teacher' || S.canDraw;
}

function onDown(e) {
  /* iPad「随手写」杀手：页面上只要有输入框处于聚焦态，系统会把笔迹当手写识别吞掉 ——
     此时手指还能点、笔却一条事件都到不了，正是"写不出、点不涨"的样子。落笔一律夺焦。 */
  const ae = document.activeElement;
  if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) { try { ae.blur(); } catch (_) {} }
  plog('onDown', 'p=' + e.pointerType + '/' + e.pointerId + ' tool=' + S.tool + ' pr=' + (e.pressure || 0).toFixed(2));
  if (e.pointerType === 'pen') {
    // 笔永远优先：把之前被手掌占着的"当前指针"让出来
    S.penSeen = true;
    S.lastEvT = performance.now();
    S.lastPenAt = performance.now();
    if (e.isTrusted !== false && ((e.buttons & 1) || e.pressure > 0)) S.penPressSeen = true;
    clearTimeout(S.cancelTimer);
    if (S.canceledDraft && S.draft && S.draft.type === 'path') {
      // 上一笔是被系统掐断的（对照位置几乎没动）→ 接着写，缝成一笔
      const p0 = toWorld(e);
      const cp = S.cancelPos;
      const near = !cp || Math.hypot(p0.x - cp.x, p0.y - cp.y) < 30 / S.view.scale;
      if (near && performance.now() - (S.canceledAt || 0) < 1200) {
        S.canceledDraft = false;
        S.activePointer = e.pointerId;
        S.drawingWithPen = true;
        try { cv.setPointerCapture(e.pointerId); } catch (_) {}
        S.drawMode = true;
        addPathPoints(S.draft, e, p0);
        requestRender();
        return;
      }
      // 离得远，就当真的抬笔了：把上一笔落下
      S.canceledDraft = false;
      flushDraft();
    }
    // 上一笔如果还挂着（抬起事件丢了 / 被掐断后没再回来），先落笔，绝不悄悄丢掉
    if (S.draft) flushDraft();
    S.canceledDraft = false;
    if (S.activePointer !== undefined && S.activePointer !== e.pointerId) {
      S.activePointer = undefined;
      S.drawingWithPen = false;
    }
  }
  if (e.pointerType === 'touch') {
    TCH.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    if (TCH.size === 2) {
      // 双指真的压上来了：先把触摸兜底那一笔让出来，缩放优先
      if (typeof tfAbort === 'function' && TF.on) tfAbort();
      // 正在用笔写字时，掌托压上来会凑成"两个触点"，绝不能让它变成双指缩放把笔画打断
      if (S.penSeen && S.drawingWithPen) return;
      pinchStart();
      return;
    }
    if (TCH.size > 2) return;
    if (S.penSeen) return;      // 用过笔的 iPad：手指只做缩放，不落笔
  }
  // iPad：Apple Pencil 正在写时，手掌/手指的触摸一律忽略（防掌托误触）
  if (S.activePointer !== undefined && S.activePointer !== e.pointerId) return;
  if (e.pointerType === 'touch' && S.drawingWithPen) return;
  S.activePointer = e.pointerId;
  if (e.pointerType === 'pen') S.drawingWithPen = true;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  if (e.button === 1) { // 中键平移
    S.panning = { sx: e.clientX, sy: e.clientY, ox: S.view.x, oy: S.view.y };
    cv.setPointerCapture(e.pointerId);
    return;
  }
  if (S.spaceDown) {
    S.panning = { sx: e.clientX, sy: e.clientY, ox: S.view.x, oy: S.view.y };
    return;
  }
  const p = toWorld(e);
  const tool = S.tool;

  if (tool === 'pan') {
    S.panning = { sx: e.clientX, sy: e.clientY, ox: S.view.x, oy: S.view.y };
    cv.style.cursor = 'grabbing';
    return;
  }

  if (tool !== 'select' && !canUseTool()) {
    toast('老师还没有开启你的书写权限', 2200);
    return;
  }

  if (tool === 'text') {
    const t = prompt('输入文字（^ 表示上标，_ 表示下标，例如 v^2、F_合）', '');
    if (t) {
      commit({ type: 'text', x: p.x, y: p.y, text: t, size: 22, color: S.color, id: uid() });
    }
    return;
  }

  if (tool === 'sym') {
    showSymMenu(e);
    symGuard = true;
    setTimeout(() => { symGuard = false; }, 0);
    return;
  }

  if (tool === 'eraser') {
    S.eraseMode = true;
    eraseAt(p);
    return;
  }

  if (tool === 'eraserBox') {
    S.boxSel = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    requestRender();
    return;
  }

  if (tool === 'select') {
    const hit = hitTest(p);
    if (hit) {
      S.dragEl = { el: hit, start: { x: p.x, y: p.y }, snap: JSON.parse(JSON.stringify(hit)) };
    }
    return;
  }

  if (tool === 'laser') {
    S.myLaser = { x: p.x, y: p.y, t: performance.now() };
    if (S.laserShare) relay({ type: 'laser', x: p.x, y: p.y });
    requestRender();
    S.laserDrag = true;
    return;
  }

  if (tool === 'pen' || tool === 'hl' || tool === 'ghost') {
    S.draft = {
      type: 'path', id: uid(), color: S.color, w: S.size, mode: tool === 'hl' ? 'hl' : 'pen',
      pts: [{ x: p.x, y: p.y }], ghost: tool === 'ghost',
    };
    S.drawMode = true;
    S.inkBlit = false;
    inkBegin(S.draft);          // 这一笔改由墨迹层逐段画，落笔即见
    plog('stroke-start', 'tool=' + tool);
    requestRender();
    return;
  }

  // 力的合成：第一次拖出 F₁，第二次拖出 F₂，自动补平行四边形与合力
  if (tool === 'vecsum') {
    if (S.vecA) {
      S.draft = {
        type: 'arrow', x1: S.vecO.x, y1: S.vecO.y, x2: p.x, y2: p.y,
        w: S.size, color: S.color, label: 'F₂',
      };
    } else {
      S.vecO = { x: p.x, y: p.y };
      S.draft = {
        type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y,
        w: S.size, color: S.color, label: 'F₁',
      };
    }
    S.drawMode = true;
    requestRender();
    return;
  }

  // 角度：点三次（顶点 → 一边端点 → 另一边端点）
  if (tool === 'angle') {
    if (!S.angPts) S.angPts = [];
    S.angPts.push({ x: p.x, y: p.y });
    if (S.angPts.length === 1) toast('已定顶点，再点一下确定一条边的端点');
    if (S.angPts.length === 2) toast('再点第三下，确定另一条边');
    if (S.angPts.length >= 3) {
      const [a, b, c] = S.angPts;
      commit({
        type: 'angle', id: uid(), color: S.color, w: 2.2,
        ax: a.x, ay: a.y, bx: b.x, by: b.y, cx: c.x, cy: c.y,
      });
      S.angPts = null;
    }
    requestRender();
    return;
  }

  // 其他形状
  const map = { line: 'line', dash: 'dash', arrow: 'arrow', circle: 'circle' };
  if (map[tool]) {
    if (tool === 'circle') {
      S.draft = { type: 'circle', cx: p.x, cy: p.y, r: 1, color: S.color, w: S.size };
    } else {
      S.draft = {
        type: map[tool], x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: S.color, w: S.size,
        label: tool === 'arrow' ? '' : undefined,
      };
    }
    S.drawMode = true;
    requestRender();
  }
}

/* 往笔画里加点：Apple Pencil 快速书写时浏览器会合并事件、点数很稀，
   这里把合并掉的中间点补回来，并按固定间距插值，曲线才顺、不会出现折线感。 */
function addPathPoints(d, e, p) {
  let list = [p];
  if (e && e.pointerType === 'pen' && typeof e.getCoalescedEvents === 'function') {
    try {
      const raw = e.getCoalescedEvents();
      if (raw && raw.length > 1) list = raw.map((ev) => toWorld(ev));
    } catch (_) {}
  }
  const thr = 0.9 / S.view.scale;
  for (const q of list) {
    const last = d.pts[d.pts.length - 1];
    const dist = Math.hypot(q.x - last.x, q.y - last.y);
    if (dist <= thr) continue;
    if (dist > thr * 3) {
      const n = Math.min(10, Math.floor(dist / (thr * 1.8)));
      for (let k = 1; k <= n; k++) {
        d.pts.push({
          x: last.x + (q.x - last.x) * k / (n + 1),
          y: last.y + (q.y - last.y) * k / (n + 1),
        });
      }
    }
    d.pts.push({ x: q.x, y: q.y });
  }
}

function onMove(e) {
  if (e.pointerType === 'touch' && TCH.has(e.pointerId)) {
    TCH.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    if (PINCH) { pinchMove(); return; }
    if (S.penSeen) return;      // 掌托滑动不要画东西
  }
  // ★ Apple Pencil：只要笔在动就画，不拿压力/按键去做"画不画"的开关
  //   （轻触的最初几帧压力常常是 0，用它当开关会把短笔画整笔丢掉）。
  //   一笔的开始与结束只靠：落笔事件、抬笔事件、以及"两笔之间断开 200ms 以上"来判定。
  if (e.pointerType === 'pen') {
    const nowP = performance.now();
    const gap = nowP - (S.lastPenAt || 0);
    S.lastPenAt = nowP;
    const drawing = !!(S.draft && S.activePointer === e.pointerId);
    // 抬笔事件漏发时（iPad 高频出现），第二笔的头几个点会被接到上一笔后面，
    // 表现就是"第二笔不识别、要停一下才好"。区分办法不是单看时间，而是看落点：
    //   · 笔在原地停一下再继续写 → 落点离上一笔的末点很近，仍是同一笔；
    //   · 换地方写第二笔 → 落点离上一笔的末点明显（>12 像素），立刻判为新笔。
    let jump = false;
    if (drawing && S.draft.pts && S.draft.pts.length >= 3) {
      const last = S.draft.pts[S.draft.pts.length - 1];
      const p0 = toWorld(e);
      const d0 = Math.hypot(p0.x - last.x, p0.y - last.y);
      jump = gap > 40 && d0 > 12 / S.view.scale;
    }
    const staleBreak = drawing && (gap > 250 || jump);
    if ((!drawing || staleBreak) && !S.synthDown
        && !S.panning && !S.dragEl && !S.boxSel && !S.laserDrag && !S.eraseMode) {
      if (staleBreak) flushDraft();
      // 落笔事件被漏发 → 用这个移动点补一次落笔，第二笔就能立刻开始
      S.synthDown = true;
      try {
        cv.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: e.pointerId, pointerType: 'pen', isPrimary: true,
          clientX: e.clientX, clientY: e.clientY, buttons: 1,
          pressure: 0, bubbles: true, cancelable: true,
        }));
      } catch (_) {}
      S.synthDown = false;
      return;
    }
  }

  // 没有当前指针（等待期占位 -1、或已抬笔）时，任何移动都不许碰这一笔；
  // 不是当前指针的移动同样不碰 —— 掌托滑动曾经就是在这里把杂点塞进笔画里的。
  if (S.activePointer === undefined || S.activePointer === null) return;
  if (e.pointerId !== S.activePointer) return;
  S.lastEvT = performance.now();
  const p = toWorld(e);

  if (S.panning) {
    breakFollow();
    S.view.x = S.panning.ox + (e.clientX - S.panning.sx);
    S.view.y = S.panning.oy + (e.clientY - S.panning.sy);
    requestRender();
    return;
  }

  // 光标同步
  const now = performance.now();
  if (now - S.lastCursor > 90) {
    S.lastCursor = now;
    relay({ type: 'cursor', x: p.x, y: p.y });
  }

  if (S.eraseMode && S.tool === 'eraser') {
    eraseAt(p);
    return;
  }

  if (S.boxSel && S.tool === 'eraserBox') {
    S.boxSel.x2 = p.x; S.boxSel.y2 = p.y;
    requestRender();
    return;
  }

  if (S.laserDrag && S.tool === 'laser') {
    S.myLaser = { x: p.x, y: p.y, t: performance.now() };
    if (S.laserShare) relay({ type: 'laser', x: p.x, y: p.y });
    requestRender();
    return;
  }

  if (S.dragEl && S.tool === 'select') {
    const { el, start, snap } = S.dragEl;
    const dx = p.x - start.x, dy = p.y - start.y;
    if (el.type === 'path') {
      el.pts = snap.pts.map((q) => ({ x: q.x + dx, y: q.y + dy }));
    } else if (el.type === 'text' || el.type === 'image' || el.type === 'symbol') {
      el.x = snap.x + dx; el.y = snap.y + dy;
    } else if (el.type === 'circle') {
      el.cx = snap.cx + dx; el.cy = snap.cy + dy;
    } else if (el.type === 'arrow' || el.type === 'line' || el.type === 'dash') {
      el.x1 = snap.x1 + dx; el.y1 = snap.y1 + dy;
      el.x2 = snap.x2 + dx; el.y2 = snap.y2 + dy;
    } else if (el.type === 'vecsum') {
      el.ox = snap.ox + dx; el.oy = snap.oy + dy;
      el.ax = snap.ax + dx; el.ay = snap.ay + dy;
      el.bx = snap.bx + dx; el.by = snap.by + dy;
    } else if (el.type === 'angle') {
      el.ax = snap.ax + dx; el.ay = snap.ay + dy;
      el.bx = snap.bx + dx; el.by = snap.by + dy;
      el.cx = snap.cx + dx; el.cy = snap.cy + dy;
    }
    bumpContent();
    requestRender();
    return;
  }

  if (!S.draft) return;

  const d = S.draft;
  if (d.type === 'path') {
    const n0 = d.pts.length;
    addPathPoints(d, e, p);
    if (S.inkOwn) { if (d.pts.length > n0) inkAppend(d, n0); }
    else inkBegin(d);
    inkPredict(d, e);
  } else if (d.type === 'circle') {
    d.r = Math.hypot(p.x - d.cx, p.y - d.cy);
  } else if (d.type === 'angle') {
    if (d.stage === 1) { d.bx = p.x; d.by = p.y; d.ax = p.x; d.ay = p.y; }
    else { d.cx = p.x; d.cy = p.y; }
  } else if (d.type === 'vecsum') {
    d.x2 = p.x; d.y2 = p.y;
  } else {
    d.x2 = p.x; d.y2 = p.y;
  }

  // 实时同步笔迹（跟手）
  const t = performance.now();
  if (t - S.lastLive > 60) {
    S.lastLive = t;
    // 浅拷贝 + 只复制点数组：效果与 JSON 深拷贝一致，但长笔时不卡主线程
    const snap = Object.assign({}, d);
    if (d.pts) snap.pts = d.pts.slice();
    relay({ type: 'live', el: snap });
  }
  requestRender();
}

const TCH = new Map();   // 触屏手指位置
let PINCH = null;

/* 掌托的触摸有时收不到抬起事件（系统直接吞掉），触点会一直留在表里，
   后面正常双指缩放就会被"幽灵触点"搅乱，这里按时间清掉僵尸触点。 */
function pruneTCH() {
  const now = performance.now();
  for (const [id, v] of TCH) {
    if (now - (v.t || 0) > 2600) TCH.delete(id);
  }
}

function pinchStart() {
  if (S.draft) return;          // 有正在写的笔画就先别缩放，免得把它吞掉
  pruneTCH();
  const a = [...TCH.values()];
  if (a.length < 2) return;
  const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
  const rect = cv.getBoundingClientRect();
  const mid = { x: (a[0].x + a[1].x) / 2 - rect.left, y: (a[0].y + a[1].y) / 2 - rect.top };
  PINCH = { d0: d, s0: S.view.scale, x0: S.view.x, y0: S.view.y, mid0: mid };
  // 双指开始 → 取消正在画的那一笔，避免误落笔
  S.draft = null;
  S.drawMode = false;
  S.activePointer = undefined;
  S.drawingWithPen = false;
  S.boxSel = null;
  S.dragEl = null;
}

function pinchMove() {
  if (!PINCH) return;
  breakFollow();
  const a = [...TCH.values()];
  if (a.length < 2) return;
  const rect = cv.getBoundingClientRect();
  const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
  const mid = { x: (a[0].x + a[1].x) / 2 - rect.left, y: (a[0].y + a[1].y) / 2 - rect.top };
  const ns = clamp(PINCH.s0 * (d / PINCH.d0), 0.25, 4);
  const k = ns / PINCH.s0;          // 以两指中点为中心缩放
  S.view.scale = ns;
  S.view.x = mid.x - (PINCH.mid0.x - PINCH.x0) * k;
  S.view.y = mid.y - (PINCH.mid0.y - PINCH.y0) * k;
  updateZoom();
  requestRender();
}

/* 把当前这一笔安全落笔：有内容就提交，绝不静默丢弃。
   用于"抬起事件丢失""笔被系统掐断后再也没回来""切换指针"等异常收尾。 */
function flushDraft() {
  plog('flushDraft', 'pts=' + (S.draft && S.draft.pts ? S.draft.pts.length : 0));
  inkEnd();
  if (!S.draft) { S.drawMode = false; S.activePointer = undefined; S.drawingWithPen = false; return; }
  if (S.draft.type === 'path' && (!S.draft.pts || S.draft.pts.length < 3)) {
    // 只有一两个点的碎笔：既看不见也没意义，直接丢掉，别在板书上留毛刺
    S.draft = null; S.drawMode = false; S.activePointer = undefined; S.drawingWithPen = false;
    stageKey = ''; bumpContent();   // 碎笔在底板上留下的那个点要刷掉
    requestRender();
    return;
  }
  S.activePointer = undefined;
  S.drawingWithPen = false;
  S.canceledDraft = false;
  onUp(null);
  requestRender();
}

/* 看门狗：iPad Safari 偶尔会漏发 pointerup，笔画就永远挂在半空（下一笔开始时被丢弃 = 白写）。
   这里兜底：超过 1.5 秒没有任何指针事件，就当抬笔落笔。 */
setInterval(() => {
  if (!S.draft) return;
  const now = performance.now();
  if (S.activePointer === -1) {
    if (S.canceledDraft && now - (S.canceledAt || 0) > 5000) flushDraft();
    return;
  }
  if (S.drawMode && now - (S.lastEvT || 0) > 2000) flushDraft();
}, 400);

function finishPointer(e) {
  if (e && e.pointerType === 'touch') { TCH.delete(e.pointerId); if (TCH.size < 2) PINCH = null; }
  if (e && S.activePointer !== undefined && e.pointerId !== S.activePointer) return;
  S.activePointer = undefined;
  S.drawingWithPen = false;
  onUp(e);
}

function onUp(e) {
  plog('onUp', 'pts=' + (S.draft && S.draft.pts ? S.draft.pts.length : 0) + ' e=' + (e ? e.pointerType : 'null'));
  S.inkBlit = inkCommit();
  S.activePointer = undefined;
  S.drawingWithPen = false;
  if (S.panning) { S.panning = null; return; }
  S.eraseMode = false;
  S.laserDrag = false;

  if (S.boxSel && S.tool === 'eraserBox') {
    const b = normRect(S.boxSel);
    const victims = cur().filter((el) => inRect(el, b));
    victims.forEach((el) => removeEl(el));
    S.boxSel = null;
    requestRender();
    return;
  }

  if (S.dragEl && S.tool === 'select') {
    relay({ type: 'op', a: 'upd', page: S.page, el: S.dragEl.el });
    S.dragEl = null;
    return;
  }

  if (!S.draft) return;
  const d = S.draft;

  // 力的合成：F₁ 松手后进入第二段
  if (S.tool === 'vecsum') {
    if (!S.vecA) {
      if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 6) { S.draft = null; return; }
      S.vecA = { x: d.x2, y: d.y2 };
      S.draft = null;
      requestRender();
      toast('F₁ 已定。再从同一点拖出 F₂，自动补出平行四边形和合力 F合', 3000);
      return;
    }
    S.draft = null;
    if (Math.hypot(d.x2 - S.vecO.x, d.y2 - S.vecO.y) > 6) {
      commit({
        type: 'vecsum', id: uid(), color: S.color,
        ox: S.vecO.x, oy: S.vecO.y,
        ax: S.vecA.x, ay: S.vecA.y,
        bx: d.x2, by: d.y2,
        la: 'F₁', lb: 'F₂', lr: 'F合',
      });
    }
    S.vecO = null; S.vecA = null;
    requestRender();
    return;
  }

  // 尺寸太小的丢弃
  if (d.type === 'circle' && d.r < 3) { S.draft = null; return; }
  if ((d.type === 'line' || d.type === 'dash' || d.type === 'arrow') &&
      Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 4) { S.draft = null; return; }

  S.draft = null;
  S.drawMode = false;

  if (d.type === 'path') {
    if (d.ghost) {
      // 幻影笔：2 秒后自动消失
      commit(d);
      setTimeout(() => {
        const i = cur().findIndex((x) => x.id === d.id);
        if (i >= 0) { cur().splice(i, 1); relay({ type: 'op', a: 'del', page: S.page, id: d.id }); requestRender(); }
      }, 2000);
      return;
    }
    if (d.pts.length < 2) {
      d.pts.push({ x: d.pts[0].x + 0.1, y: d.pts[0].y });
    }
    commit(d);
  } else {
    commit(d);
  }
  requestRender();
}

/* ---------------- 命中检测 / 擦除 ---------------- */
function hitTest(p) {
  const arr = [...cur()].reverse();
  // 手指/笔画比较粗，容差给大一点，否则很难点中
  const tol = (('ontouchstart' in window) || navigator.maxTouchPoints > 0 ? 26 : 18) / S.view.scale;
  for (const el of arr) {
    if (distToEl(p, el) < tol) return el;
  }
  return null;
}

function distToEl(p, el) {
  if (el.type === 'path') {
    const pts = el.pts;
    if (!pts || !pts.length) return 1e9;
    if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
    let m = 1e9;
    for (let i = 1; i < pts.length; i++) {
      m = Math.min(m, distSeg(p, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
    }
    return m;
  }
  if (el.type === 'line' || el.type === 'dash') return distSeg(p, el.x1, el.y1, el.x2, el.y2);
  if (el.type === 'arrow') return Math.min(distSeg(p, el.x1, el.y1, el.x2, el.y2), Math.hypot(p.x - el.x2, p.y - el.y2));
  if (el.type === 'circle') return Math.abs(Math.hypot(p.x - el.cx, p.y - el.cy) - el.r);
  if (el.type === 'text') return Math.hypot(p.x - el.x, p.y - el.y) < 40 ? 0 : 1e9;
  if (el.type === 'image') return inRect(el, { x: el.x, y: el.y, w: el.w, h: el.h }) ? 0 : 1e9;
  if (el.type === 'symbol') return Math.hypot(p.x - el.x, p.y - el.y);
  if (el.type === 'vecsum') return Math.min(distSeg(p, el.ox, el.oy, el.ax, el.ay), distSeg(p, el.ox, el.oy, el.bx, el.by));
  if (el.type === 'angle') return Math.min(distSeg(p, el.ax, el.ay, el.bx, el.by), distSeg(p, el.bx, el.by, el.cx, el.cy));
  return 1e9;
}

function distSeg(p, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const L = dx * dx + dy * dy;
  if (L === 0) return Math.hypot(p.x - x1, p.y - y1);
  let t = ((p.x - x1) * dx + (p.y - y1) * dy) / L;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}

function inRect(el, b) {
  let cx, cy;
  if (el.type === 'text' || el.type === 'symbol' || el.type === 'image') { cx = el.x; cy = el.y; }
  else if (el.type === 'circle') { cx = el.cx; cy = el.cy; }
  else if (el.type === 'path') { cx = el.pts[0].x; cy = el.pts[0].y; }
  else if (el.type === 'vecsum') { cx = el.ox; cy = el.oy; }
  else { cx = (el.x1 + el.x2) / 2; cy = (el.y1 + el.y2) / 2; }
  return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
}

function eraseAt(p) {
  const hit = hitTest(p);
  if (hit) removeEl(hit);
}

/* ---------------- 电路符号菜单 ---------------- */
const SYMBOLS = [
  ['battery', '电池'], ['resistor', '定值电阻'], ['rheostat', '滑动变阻器'],
  ['switch', '开关'], ['bulb', '小灯泡'], ['capacitor', '电容'],
  ['ammeter', '电流表 A'], ['voltmeter', '电压表 V'], ['spring', '弹簧'], ['coil', '线圈/电感'],
  ['ground', '接地'],
];

function showSymMenu(e) {
  const menu = $('#symMenu');
  menu.innerHTML = SYMBOLS.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('');
  const r = stage.getBoundingClientRect();
  menu.style.left = (e.clientX - r.left) + 'px';
  menu.style.top = (e.clientY - r.top) + 'px';
  menu.hidden = false;
  menu.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      const p = toWorld(e);
      commit({ type: 'symbol', sym: b.dataset.k, x: p.x, y: p.y, s: 1, rot: S.symRot, color: S.color, w: 2.4, id: uid() });
      menu.hidden = true;
    };
  });
}
$('#symMenu').addEventListener('pointerdown', (e) => e.stopPropagation());
let symGuard = false;
document.addEventListener('pointerdown', (e) => {
  if (symGuard) return;
  if (!e.target.closest('#symMenu')) $('#symMenu').hidden = true;
});

/* ---------------- 缩放 ---------------- */
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  breakFollow();
  const r = cv.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const unit = e.deltaMode === 1 ? 16 : 1;

  // Ctrl / ⌘ + 滚轮（含触控板捏合）= 缩放；其余 = 平移
  if (e.ctrlKey || e.metaKey) {
    const old = S.view.scale;
    const next = clamp(old * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.25, 4);
    S.view.x = mx - (mx - S.view.x) * (next / old);
    S.view.y = my - (my - S.view.y) * (next / old);
    S.view.scale = next;
    updateZoom();
  } else {
    if (e.shiftKey) S.view.x -= (e.deltaY || e.deltaX) * unit;
    else { S.view.x -= e.deltaX * unit; S.view.y -= e.deltaY * unit; }
  }
  requestRender();
}, { passive: false });

function updateZoom() {
  $('#zoomVal').textContent = Math.round(S.view.scale * 100) + '%';
}

/* ---- 学生端视角跟随（iPad 老师写、电脑大屏投影） ---- */
// 把老师的视野换算成"我这块屏幕"上的视角：中心对齐，且保证老师整屏内容都装得下
// （iPad 竖屏比电脑 16:9 屏高得多，不换算就会把上下切掉）
function followViewTarget(d) {
  const cw = stage.clientWidth, ch = stage.clientHeight;
  const sw = d.w || cw, sh = d.h || ch;
  const fit = Math.min(1, Math.min(cw / sw, ch / sh));
  const s = d.scale * fit;
  const wx = (sw / 2 - d.x) / d.scale;
  const wy = (sh / 2 - d.y) / d.scale;
  return { x: cw / 2 - wx * s, y: ch / 2 - wy * s, scale: s };
}

let viewAnim = null;
function animateView() {
  if (viewAnim) return;
  const step = () => {
    viewAnim = null;
    if (!S.viewT) return;
    const k = 0.16;
    S.view.x += (S.viewT.x - S.view.x) * k;
    S.view.y += (S.viewT.y - S.view.y) * k;
    S.view.scale += (S.viewT.scale - S.view.scale) * k;
    if (Math.abs(S.viewT.x - S.view.x) < 0.4 && Math.abs(S.viewT.y - S.view.y) < 0.4 &&
        Math.abs(S.viewT.scale - S.view.scale) < 0.002) {
      S.view.x = S.viewT.x; S.view.y = S.viewT.y; S.view.scale = S.viewT.scale;
      S.viewT = null;
    }
    updateZoom();
    render();
    if (S.viewT) viewAnim = requestAnimationFrame(step);
  };
  viewAnim = requestAnimationFrame(step);
}

// 学生自己动了视角，就退出跟随（想跟回去，打开右侧「跟随老师视角」）
function breakFollow() {
  if (S.role !== 'student' || !S.followView) return;
  S.followView = false;
  S.viewT = null;
  const sw = $('#swFollow'); if (sw) sw.checked = false;
  toast('已切到自由视角。想跟回老师的画面，打开右侧「跟随老师视角」');
}

/* ---------------- 顶部/面板 UI ---------------- */
function updateConn(on) {
  const dot = $('#dot');
  if (dot) dot.className = on ? 'on' : 'off';
  const t = $('#connText');
  if (t) t.textContent = on ? '已连接' : '断开重连中…';
  /* ★ 断线横幅：隧道域名一换，旧页面就再也收不到任何东西，
     表现正是"心跳在跳、笔怎么写都没反应"。必须让人一眼看到。 */
  if (on) { if (S.dropBar) { S.dropBar.remove(); S.dropBar = null; } clearTimeout(S.dropTs); return; }
  clearTimeout(S.dropTs);
  S.dropTs = setTimeout(() => {
    if (S.connected) return;
    if (!S.dropBar) {
      const b = document.createElement('div');
      b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;background:#b83a2e;color:#fff;' +
        'font:600 15px/1.5 -apple-system,system-ui,sans-serif;padding:10px 14px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.3)';
      b.innerHTML = '⚠ 与教室服务器已断开 —— 这一页已经过期，写什么都没用。<br>' +
        '<span style="font-weight:400;font-size:13px;opacity:.92">请关掉本页，用老师桌面「公网链接.txt」里的最新地址，或同一 WiFi 下用 ' +
        'http://192.168.2.124:8866 重新打开</span>';
      const btn = document.createElement('button');
      btn.textContent = '重新加载';
      btn.style.cssText = 'margin-left:10px;background:#fff;color:#b83a2e;border:0;border-radius:6px;padding:4px 12px;font:600 13px/1.4 -apple-system,sans-serif';
      btn.onclick = () => location.reload();
      b.appendChild(btn);
      document.body.appendChild(b);
      S.dropBar = b;
    }
  }, 2500);
}

function setPeer(on) {
  S.peerOnline = on;
  const chip = $('#peerChip');
  if (on && S.peer) {
    chip.className = 'peer-chip on';
    chip.textContent = `${S.peer.name} 在线`;
    $('#mPeer').textContent = S.peer.name;
  } else {
    chip.className = 'peer-chip';
    chip.textContent = S.role === 'teacher' ? '等待学生进入' : '等待老师';
    $('#mPeer').textContent = '等待中';
  }
}

function updateMeta() {
  $('#mCount').textContent = cur().length;
  $('#mRole').textContent = S.role === 'teacher' ? '老师' : '学生';
}

function updateStudentPerm() {
  const tip = $('#stageHint');
  if (S.role === 'student') {
    tip.textContent = S.canDraw ? '已获得书写权限，可以直接在板上做题' : '老师已暂时关闭你的书写权限，可以先听讲';
  }
}

function renderPages() {
  const wrap = $('#pages');
  wrap.innerHTML = '';
  S.pages.forEach((_, i) => {
    const b = document.createElement('button');
    b.className = 'pg' + (i === S.page ? ' active' : '');
    b.textContent = i + 1;
    b.onclick = () => setPage(i, true);
    wrap.appendChild(b);
  });
  updateMeta();
}

function setPage(i, broadcast) {
  S.page = clamp(i, 0, S.pages.length - 1);
  S.draft = null;
  S.live.clear();
  S.liveVer++;
  renderPages();
  requestRender();
  if (broadcast && S.role === 'teacher') relay({ type: 'page', page: S.page });
}

/* ---------------- 工具切换 ---------------- */
function setTool(t) {
  S.tool = t;
  if (t !== 'vecsum') { S.vecA = null; S.vecO = null; }
  if (t !== 'angle') S.angPts = null;
  S.draft = null;
  document.querySelectorAll('.tool[data-tool]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === t);
  });
  const tips = {
    pen: '钢笔：直接书写，颜色和粗细可按需切换',
    hl: '荧光笔：半透明宽笔，标注 5 秒后自动擦除（临时点重点用）',
    line: '直线：拖拽画直线',
    dash: '虚线：拖拽画虚线（辅助线常用）',
    arrow: '力矢量：拖出箭头，可配合文字标注 F、N、f',
    vecsum: '力的合成：先拖第一条边 F₁，再拖第二条边 F₂，自动补出平行四边形与合力 F合',
    circle: '画圆：拖拽确定半径',
    angle: '角度：点顶点 → 拖出两条边，自动标角度数值',
    sym: '电路符号：在空白处点击，选择元件放置（选中后按 R 旋转 90°）',
    text: '文字：点击放置，^ 上标 / _ 下标',
    eraser: '点擦：按住拖过去，擦掉经过的笔迹',
    eraserBox: '框擦：拖出一个框，框内笔迹整块删除',
    select: '选择：拖动元素调整位置',
    laser: '激光笔：只指示不落笔，对方屏幕同步红点',
    ghost: '幻影笔：写下的笔迹 2 秒后自动淡出，适合讲推导过程',
    pan: '移动画布：按住拖动，整块白板上↔移动（滚轮或双指也能移动）',
  };
  $('#stageHint').textContent = tips[t] || '';
  cv.style.cursor = t === 'text' ? 'text' : t === 'select' ? 'default' : t === 'pan' ? 'grab' : 'crosshair';
}

/* ---------------- 初始化 UI ---------------- */
function buildSwatches() {
  const wrap = $('#swatches');
  PALETTE.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'sw' + (i === 0 ? ' active' : '');
    b.style.background = c;
    b.title = c;
    b.onclick = () => {
      S.color = c;
      wrap.querySelectorAll('.sw').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    };
    wrap.appendChild(b);
  });
}

document.querySelectorAll('.tool[data-tool]').forEach((b) => {
  b.onclick = () => setTool(b.dataset.tool);
});

$('#sizes').addEventListener('click', (e) => {
  const b = e.target.closest('.size');
  if (!b) return;
  S.size = Number(b.dataset.size);
  document.querySelectorAll('.size').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
});

$('#btnUndo').onclick = undo;
$('#btnRedo').onclick = redo;
$('#btnClearPage').onclick = () => {
  if (!confirm('清空当前这一页？（对方白板也会同时清空）')) return;
  S.pages[S.page] = [];
  bumpContent();
  relay({ type: 'op', a: 'clear', page: S.page });
  requestRender(); updateMeta();
};
$('#btnNewPage').onclick = () => {
  S.pages.push([]);
  bumpContent();
  setPage(S.pages.length - 1, true);
};
$('#swDraw').onchange = (e) => {
  relay({ type: 'perm', canDraw: e.target.checked });
  toast(e.target.checked ? '已允许学生书写' : '已关闭学生书写');
};
$('#swCursor').onchange = (e) => { S.showCursor = e.target.checked; requestRender(); };
$('#swLaser').onchange = (e) => { S.laserShare = e.target.checked; };
$('#zoomIn').onclick = () => { breakFollow(); S.view.scale = clamp(S.view.scale * 1.15, .25, 4); updateZoom(); requestRender(); };
$('#zoomOut').onclick = () => { breakFollow(); S.view.scale = clamp(S.view.scale / 1.15, .25, 4); updateZoom(); requestRender(); };
/* 一键适配：把所有笔迹缩放到可见范围（手机端尤其需要） */
function elBBox(el) {
  const pad = 6;
  if (el.type === 'path') {
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    el.pts.forEach((p) => {
      x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
      x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
    });
    return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
  }
  if (el.type === 'line' || el.type === 'dash' || el.type === 'arrow') {
    return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2),
      w: Math.abs(el.x2 - el.x1) + pad, h: Math.abs(el.y2 - el.y1) + pad };
  }
  if (el.type === 'circle') return { x: el.cx - el.r, y: el.cy - el.r, w: el.r * 2, h: el.r * 2 };
  if (el.type === 'text') {
    return { x: el.x, y: el.y - (el.size || 20), w: (el.text || '').length * (el.size || 20) * 0.6 + 10, h: (el.size || 20) * 1.6 };
  }
  if (el.type === 'image') return { x: el.x, y: el.y, w: el.w, h: el.h };
  if (el.type === 'symbol') return { x: el.x - 36, y: el.y - 36, w: 72, h: 72 };
  if (el.type === 'vecsum') {
    const xs = [el.ox, el.ax, el.bx], ys = [el.oy, el.ay, el.by];
    return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad,
      w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  }
  if (el.type === 'angle') {
    const xs = [el.ax, el.bx, el.cx], ys = [el.ay, el.by, el.cy];
    return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad,
      w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  }
  return null;
}

function fitAll() {
  const els = cur();
  const vw = stage.clientWidth, vh = stage.clientHeight;
  if (!els.length) { S.view = { x: 40, y: 30, scale: 1 }; updateZoom(); requestRender(); return; }
  let bx1 = 1e9, by1 = 1e9, bx2 = -1e9, by2 = -1e9;
  els.forEach((el) => {
    const b = elBBox(el);
    if (!b) return;
    bx1 = Math.min(bx1, b.x); by1 = Math.min(by1, b.y);
    bx2 = Math.max(bx2, b.x + b.w); by2 = Math.max(by2, b.y + b.h);
  });
  if (bx2 < bx1) return;
  const bw = Math.max(bx2 - bx1, 20), bh = Math.max(by2 - by1, 20);
  const pad = 36;
  const sc = clamp(Math.min((vw - pad * 2) / bw, (vh - pad * 2) / bh), 0.25, 2.2);
  S.view.scale = sc;
  S.view.x = (vw - bw * sc) / 2 - bx1 * sc;
  S.view.y = (vh - bh * sc) / 2 - by1 * sc;
  updateZoom();
  requestRender();
}

$('#zoomFit').onclick = () => { breakFollow(); fitAll(); };
$('#btnHelp').onclick = () => { $('#help').hidden = false; };
$('#helpClose').onclick = () => { $('#help').hidden = true; };

$('#roomTag').onclick = () => {
  navigator.clipboard?.writeText(S.room).then(() => toast('房间号已复制：' + S.room));
};

/* ================= 保存 / 导出 ================= */
$('#btnSave').onclick = () => {
  const m = $('#saveMenu');
  if (!m.hidden) { m.hidden = true; return; }
  const r = $('#btnSave').getBoundingClientRect();
  m.style.top = (r.bottom + 8) + 'px';
  m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  m.hidden = false;
};

document.querySelectorAll('#saveMenu button').forEach((b) => {
  b.onclick = () => {
    $('#saveMenu').hidden = true;
    const k = b.dataset.k;
    if (k === 'png') savePagePNG();
    if (k === 'pdf') exportBoardPDF();
    if (k === 'json') saveArchive();
  };
});

document.addEventListener('pointerdown', (e) => {
  const m = document.getElementById('saveMenu');
  if (!m || m.hidden) return;
  if (e.target.closest('#saveMenu') || e.target.closest('#btnSave')) return;
  m.hidden = true;
});

function savePagePNG() {
  // 板书现在分两层（底层板书 + 上层正在写的笔迹），导出时合成一张
  const out = document.createElement('canvas');
  out.width = cv.width;
  out.height = cv.height;
  const og = out.getContext('2d');
  og.fillStyle = '#fff';
  og.fillRect(0, 0, out.width, out.height);
  if (bcv) og.drawImage(bcv, 0, 0);
  og.drawImage(cv, 0, 0);
  if (cvInk) og.drawImage(cvInk, 0, 0);
  const a = document.createElement('a');
  a.download = `板书-${S.room}-第${S.page + 1}页.png`;
  a.href = out.toDataURL('image/png');
  a.click();
  toast('当前页已保存为图片');
}

async function saveArchive() {
  if (STATIC_RELAY) {
    try {
      localStorage.setItem('pt_save_' + (S.room || 'local'), JSON.stringify({ pages: S.pages, savedAt: Date.now() }));
      toast('板书已存在本机浏览器（下次打开自动恢复）');
    } catch (e) { toast('存档失败：空间不足'); }
    return;
  }
  try {
    await fetch('/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: S.room, data: { pages: S.pages, savedAt: Date.now() } }),
    });
    toast('板书存档已保存到本机 saves 文件夹');
  } catch (e) {
    toast('存档失败：' + e.message);
  }
}

/* 预加载页面里的图片，避免导出缺图 */
function preloadPageImages(els) {
  return Promise.all(els.filter((e) => e.type === 'image').map((e) => new Promise((res) => {
    let im = S.images.get(e.src);
    if (im && im.complete && im.naturalWidth) return res();
    im = im || new Image();
    im.onload = () => { S.images.set(e.src, im); res(); };
    im.onerror = () => res();
    im.src = e.src;
    S.images.set(e.src, im);
  })));
}

/* 把一页内容画成带页眉的导出画布 */
const EXPORT_W = 1240;          // A4 纵向 96dpi
const EXPORT_H = 1754;
const HEAD_H = 76;
const EXPORT_PAD = 48;

async function renderPageCanvas(els, index, total, title, date) {
  await preloadPageImages(els);

  let bx1 = 1e9, by1 = 1e9, bx2 = -1e9, by2 = -1e9;
  els.forEach((el) => {
    const b = elBBox(el);
    if (!b) return;
    bx1 = Math.min(bx1, b.x); by1 = Math.min(by1, b.y);
    bx2 = Math.max(bx2, b.x + b.w); by2 = Math.max(by2, b.y + b.h);
  });
  if (bx2 <= bx1) { bx1 = 0; by1 = 0; bx2 = EXPORT_W - EXPORT_PAD * 2; by2 = 600; }

  const bw = Math.max(bx2 - bx1, 20);
  const bh = Math.max(by2 - by1, 20);
  const maxW = EXPORT_W - EXPORT_PAD * 2;
  const maxH = EXPORT_H - HEAD_H - EXPORT_PAD - 8;
  const scale = Math.min(1.6, maxW / bw, maxH / bh);
  const contentW = bw * scale;
  const contentH = bh * scale;
  const W = EXPORT_W;
  const H = EXPORT_H;
  const x0 = Math.round((W - contentW) / 2);

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);

  // 页眉
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#2c333f';
  g.font = '600 22px "PingFang SC","Microsoft YaHei",sans-serif';
  g.fillText(title || '物理一对一 · 课堂板书', EXPORT_PAD, 42);
  g.fillStyle = '#8a92a1';
  g.font = '400 18px "PingFang SC","Microsoft YaHei",sans-serif';
  g.textAlign = 'right';
  g.fillText(`第 ${index + 1} / ${total} 页    ${date}`, W - EXPORT_PAD, 42);
  g.textAlign = 'left';

  g.strokeStyle = '#e3e6ec';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(EXPORT_PAD, HEAD_H - 18);
  g.lineTo(W - EXPORT_PAD, HEAD_H - 18);
  g.stroke();

  // 内容
  g.save();
  g.translate(x0, HEAD_H);
  g.scale(scale, scale);
  g.translate(-bx1, -by1);
  els.forEach((el) => drawEl(g, el));
  g.restore();

  return c;
}

async function exportBoardPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) { toast('PDF 库未加载，请检查 vendor 目录'); return; }
  const pages = S.pages.filter((p) => p.length > 0);
  if (!pages.length) { toast('白板还是空的，先讲点东西再导出'); return; }
  if (pages.length > 40) { toast('页数过多（' + pages.length + ' 页），请分几次导出', 4000); return; }

  const title = prompt('给这份板书起个标题（显示在每页左上角，可留空）', '') || '';
  const date = new Date().toLocaleDateString('zh-CN');
  importMask('正在生成 PDF…', '共 ' + pages.length + ' 页，请稍候');

  try {
    const { jsPDF } = window.jspdf;
    let doc = null;
    for (let i = 0; i < pages.length; i++) {
      importMask(`正在导出第 ${i + 1} / ${pages.length} 页…`, '生成后会自动下载');
      const c = await renderPageCanvas(pages[i], i, pages.length, title, date);
      const img = c.toDataURL('image/jpeg', 0.92);
      // 用 pt 做单位，96dpi → 72pt，比例严格不变形
      const w = c.width * 0.75, h = c.height * 0.75;
      if (!doc) {
        doc = new jsPDF({ unit: 'pt', format: [w, h], compress: true });
      } else {
        doc.addPage();
      }
      doc.addImage(img, 'JPEG', 0, 0, w, h);
    }
    const dd = new Date();
    const stamp = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
    doc.save(`板书-${S.room || '课堂'}-${stamp}.pdf`);
    hideImportMask();
    toast('整份板书已导出为 PDF', 3200);
  } catch (e) {
    hideImportMask();
    toast('导出失败：' + e.message, 4200);
  }
}

/* 贴图 / 发题 */
function pickImage() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.onchange = () => { if (inp.files[0]) uploadImageFile(inp.files[0]); };
  inp.click();
}

async function uploadImageFile(file) {
  const bmp = await createImageBitmap(file);
  // 压缩到宽度 <= 1400
  const maxW = 1400;
  const scale = Math.min(1, maxW / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', 0.8);

  let j = { url: data };
  if (!STATIC_RELAY) {
    const res = await fetch('/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    j = await res.json();
  }
  const w = Math.min(560, c.width);
  const h = w * c.height / c.width;
  commit({
    type: 'image', id: uid(), src: j.url,
    x: -S.view.x / S.view.scale + 60, y: -S.view.y / S.view.scale + 40,
    w, h, color: S.color,
  });
  toast('图片已贴到白板，双方可见');
}

$('#btnImg').onclick = () => {
  if (S.role === 'student') {
    relay({ type: 'raise' });
    toast('已举手，老师那边会收到提醒');
  } else {
    pickImage();
  }
};

window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const it of items) {
    if (it.type.startsWith('image/')) {
      uploadImageFile(it.getAsFile());
      e.preventDefault();
      return;
    }
  }
});

/* 拖拽图片进画布 */
stage.addEventListener('dragover', (e) => e.preventDefault());
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) uploadImageFile(f);
});

/* ---------------- 学生链接：一键把"同房间+学生身份"的地址发给学生 ---------------- */
// 生成学生链接：老师在自己电脑上用 localhost 打开时，自动换成公网隧道域名，
// 否则发给学生的链接是 localhost，学生那边根本打不开
async function studentInviteLink() {
  let origin = location.origin;
  const isLocal = /^(localhost|127\.|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(location.hostname) || location.protocol === 'http:';
  if (isLocal) {
    try {
      const r = await fetch('/api/public-host');
      const j = await r.json();
      if (j && j.host) origin = 'https://' + j.host;
    } catch (_) {}
  }
  const extra = STATIC_RELAY ? '&mqtt=1' : '';
  return `${origin}${location.pathname}?role=student&room=${encodeURIComponent(S.room || '')}${extra}`;
}
$('#btnInvite').onclick = async () => {
  if (S.role !== 'teacher') return;
  if (!S.room) { toast('房间号还在生成，等一秒再点', 2600); return; }
  const link = await studentInviteLink();
  let copied = false;
  try { await navigator.clipboard.writeText(link); copied = true; } catch (_) {}
  showInviteCard(link, copied);
};

/* 链接卡片：iPad / 微信里复制不一定成功，所以把链接摆出来可以长按选中 */
function showInviteCard(link, copied) {
  let c = document.getElementById('inviteCard');
  if (!c) {
    c = document.createElement('div');
    c.id = 'inviteCard';
    document.body.appendChild(c);
  }
  c.innerHTML = `
    <div class="ic-title">${copied ? '已复制到剪贴板' : '长按下面这行选中复制'}</div>
    <div class="ic-sub">学生点开就进你的教室，不用填房间号、不用点按钮</div>
    <input id="icInput" readonly>
    <div class="ic-room">房间号 <b>${S.room}</b></div>
    <div class="ic-btns">
      <button id="icCopy">再复制一次</button>
      <button id="icClose2" class="ghost">关闭</button>
    </div>`;
  c.hidden = false;
  const inp = c.querySelector('#icInput');
  inp.value = link;
  c.querySelector('#icCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(link); toast('已复制，直接粘贴到微信发给学生', 3000); }
    catch (_) { inp.focus(); inp.select(); toast('已选中，长按复制即可', 3000); }
  };
  c.querySelector('#icClose2').onclick = () => { c.hidden = true; };
  setTimeout(() => { try { inp.focus(); inp.select(); } catch (_) {} }, 40);
}

/* ---------------- 键盘 ---------------- */
const KEYMAP = {
  p: 'pen', h: 'hl', l: 'line', d: 'dash', v: 'arrow', s: 'vecsum',
  c: 'circle', a: 'angle', e: 'sym', t: 'text', x: 'eraser', b: 'eraserBox',
  m: 'select', r: 'laser',
};
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') { S.spaceDown = true; cv.style.cursor = 'grab'; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (e.key.toLowerCase() === 'r' && S.tool === 'sym') { S.symRot = (S.symRot + Math.PI / 2) % (Math.PI * 2); return; }
  const t = KEYMAP[e.key.toLowerCase()];
  if (t && !e.ctrlKey && !e.metaKey) setTool(t);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { S.spaceDown = false; cv.style.cursor = S.tool === 'text' ? 'text' : 'crosshair'; }
});

/* ---------------- 进入页 ---------------- */
let pickedRole = 'teacher';
document.querySelectorAll('.role-btn').forEach((b) => {
  b.onclick = () => {
    pickedRole = b.dataset.role;
    document.querySelectorAll('.role-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    if (pickedRole === 'student') {
      $('#fieldRoom span').textContent = '房间号';
      $('#gRoom').placeholder = '填老师发给你的 5 位房间号';
      $('#gateTip').textContent = '向老师要房间号，输入后即可进入同一块白板。';
    } else {
      $('#gRoom').placeholder = '留空自动创建房间；也可自定义';
      $('#gateTip').textContent = '进入后自动生成房间号，发给学生即可同板上课。';
    }
  };
});

function joinRoom(role, name, room) {
  S.role = role;
  S.name = name;
  S.room = room;
  S.canDraw = true;      // 双方都能写，才叫"共用同一块白板"；老师可用开关随时收回

  $('#gate').hidden = true;
  $('#app').hidden = false;

  if (S.role === 'student') {
    // 学生端隐藏老师专属：授课控制、页面管理
    const blocks = document.querySelectorAll('#panel .p-block');
    if (blocks[0]) blocks[0].style.display = 'none';
    if (blocks[1]) blocks[1].style.display = 'none';
    $('#blkFollow').hidden = false;
    const ca = $('#courseAnno'); if (ca) ca.style.display = 'none';
    $('#btnSave').style.display = 'none';
    $('#rowLaserShare').style.display = 'none';
    $('#btnImg').textContent = '举手';
    const inv = $('#btnInvite'); if (inv) inv.style.display = 'none';
  }
  if (S.role === 'teacher') {
    $('#btnImg').textContent = '导入';
  }

  buildSwatches();
  setTool('pen');
  resize();
  if (STATIC_RELAY) restoreLocal();
  renderPages();
  updateZoom();
  setPeer(false);
  updateMeta();
  connect();
}

$('#gGo').onclick = () => {
  const name = $('#gName').value.trim();
  const room = $('#gRoom').value.trim();
  if (!name) { $('#gateErr').textContent = '请先填写你的名字'; return; }
  if (pickedRole === 'student' && !room) { $('#gateErr').textContent = '请输入老师给的房间号'; return; }
  $('#gateErr').textContent = '';
  joinRoom(pickedRole, name, room);
};

$('#wcRetry').onclick = () => {
  try { if (S.ws) S.ws.close(); } catch (_) {}
  S.connected = false;
  connect();
  startWaitRetry();
  toast('正在重试…', 1600);
};

/* 初始尺寸 */
resize();

/* 支持带参直达：?role=student&room=AB12C&name=张同学 —— 老师把这条链接发给学生，点开即进 */
(function autoJoinByQuery() {
  const Q = new URLSearchParams(location.search);
  const qRole = Q.get('role');
  if (qRole !== 'teacher' && qRole !== 'student') return;
  const nm = (Q.get('name') || (qRole === 'teacher' ? '老师' : '学生')).slice(0, 10);
  const rm = (Q.get('room') || '').trim().toUpperCase();
  $('#gName').value = nm;
  $('#gRoom').value = rm;
  const b = document.querySelector(`.role-btn[data-role="${qRole}"]`);
  if (b) b.click();
  // 学生没带房间号就不硬闯，留在进入页让人手填
  if (qRole === 'student' && !rm) return;
  // 点开链接直接进教室，不闪一下"进入页"再等点击
  setTimeout(() => joinRoom(qRole, nm, rm), 20);
  // 进了但 3 秒还没连上，明确说一句，别让人对着空白发呆
  setTimeout(() => {
    if (!(S.ws && S.ws.readyState === 1)) {
      toast('连不上教室：检查一下网络，或让老师重新发一次链接', 6000);
    }
  }, 3200);
})();

/* ============================================================
   导入讲义：PDF / Word(.docx) / TXT / 图片
   解析全部在浏览器本地完成，只把渲染后的图片存到本机 uploads
   ============================================================ */
const IMPORT_MAX_PAGES = 30;

function importMask(text, sub) {
  let m = document.getElementById('importMask');
  if (!m) {
    m = document.createElement('div');
    m.id = 'importMask';
    m.innerHTML = '<div class="ring"></div><div class="txt" id="imTxt"></div><div class="sub" id="imSub"></div>';
    document.body.appendChild(m);
  }
  m.style.display = 'flex';
  document.getElementById('imTxt').textContent = text || '正在解析…';
  document.getElementById('imSub').textContent = sub || '';
}
function hideImportMask() {
  const m = document.getElementById('importMask');
  if (m) m.style.display = 'none';
}

async function uploadDataUrl(dataUrl) {
  if (STATIC_RELAY) return dataUrl;          // 静态模式图片直接内嵌，学生端照样能看到
  try {
    const res = await fetch('/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dataUrl }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (!j.url) throw new Error('返回内容异常');
    return j.url;
  } catch (e) {
    // 兜底：服务端存不了，就把图直接内嵌进白板，本机照样能板书批注
    console.warn('[上传失败，改用内嵌图片]', e.message);
    window.__UPLOAD_BROKEN__ = (e.message || '上传失败');
    return dataUrl;
  }
}

function pickFile(accept, handler) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept;
  inp.onchange = () => {
    const f = inp.files[0];
    if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (accept === '.docx' && (ext === 'doc' || ext === 'docm')) {
      toast('老版 .doc 格式读不了：请用 Word 打开后「另存为 .docx」再导入', 4600);
      return;
    }
    if (accept === '.pdf' && ext !== 'pdf') {
      toast('这不是 PDF 文件，请重新选择', 3000);
      return;
    }
    handler(f);
  };
  inp.click();
}

/* 把导入的若干页一次性挂到白板上 */
function importFail(kind, file, e) {
  console.error('[导入 ' + kind + ']', file && file.name, e);
  const m = (e && e.message) || String(e);
  let tip = m || '未知错误';
  if (window.__FILE_MODE__ || /Failed to fetch|NetworkError|图片保存失败/i.test(m)) {
    tip = '上传通道不通：请确认是用「启动教室.bat」启动后，用 http://localhost:8866 打开页面，而不是双击 html 文件';
  }
  alert(kind + ' 导入失败（' + (file && file.name) + '）\n\n' + tip);
}

function applyImportedPages(pageElements, label) {
  // 如果当前只有一页空白页，用它承接导入的第一页，避免留下空白首页
  if (S.pages.length === 1 && S.pages[0].length === 0) {
    S.pages.pop();
  }
  pageElements.forEach((els) => S.pages.push(els));
  bumpContent();
  S.page = S.pages.length - 1;
  renderPages();
  requestRender();
  updateMeta();
  if (S.role === 'teacher') {
    relay({ type: 'page', page: S.page });
    pushSync();
  }
  S.fitted = true;
  if (stage.clientWidth < 900) setTimeout(fitAll, 80);
  hideImportMask();
  if (window.__UPLOAD_BROKEN__) {
    alert(`${label}：已导入 ${pageElements.length} 页。\n\n但图片没能保存到程序里（原因：${window.__UPLOAD_BROKEN__}），现在只能你自己这台电脑上看到，学生端看不到。\n\n请确认是用「启动教室.bat」启动后打开 http://localhost:8866 ，再重新导入一次。`);
    window.__UPLOAD_BROKEN__ = null;
  } else {
    toast(`${label}：已导入 ${pageElements.length} 页，可直接在上面批注`, 4200);
  }
}

/* ---------- PDF ---------- */
async function importPDF(file) {
  if (!window.pdfjsLib) { toast('PDF 解析库未加载，请检查 vendor 目录'); return; }
  importMask('正在读取 PDF…', file.name);
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const isPad = /iPad|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  const limit = isPad ? Math.min(IMPORT_MAX_PAGES, 12) : IMPORT_MAX_PAGES;
  const total = Math.min(doc.numPages, limit);
    const pages = [];

    for (let i = 1; i <= total; i++) {
      importMask(`正在渲染第 ${i} / ${total} 页…`, '试卷页会作为白板背景，可直接批注');
      const page = await doc.getPage(i);
      const vp0 = page.getViewport({ scale: 1 });
      const scale = 960 / vp0.width;
      const vp = page.getViewport({ scale });
      const cv2 = document.createElement('canvas');
      cv2.width = Math.round(vp.width);
      cv2.height = Math.round(vp.height);
      const g = cv2.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, cv2.width, cv2.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      const url = await uploadDataUrl(cv2.toDataURL('image/jpeg', 0.8));
      pages.push([{
        id: uid(), type: 'image', src: url,
        x: 0, y: 0, w: cv2.width, h: cv2.height, color: '#2c333f',
      }]);
    }
    const note = doc.numPages > total ? `（共 ${doc.numPages} 页，已导入前 ${total} 页）` : '';
    applyImportedPages(pages, 'PDF' + note);
  } catch (e) {
    hideImportMask();
    const m = (e && e.message) || String(e);
    console.error('[导入 PDF]', file && file.name, e);
    let tip = m || '未知错误';
    if (/password|encrypted/i.test(m)) tip = 'PDF 有密码保护，请先解密或另存一份再导入';
    else if (window.__FILE_MODE__ || /Failed to fetch|NetworkError|图片保存失败/i.test(m)) {
      tip = '上传通道不通：请确认是用「启动教室.bat」启动后，用 http://localhost:8866 打开页面，而不是双击 html 文件';
    }
    alert('PDF 导入失败（' + (file && file.name) + '）\n\n' + tip);
  }
}

/* ---------- 板书存档 .json ---------- */
async function importArchive(file) {
  importMask('正在读取板书存档…', file.name);
  try {
    const txt = await file.text();
    const j = JSON.parse(txt);
    const pages = (j.data && j.data.pages) || j.pages;
    if (!Array.isArray(pages) || !pages.length) throw new Error('文件里没有板书内容');
    applyImportedPages(pages, '板书存档');
  } catch (e) {
    hideImportMask();
    importFail('板书存档', file, e);
  }
}

/* ---------- Word .docx ---------- */
function htmlToBlocks(html) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  const walk = (el) => {
    for (const n of Array.from(el.children)) {
      const tag = n.tagName.toLowerCase();
      if (tag === 'img') {
        if (n.getAttribute('src')) out.push({ img: n.getAttribute('src') });
        continue;
      }
      if (tag === 'table') {
        Array.from(n.querySelectorAll('tr')).forEach((tr) => {
          const cells = Array.from(tr.children).map((c) => c.textContent.replace(/\s+/g, ' ').trim());
          const line = cells.filter(Boolean).join('   |   ');
          if (line) out.push({ text: line, size: 19, weight: 400, note: true });
        });
        continue;
      }
      if (tag === 'p' || tag === 'li' || /^h[1-6]$/.test(tag)) {
        const txt = n.textContent.replace(/\s+/g, ' ').trim();
        const isH = /^h[1-6]$/.test(tag);
        if (txt) {
          out.push({
            text: txt,
            size: isH ? 30 : 21,
            weight: isH ? 700 : 400,
            indent: tag === 'li',
            gap: isH ? 26 : 12,
          });
        }
        Array.from(n.querySelectorAll('img')).forEach((im) => {
          if (im.getAttribute('src')) out.push({ img: im.getAttribute('src') });
        });
        continue;
      }
      walk(n);
    }
  };
  walk(d.body);
  return out;
}

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('图片加载失败'));
    im.src = src;
  });
}

/* 把排版块画成若干张 1080 宽的页面图 */
async function blocksToPages(blocks) {
  const W = 1080, MX = 76, PAGE_H = 1380;
  const pages = [];          // 每页 {canvas, usedHeight}
  let cv2, g, y;

  const newPage = () => {
    cv2 = document.createElement('canvas');
    cv2.width = W;
    cv2.height = PAGE_H;
    g = cv2.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, PAGE_H);
    y = MX;
  };
  const finish = () => {
    if (!cv2) return;
    const used = Math.min(PAGE_H, Math.max(y + MX * 0.5, MX * 2));
    const out = document.createElement('canvas');
    out.width = W;
    out.height = Math.round(used);
    const og = out.getContext('2d');
    og.fillStyle = '#ffffff';
    og.fillRect(0, 0, W, out.height);
    og.drawImage(cv2, 0, 0);
    pages.push(out);
  };
  const wrapLines = (text, font, maxW) => {
    const lines = [];
    let line = '';
    for (const ch of text) {
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      if (g.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; }
      else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  };

  newPage();

  for (const b of blocks) {
    if (b.img) {
      try {
        const im = await loadImageEl(b.img);
        const maxW = W - MX * 2;
        const w = Math.min(maxW, im.width);
        const h = w * im.height / im.width;
        if (y + h + 20 > PAGE_H - MX) { finish(); newPage(); }
        g.drawImage(im, MX, y, w, h);
        y += h + 22;
      } catch (_) {}
      continue;
    }

    const size = b.size || 21;
    const weight = b.weight || 400;
    const lineH = size * 1.72;
    g.font = `${weight} ${size}px "PingFang SC","Microsoft YaHei",sans-serif`;
    g.fillStyle = '#2c333f';

    if (b.gap) y += b.gap;
    const indent = b.indent ? 26 : 0;
    const maxW = W - MX * 2 - indent;
    let lines = wrapLines(b.text, g.font, maxW);
    // 单段过长时按页切割
    for (const ln of lines) {
      if (y + lineH > PAGE_H - MX * 0.6) { finish(); newPage(); g.font = `${weight} ${size}px "PingFang SC","Microsoft YaHei",sans-serif`; g.fillStyle = '#2c333f'; }
      g.fillText(ln, MX + indent, y + size);
      y += lineH;
    }
    y += b.note ? 4 : 8;
  }
  finish();
  return pages;
}

async function importDOCX(file) {
  if (!window.mammoth) { toast('Word 解析库未加载，请检查 vendor 目录'); return; }
  importMask('正在解析 Word 文档…', file.name);
  try {
    const buf = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: buf });
    const blocks = htmlToBlocks(result.value || '');
    if (!blocks.length) { hideImportMask(); toast('这个文档里没有可导入的文字'); return; }
    importMask('正在排版…', '把讲义排到白板页上');
    const pageCanvases = await blocksToPages(blocks);
    const pages = [];
    for (const c of pageCanvases) {
      const url = await uploadDataUrl(c.toDataURL('image/jpeg', 0.88));
      pages.push([{ id: uid(), type: 'image', src: url, x: 0, y: 0, w: c.width, h: c.height, color: '#2c333f' }]);
    }
    applyImportedPages(pages, 'Word 讲义');
  } catch (e) {
    hideImportMask();
    importFail('Word 讲义', file, e);
  }
}

async function importTXT(file) {
  importMask('正在读取文本…', file.name);
  try {
    const text = await file.text();
    const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const blocks = paras.map((p) => ({ text: p.replace(/\n/g, ''), size: 21, gap: 14 }));
    const pageCanvases = await blocksToPages(blocks);
    const pages = [];
    for (const c of pageCanvases) {
      const url = await uploadDataUrl(c.toDataURL('image/jpeg', 0.88));
      pages.push([{ id: uid(), type: 'image', src: url, x: 0, y: 0, w: c.width, h: c.height, color: '#2c333f' }]);
    }
    applyImportedPages(pages, '文本');
  } catch (e) {
    hideImportMask();
    importFail('文本文件', file, e);
  }
}

/* ---------- HTML 网页 / 课件 ----------
   先用「网页快照」把 HTML 连版式、颜色一起拍成一张图；
   快照失败（浏览器限制、内容太复杂）就退回到"按文字重新排版"，保证一定能导进来。
   注意：这是静态快照，HTML 里的动画/脚本不会动，需要按帧截图的请用「题目截图」。 */
const HTML_W = 1240;
const HTML_PAD = 44;

function htmlClean(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,link,meta,noscript,form,input,button,textarea,select').forEach((n) => n.remove());
  // 只保留内嵌图片；网络图片带不进来（会变成占位文字）
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (!/^data:/i.test(src)) {
      const span = doc.createElement('span');
      span.textContent = '［图片：' + (img.getAttribute('alt') || '网络图片未导入') + '］';
      img.replaceWith(span);
    }
  });
  Array.from(doc.querySelectorAll('*')).forEach((n) => {
    Array.from(n.attributes).forEach((a) => { if (/^on/i.test(a.name)) n.removeAttribute(a.name); });
  });
  const styles = Array.from(doc.querySelectorAll('style')).map((s) => s.innerHTML).join('\n');
  return { styles, body: doc.body ? doc.body.innerHTML : html };
}

async function htmlSnapshot(html) {
  const { styles, body } = htmlClean(html);
  const W = HTML_W;
  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-40000px;top:0;width:${W}px;padding:${HTML_PAD}px;box-sizing:border-box;background:#fff;color:#2c333f;font:17px/1.75 system-ui,"PingFang SC","Microsoft YaHei",sans-serif;`;
  holder.innerHTML = '<style>' + styles + '</style>' + body;
  document.body.appendChild(holder);
  await new Promise((r) => setTimeout(r, 80));
  const rawH = Math.ceil(holder.getBoundingClientRect().height);
  holder.remove();
  const H = Math.max(240, Math.min(14000, rawH));

  const inner =
    '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + W + 'px;padding:' + HTML_PAD + 'px;box-sizing:border-box;background:#fff;color:#2c333f;font:17px/1.75 system-ui,PingFang SC,Microsoft YaHei,sans-serif;">' +
    '<style>' + styles + '</style>' + body + '</div>';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
    '<foreignObject x="0" y="0" width="' + W + '" height="' + H + '">' + inner + '</foreignObject></svg>';
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('网页快照渲染失败'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0);
  // 检查是不是一片空白（空白说明快照没渲染出来）
  let dark = 0;
  const px = ctx.getImageData(0, 0, W, H).data;
  for (let i = 0; i < px.length; i += 4 * 9) { if (px[i] < 210) dark++; }
  if (dark < 30) throw new Error('网页快照是空白');
  return c;
}

async function importHTML(file) {
  importMask('正在排版网页…', file.name);
  try {
    const html = await file.text();
    let canvases = [];
    try {
      canvases = [await htmlSnapshot(html)];
    } catch (snapErr) {
      console.warn('[HTML 快照失败，改用文字排版]', snapErr);
      const clean = htmlClean(html);
      const blocks = htmlToBlocks(clean.body);
      if (!blocks.length) throw new Error('这个网页里没有可导入的正文内容');
      importMask('按文字重新排版…', '网页版式太复杂，改为文字排版导入');
      canvases = await blocksToPages(blocks);
    }
    const pages = [];
    for (const c of canvases) {
      const url = await uploadDataUrl(c.toDataURL('image/jpeg', 0.88));
      pages.push([{ id: uid(), type: 'image', src: url, x: 0, y: 0, w: c.width, h: c.height, color: '#2c333f' }]);
    }
    applyImportedPages(pages, 'HTML 课件');
  } catch (e) {
    hideImportMask();
    importFail('HTML 课件', file, e);
  }
}

/* ================= HTML 课件窗口（动画与交互都保留） =================
   旧做法是把网页"拍成一张图"贴到白板上，动画和交互自然全丢。
   现在改成：白板上盖一扇真的浏览器窗口（iframe），课件在里面照常跑；
   需要手写批注时，点【批注】把这一屏变成白板图片，写完了再关掉窗口继续看动画。 */
const COURSE = { on: false, url: '', html: '', name: '', rx: .04, ry: .05, rw: .92, rh: .86, full: false, ready: false };

function courseLayout() {
  if (!COURSE.on) return;
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const card = $('#courseCard');
  card.style.left = Math.round(COURSE.rx * sw) + 'px';
  card.style.top = Math.round(COURSE.ry * sh) + 'px';
  card.style.width = Math.round(COURSE.rw * sw) + 'px';
  card.style.height = Math.round(COURSE.rh * sh) + 'px';
}

let _courseBlob = null;
function courseLoad() {
  const f = $('#courseFrame');
  f.src = 'about:blank';
  setTimeout(() => {
    if (!COURSE.on) return;
    if (!COURSE.url && COURSE.html) {
      if (_courseBlob) { try { URL.revokeObjectURL(_courseBlob); } catch (_) {} }
      _courseBlob = URL.createObjectURL(new Blob([COURSE.html], { type: 'text/html' }));
      f.src = _courseBlob;
    } else {
      f.src = COURSE.url;
    }
  }, 40);
}

function courseOpen(o, broadcast) {
  COURSE.on = true;
  COURSE.url = o.url;
  COURSE.html = o.html || '';
  COURSE.name = o.name || 'HTML 课件';
  if (typeof o.rx === 'number') { COURSE.rx = o.rx; COURSE.ry = o.ry; COURSE.rw = o.rw; COURSE.rh = o.rh; }
  $('#courseName').textContent = COURSE.name;
  $('#courseLayer').hidden = false;
  S.anno.length = 0;
  S.annoDraft = null;
  $('#courseSnap').style.display = (S.role === 'teacher' && COURSE.html) ? '' : 'none';
  courseLayout();
  courseLoad();
  if (broadcast) {
    relay({ type: 'course', action: 'open', url: COURSE.url, html: STATIC_RELAY ? COURSE.html : '', name: COURSE.name, rx: COURSE.rx, ry: COURSE.ry, rw: COURSE.rw, rh: COURSE.rh });
  }
}

function courseClose(broadcast) {
  COURSE.on = false;
  if (S.annoMode) setAnnoMode(false, broadcast);
  S.anno.length = 0;
  S.annoDraft = null;
  drawAnno();
  COURSE.full = false;
  $('#courseLayer').hidden = true;
  $('#courseFrame').src = 'about:blank';
  if (broadcast) relay({ type: 'course', action: 'close' });
}

function courseBroadcastLayout() {
  if (S.role !== 'teacher') return;
  relay({ type: 'course', action: 'layout', rx: COURSE.rx, ry: COURSE.ry, rw: COURSE.rw, rh: COURSE.rh });
}

/* 拖窗口 / 拉右下角改大小 */
let CDRAG = null;
$('#courseBar').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  CDRAG = { type: 'move', sx: e.clientX, sy: e.clientY, rx: COURSE.rx, ry: COURSE.ry };
  try { $('#courseBar').setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
});
$('#courseGrip').addEventListener('pointerdown', (e) => {
  CDRAG = { type: 'size', sx: e.clientX, sy: e.clientY, rw: COURSE.rw, rh: COURSE.rh };
  try { $('#courseGrip').setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
  e.stopPropagation();
});
window.addEventListener('pointermove', (e) => {
  if (!CDRAG) return;
  const sw = stage.clientWidth, sh = stage.clientHeight;
  if (CDRAG.type === 'move') {
    COURSE.rx = clamp(CDRAG.rx + (e.clientX - CDRAG.sx) / sw, -0.02, 1 - COURSE.rw + 0.02);
    COURSE.ry = clamp(CDRAG.ry + (e.clientY - CDRAG.sy) / sh, 0, 1 - COURSE.rh);
  } else {
    COURSE.rw = clamp(CDRAG.rw + (e.clientX - CDRAG.sx) / sw, .28, 1 - COURSE.rx);
    COURSE.rh = clamp(CDRAG.rh + (e.clientY - CDRAG.sy) / sh, .25, 1 - COURSE.ry);
  }
  courseLayout();
});
window.addEventListener('pointerup', () => {
  if (!CDRAG) return;
  CDRAG = null;
  courseBroadcastLayout();
});

$('#courseClose').onclick = () => courseClose(S.role === 'teacher');
$('#courseReload').onclick = () => { courseLoad(); toast('课件已重新载入'); };
$('#courseAnno').onclick = () => setAnnoMode(!S.annoMode, true);
$('#courseZoom').onclick = () => {
  COURSE.full = !COURSE.full;
  if (COURSE.full) { COURSE.rx = 0; COURSE.ry = 0; COURSE.rw = 1; COURSE.rh = 1; }
  else { COURSE.rx = .04; COURSE.ry = .05; COURSE.rw = .92; COURSE.rh = .86; }
  courseLayout();
  courseBroadcastLayout();
};

/* 【批注】：把当前这屏网页变成白板图片，随手就能在上面写字 */
$('#courseSnap').onclick = async () => {
  if (!COURSE.html) { toast('这份课件只拿到了链接，没法快照；重开时选本地 .html 文件即可'); return; }
  toast('正在生成可批注的静态版…', 3000);
  try {
    const c = await htmlSnapshot(COURSE.html);
    const url = await uploadDataUrl(c.toDataURL('image/jpeg', 0.92));
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const wx = (COURSE.rx * sw - S.view.x) / S.view.scale;
    const wy = (COURSE.ry * sh - S.view.y) / S.view.scale;
    const dw = (COURSE.rw * sw) / S.view.scale;
    const dh = (COURSE.rh * sh) / S.view.scale;
    const k = Math.min(dw / c.width, dh / c.height);
    commit({
      type: 'image', src: url,
      x: wx + (dw - c.width * k) / 2, y: wy + (dh - c.height * k) / 2,
      w: c.width * k, h: c.height * k, color: '#2c333f',
    });
    courseClose(S.role === 'teacher');
    toast('已放到白板上，现在可以直接写字批注');
  } catch (e) {
    console.warn('[抓图失败]', e);
    toast('这一屏是实时动画，抓不出静态图；请用【标注】直接在画面上圈写', 4600);
  }
};

/* 网页上传到本机服务，学生端才有得打开（不是本地 blob） */
async function uploadHtmlFile(file) {
  const html = await file.text();
  if (STATIC_RELAY) return { url: '', html: html };   // 静态站点没有服务端，学生端用 Blob 现场渲染
  try {
    const r = await fetch('/uploadhtml', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, html }),
    });
    if (r.ok) { const j = await r.json(); if (j.url) return { url: j.url, html }; }
  } catch (_) {}
  // 兜底：本机 blob（只有自己能看到，学生端空白）
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.__HTML_LOCAL__ = true;
  return { url, html };
}

async function importCourse(file) {
  try {
    importMask('正在准备课件…', file.name);
    const { url, html } = await uploadHtmlFile(file);
    hideImportMask();
    courseOpen({ url, name: file.name, html }, true);
    if (window.__HTML_LOCAL__) {
      window.__HTML_LOCAL__ = null;
      alert('课件已在本机打开，但没能传到服务上，学生端看不到这一屏。\n\n请确认是用「启动教室.bat」启动后、通过 http://localhost:8866 打开的本页面，再重新导入一次。');
    } else {
      toast('课件已打开：动画和交互都在，学生端同一时间也能看到');
    }
  } catch (e) {
    hideImportMask();
    importFail('HTML 课件', file, e);
  }
}

/* ================= 动画上的标注层（透明 canvas 压住课件） =================
   课件是活的（iframe 在跑），白板笔迹会被窗口挡住，
   所以标注用一张透明画布盖在最上层：动画照跑，笔画直接叠在上面。 */
const ANNO_COLOR = '#b83a2e';

function annoResize() {
  const d = dpr();
  const w = Math.round(stage.clientWidth * d), h = Math.round(stage.clientHeight * d);
  if (anno.width !== w || anno.height !== h) { anno.width = w; anno.height = h; }
}

function drawAnno() {
  const d = dpr();
  const g = anno.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, anno.width, anno.height);
  if (!(S.anno && S.anno.length) && !S.annoDraft) return;
  const sc = S.view.scale * d;
  g.setTransform(sc, 0, 0, sc, S.view.x * d, S.view.y * d);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const paint = (el) => {
    g.strokeStyle = el.color || ANNO_COLOR;
    g.lineWidth = el.w;
    g.beginPath();
    const pts = el.pts;
    if (pts.length === 1) { g.arc(pts[0].x, pts[0].y, el.w / 2, 0, Math.PI * 2); g.fillStyle = el.color || ANNO_COLOR; g.fill(); return; }
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.stroke();
  };
  S.anno.forEach(paint);
  if (S.annoDraft && S.annoDraft.pts) paint(S.annoDraft);
}

function setAnnoMode(on, broadcast) {
  S.annoMode = !!on;
  if (!on) S.annoDraft = null;
  anno.hidden = !on;
  anno.classList.toggle('on', !!on);
  $('#annoBar').hidden = !on;
  drawAnno();
  if (on) toast('标注模式：可以直接在动画上画圈写字；退出后课件恢复点击');
  if (broadcast && S.role === 'teacher') relay({ type: 'anno', a: 'mode', on: !!on });
}

function annoAt(p) {
  // 靠近哪条笔迹（点到相邻点连成的线段的最小距离）
  let hit = -1;
  S.anno.forEach((el, i) => {
    for (let k = 0; k < el.pts.length - 1; k++) {
      if (distSeg(p, el.pts[k].x, el.pts[k].y, el.pts[k + 1].x, el.pts[k + 1].y) < 14 / S.view.scale) { hit = i; return; }
    }
    if (el.pts.length === 1 && Math.hypot(p.x - el.pts[0].x, p.y - el.pts[0].y) < 14 / S.view.scale) hit = i;
  });
  return hit;
}

let ANNO_DRAW = null;
anno.addEventListener('pointerdown', (e) => {
  if (!S.annoMode) return;
  e.preventDefault();
  try { anno.setPointerCapture(e.pointerId); } catch (_) {}
  const p = toWorld(e);
  if (S.annoTool === 'eraser') { ANNO_DRAW = { erase: true }; annoErase(p); return; }
  ANNO_DRAW = { id: uid(), pts: [{ x: p.x, y: p.y }], color: ANNO_COLOR, w: 3.2 / S.view.scale };
  S.annoDraft = ANNO_DRAW;
  requestRender();
});
anno.addEventListener('pointermove', (e) => {
  if (!S.annoMode || !ANNO_DRAW) return;
  const p = toWorld(e);
  if (ANNO_DRAW.erase) { annoErase(p); return; }
  const last = ANNO_DRAW.pts[ANNO_DRAW.pts.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) > 1.2 / S.view.scale) {
    ANNO_DRAW.pts.push({ x: p.x, y: p.y });
    requestRender();
  }
});
const annoEnd = () => {
  if (!ANNO_DRAW) return;
  if (ANNO_DRAW.erase) { ANNO_DRAW = null; return; }
  const el = S.annoDraft;
  S.annoDraft = null;
  ANNO_DRAW = null;
  if (el && el.pts.length) {
    S.anno.push(el);
    if (S.role === 'teacher') relay({ type: 'anno', a: 'add', el });
  }
  requestRender();
};
anno.addEventListener('pointerup', annoEnd);
anno.addEventListener('pointercancel', annoEnd);

function annoErase(p) {
  const i = annoAt(p);
  if (i < 0) return;
  const el = S.anno[i];
  S.anno.splice(i, 1);
  if (S.role === 'teacher') relay({ type: 'anno', a: 'del', id: el.id });
  requestRender();
}

$('#annoBar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const k = b.dataset.anno;
  if (k === 'pen' || k === 'eraser') {
    S.annoTool = k;
    document.querySelectorAll('#annoBar button').forEach((x) => x.classList.toggle('active', x.dataset.anno === k));
    anno.style.cursor = k === 'eraser' ? 'cell' : 'crosshair';
    return;
  }
  if (k === 'clear') {
    if (!S.anno.length) return;
    S.anno.length = 0;
    if (S.role === 'teacher') relay({ type: 'anno', a: 'clear' });
    requestRender();
    return;
  }
  if (k === 'undo') {
    const el = S.anno.pop();
    if (el && S.role === 'teacher') relay({ type: 'anno', a: 'del', id: el.id });
    requestRender();
    return;
  }
  if (k === 'exit') setAnnoMode(false, true);
});

/* 学生端收到老师的标注 */
function applyAnno(d) {
  if (d.a === 'mode') { setAnnoMode(!!d.on, false); return; }
  if (d.a === 'add') { if (d.el) S.anno.push(d.el); requestRender(); return; }
  if (d.a === 'del') { const i = S.anno.findIndex((x) => x.id === d.id); if (i >= 0) S.anno.splice(i, 1); requestRender(); return; }
  if (d.a === 'clear') { S.anno.length = 0; requestRender(); }
}

/* ---------- 导入按钮与菜单 ---------- */
const importBtn = document.getElementById('btnImg');
importBtn.onclick = (e) => {
  if (S.role === 'student') {
    relay({ type: 'raise' });
    toast('已举手，老师那边会收到提醒');
    return;
  }
  const m = document.getElementById('importMenu');
  if (!m.hidden) { m.hidden = true; return; }
  const r = importBtn.getBoundingClientRect();
  m.style.top = (r.bottom + 8) + 'px';
  m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  m.hidden = false;
};

document.querySelectorAll('#importMenu button').forEach((b) => {
  b.onclick = () => {
    document.getElementById('importMenu').hidden = true;
    const k = b.dataset.k;
    if (k === 'img') return pickImage();
    if (k === 'pdf') return pickFile('.pdf', importPDF);
    if (k === 'docx') return pickFile('.docx', importDOCX);
    if (k === 'txt') return pickFile('.txt', importTXT);
    if (k === 'html') return pickFile('.html,.htm', importCourse);
    if (k === 'htmlimg') return pickFile('.html,.htm', importHTML);
    if (k === 'json') return pickFile('.json', importArchive);
  };
});

document.addEventListener('pointerdown', (e) => {
  const m = document.getElementById('importMenu');
  if (!m || m.hidden) return;
  if (e.target.closest('#importMenu') || e.target.closest('#btnImg')) return;
  m.hidden = true;
});

/* 支持把 PDF / Word 直接拖进窗口 */
stage.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (!f) return;
  const n = f.name.toLowerCase();
  if (n.endsWith('.pdf')) { e.preventDefault(); importPDF(f); }
  else if (n.endsWith('.docx')) { e.preventDefault(); importDOCX(f); }
  else if (n.endsWith('.txt')) { e.preventDefault(); importTXT(f); }
});


/* ---------------- 全屏 ---------------- */
function isIPad() {
  return /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function toggleFull() {
  const d = document;
  const cur = d.fullscreenElement || d.webkitFullscreenElement;
  if (cur) {
    (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
    return;
  }
  if (isIPad()) {
    alert('iPad 上的 Safari 不允许网页全屏。\n\n做法：点 Safari 的「分享 → 添加到主屏幕」，以后从桌面图标进入，就是全屏、没有地址栏和工具栏。');
    return;
  }
  const el = d.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (!req) { alert('这个浏览器不支持全屏，按键盘 F11 也可以'); return; }
  Promise.resolve(req.call(el)).catch(() => alert('全屏没成功，按键盘 F11 试试'));
}

/* ============================================================
   语音通话：麦克风 → PCM 8kHz → WebSocket 中继 → 对方扬声器
   不依赖第三方服务，声音只在两台机器之间走
   ============================================================ */
const SR_OUT = 8000;
const AUDIO = {
  on: false, sendCtx: null, proc: null, stream: null,
  outCtx: null, inCtx: null, procTicks: 0, queueEnd: 0, lastLevelAt: 0,
  // —— 防回声 ——
  lastRemoteAt: 0,     // 最近一次收到并播放对端声音的时刻
  remotePeak: 0,       // 对端声音的峰值（估计本机外放会漏多少回声）
  echoWarned: false,
  sent: 0, muted: 0,
};
// 防回声参数（可按现场情况微调）
const ECHO_WIN_MS = 260;    // 对端刚响过多久之内，本机拾到的声音优先当作回声
const GATE_RMS = 0.010;     // 低于这个能量当作静音，不上传（约 -40dB）
const ECHO_MARGIN = 1.8;    // 本机拾音不足"外放回声"的 1.8 倍，就判定为回声

function i16ToB64(i16) {
  const u8 = new Uint8Array(i16.buffer);
  let str = '';
  const CH = 8192;
  for (let i = 0; i < u8.length; i += CH) {
    str += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  }
  return btoa(str);
}

function b64ToFloat32(b64) {
  const bin = atob(b64);
  const n = bin.length >> 1;
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(u8.buffer, 0, n);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = i16[i] / 32768;
  return f;
}

function playRemoteAudio(b64) {
  if (!b64) return;
  try {
    if (!AUDIO.outCtx) AUDIO.outCtx = new (window.AudioContext || window.webkitAudioContext)();
    const octx = AUDIO.outCtx;
    if (octx.state === 'suspended') octx.resume();
    const f = b64ToFloat32(b64);
    if (!f.length) return;
    // 记录对端电平：本机外放会被自己的麦克风拾到，用来判断"我听到的是回声还是真人说话"
    let rp = 0;
    for (let i = 0; i < f.length; i++) { const a = f[i] > 0 ? f[i] : -f[i]; if (a > rp) rp = a; }
    AUDIO.lastRemoteAt = performance.now();
    AUDIO.remotePeak = rp;
    const buf = octx.createBuffer(1, f.length, SR_OUT);
    buf.copyToChannel(f, 0);
    const src = octx.createBufferSource();
    src.buffer = buf;
    src.connect(octx.destination);
    const now = octx.currentTime;
    let at = AUDIO.queueEnd;
    if (at < now + 0.06) at = now + 0.06;      // 缓冲不足，补一点
    if (at > now + 0.75) at = now + 0.12;      // 积压太多，跳过重排，别越拖越迟
    AUDIO.queueEnd = at + buf.duration;
    src.start(at);
  } catch (e) { /* 静默：播放失败不影响板书 */ }
}

function setMicUI(on) {
  const b = $('#btnMic');
  if (!b) return;
  b.classList.toggle('on', on);
  b.classList.toggle('off', !on);
  $('#micText').textContent = on ? '话筒中' : '话筒';
  b.title = on ? '话筒已开，再点一下关闭' : '开启话筒，面对面讲课';
}

function needSecure() {
  return window.isSecureContext && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
}

/* iOS / iPadOS 的 Safari 规定：AudioContext 必须在用户手势里创建并解锁，
   否则会一直 suspended —— 表现就是"点了允许麦克风，却一点声音都没有"。
   所以这里在每次点按时先同步"预热"两个音频上下文。 */
function primeAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  // iPadOS 17+：声明"边录边放"，否则一旦开始录音，Safari 会把输出切到通话模式，声音变小
  try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (_) {}
  try { if (!AUDIO.inCtx) AUDIO.inCtx = new AC(); } catch (_) {}
  try { if (!AUDIO.outCtx) AUDIO.outCtx = new AC(); } catch (_) {}
  [AUDIO.inCtx, AUDIO.outCtx].forEach((c) => {
    try { if (c && c.state === 'suspended') c.resume(); } catch (_) {}
  });
}

function micErrText(e) {
  const n = (e && e.name) || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    return '权限被拒绝。\n\n· iPad/Safari：点地址栏左边的「大小 A」→ 网站设置 → 麦克风 → 允许，然后刷新页面再点话筒\n· 电脑 Chrome/Edge：点地址栏左边的小锁/图标，把麦克风改成"允许"\n· 若之前误点了弹窗里的"不允许"，只能按上面改回来';
  }
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError') {
    return '系统里找不到麦克风。\n\niPad 自带麦克风一般都在，若接了口播/耳机请检查线；\n电脑请确认设备管理里麦克风没有被禁用。';
  }
  if (n === 'NotReadableError' || n === 'TrackStartError') {
    return '麦克风被别的 App 占着，系统不给。\n\n请先退出微信语音/视频、腾讯会议、电话通话、录音 App，再点话筒。\niPad 若正在屏幕录制或通话中，也会占用麦克风。';
  }
  if (n === 'OverconstrainedError') {
    return '这个麦克风不支持当前的采集参数（通常是把 iPad 当老师端 + 外接设备时出现）。\n\n换个内置麦克风或去掉外接设备再试。';
  }
  return (e && (e.message || e.name)) || String(e);
}

async function startMic() {
  if (!needSecure()) {
    alert('这个浏览器不给麦克风权限。\n\n原因：页面是 http://' + location.host + ' 打开的，浏览器规定只有 https 或 localhost 才能用麦克风。\n\n· 老师用本机：改成 http://localhost:8866 打开就能开麦\n· iPad 或异地学生：必须用 https 地址（你现在这个 trycloudflare 链接就是 https，正常可用）');
    return;
  }
  primeAudio();          // 关键：必须在"点击"这一步同步解锁，不能等 await 之后
  setMicUI(false);
  AUDIO.procTicks = 0;
  try {
    // 先用"理想参数"申请；个别 iPad / 外接麦克风不认这些约束，就退回到最简参数
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, noiseSuppression: true, autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (e0) {
      if (e0 && (e0.name === 'NotAllowedError' || e0.name === 'NotReadableError')) throw e0;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (_) {}
    const ctx = AUDIO.inCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (_) {} }
    if (!AUDIO.outCtx) AUDIO.outCtx = new (window.AudioContext || window.webkitAudioContext)();
    try { if (AUDIO.outCtx.state === 'suspended') AUDIO.outCtx.resume(); } catch (_) {}

    const srcNode = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const sink = ctx.createGain();
    sink.gain.value = 0;                    // Safari 要求接到 destination 才会驱动
    srcNode.connect(proc);
    proc.connect(sink);
    sink.connect(ctx.destination);

    const ratio = ctx.sampleRate / SR_OUT;

    proc.onaudioprocess = (ev) => {
      if (!AUDIO.on) return;
      AUDIO.procTicks++;
      const input = ev.inputBuffer.getChannelData(0);

      /* ---------- 防回声门控 ----------
         1) 太安静（只是底噪）就不上传，对方那边不会反复收到"沙沙"声；
         2) 对方声音刚从我这喇叭放出来，我又用麦克风拾到了 —— 这是回声，
            不能传回去，否则会一直循环放大。判断依据：本机拾音比对方声音小。 */
      let sq = 0, inpPeak = 0;
      for (let i = 0; i < input.length; i++) {
        const v = input[i];
        sq += v * v;
        const a = v > 0 ? v : -v;
        if (a > inpPeak) inpPeak = a;
      }
      const rms = Math.sqrt(sq / input.length);
      const remoteLive = performance.now() - AUDIO.lastRemoteAt < ECHO_WIN_MS;

      if (rms < GATE_RMS) { AUDIO.muted++; return; }                     // 没人在说话
      if (remoteLive && inpPeak < 0.1 && inpPeak < AUDIO.remotePeak * ECHO_MARGIN) {
        AUDIO.muted++;                                                   // 判定为外放回声
        if (!AUDIO.echoWarned) {
          AUDIO.echoWarned = true;
          toast('检测到扬声器回声，已自动压制。想更清楚：给电脑插个耳机', 4200);
        }
        return;
      }

      const outLen = Math.floor(input.length / ratio);
      if (outLen < 8) return;
      const i16 = new Int16Array(outLen);
      let peak = 0;
      for (let i = 0; i < outLen; i++) {
        const s0 = Math.floor(i * ratio);
        const s1 = Math.min(input.length, Math.floor((i + 1) * ratio));
        let acc = 0, cnt = 0;
        for (let j = s0; j < s1; j++) { acc += input[j]; cnt++; }
        let v = cnt ? acc / cnt : 0;
        if (v > 1) v = 1; else if (v < -1) v = -1;
        i16[i] = v * 32767;
        const a = Math.abs(i16[i]);
        if (a > peak) peak = a;
      }
      relay({ type: 'audio', d: i16ToB64(i16) });
      // 电平提示
      const lv = peak / 32767;
      const b = $('#btnMic');
      if (b) {
        if (lv > 0.06) { b.classList.add('lv'); AUDIO.lastLevelAt = performance.now(); }
        else if (performance.now() - AUDIO.lastLevelAt > 260) b.classList.remove('lv');
      }
    };

    AUDIO.stream = stream;
    AUDIO.sendCtx = ctx;
    AUDIO.proc = proc;
    AUDIO.on = true;
    setMicUI(true);

    // iOS：麦克风可能被系统中断（切到别的 App、锁屏、来电），要能自己察觉
    const tr = stream.getAudioTracks()[0];
    if (tr) tr.onended = () => {
      if (AUDIO.on) { stopMic(); toast('麦克风被系统中断了，点一下话筒重新开启', 4000); }
    };

    toast('话筒已开，直接说话对方就能听到', 3000);

    // 自检：开了却没收到任何音频数据，八成是音频上下文没真正跑起来
    setTimeout(() => {
      if (!AUDIO.on || AUDIO.procTicks > 0) return;
      toast('麦克风开了但没收到声音数据：请再点一次话筒；iPad 上还要确认没有别的 App 占着麦克风', 5000);
    }, 2200);
  } catch (e) {
    AUDIO.on = false;
    setMicUI(false);
    alert('开麦失败：' + micErrText(e));
  }
}

function stopMic() {
  AUDIO.on = false;
  try { if (AUDIO.proc) AUDIO.proc.onaudioprocess = null; } catch (_) {}
  try { if (AUDIO.proc) AUDIO.proc.disconnect(); } catch (_) {}
  try { if (AUDIO.stream) AUDIO.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
  try { if (AUDIO.sendCtx && AUDIO.sendCtx.state !== 'closed') AUDIO.sendCtx.close(); } catch (_) {}
  AUDIO.proc = null; AUDIO.stream = null; AUDIO.sendCtx = null;
  setMicUI(false);
}

$('#btnFull').onclick = toggleFull;

/* ---- 投影模式：把工具栏全收起，只剩白板（电脑接大屏/投影仪时用） ---- */
function setProjection(on) {
  document.body.classList.toggle('proj', on);
  $('#projExit').hidden = !on;
  const t = $('#projText'); if (t) t.textContent = on ? '退出' : '投影';
  if (on) {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req && !isIPad()) { try { Promise.resolve(req.call(el)).catch(() => {}); } catch (_) {} }
  } else {
    const d = document;
    const fs = d.fullscreenElement || d.webkitFullscreenElement;
    if (fs) (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d);
  }
  setTimeout(() => {
    // 布局变了（工具栏收起/恢复，白板面积变了），跟随中的学生按老师视野重算一次
    if (S.role === 'student' && S.followView && S.lastPeerView) {
      S.view = followViewTarget(S.lastPeerView);
      updateZoom();
    }
    resize();
    requestRender();
  }, 140);
}
$('#btnProj').onclick = () => setProjection(!document.body.classList.contains('proj'));
$('#projExit').onclick = () => setProjection(false);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('proj')) setProjection(false);
});

$('#swFollow').onchange = (e) => {
  S.followView = e.target.checked;
  if (S.followView) toast('已跟回老师的视角');
};
['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => {
  document.addEventListener(ev, () => {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const t = $('#fullText');
    if (t) t.textContent = on ? '退出全屏' : '全屏';
  });
});

$('#btnMic').onclick = () => {
  if (AUDIO.on) { stopMic(); toast('话筒已关', 2200); }
  else startMic();
};
setMicUI(false);

// 第一次触碰页面就把音频上下文建好并解锁（iOS 规定必须由用户手势触发）
document.addEventListener('pointerdown', primeAudio, { passive: true });
document.addEventListener('touchstart', primeAudio, { passive: true });

window.addEventListener('beforeunload', () => { if (AUDIO.on) stopMic(); });

/* =============== 书写探针（诊断用，默认静默记账） ===============
   目的：不再靠猜。iPad 上真实收到的每一个指针事件、每一次落笔/提交，
   都记成带时间戳的一行，攒 0.9 秒发到服务端 logs/pen.log。
   浏览器加 ?dbg=1 时，屏幕左上角还会实时显示最近 10 行。 */
const PLOG = { buf: [], t0: performance.now(), lastT: 0, timer: 0, overlay: null, per: 0, paintT: 0, beats: 0, ev: 0, st: 0, tc: 0 };
const APP_VER = (() => { try { const m = /v=(\w+)/.exec((document.querySelector('script[src*="app.js"]') || {}).src || ''); return m ? m[1] : '?'; } catch (_) { return '?'; } })();
function plog(kind, d) {
  try {
    const t = Math.round(performance.now() - PLOG.t0);
    const dt = Math.round(t - PLOG.lastT);
    PLOG.lastT = t;
    const st = `AP=${S.activePointer} ink=${S.inkOwn ? 1 : 0} dm=${S.drawMode ? 1 : 0} pts=${S.draft && S.draft.pts ? S.draft.pts.length : '-'}`;
    const line = `${t}ms(+${dt}) ${kind} ${d || ''} | ${st}`;
    PLOG.buf.push(line);
    if (PLOG.buf.length > 500) PLOG.buf.shift();
    if (PLOG.overlay) {
      PLOG.overlay.lines.push(line);
      if (PLOG.overlay.lines.length > 9) PLOG.overlay.lines.shift();
      const now = performance.now();
      if (now - PLOG.paintT > 80) {
        PLOG.paintT = now;
        PLOG.overlay.body.textContent = 'ver=' + APP_VER + ' 心跳' + PLOG.beats + ' 点' + PLOG.ev + ' 触' + PLOG.tc + ' 笔' + PLOG.st + (S.connected ? '' : ' 【已断开】') + '\n' + PLOG.overlay.lines.join('\n');
      }
    }
    if (!PLOG.timer) PLOG.timer = setTimeout(flushLog, 900);
    if (kind === 'onUp' || kind === 'pointerup' || kind === 'pointercancel') setTimeout(flushLog, 150);
  } catch (_) {}
}
function flushLog() {
  PLOG.timer = 0;
  if (!PLOG.buf.length) return;
  const ev = PLOG.buf.splice(0, 500).join('\n');
  if (STATIC_RELAY) return;
  try {
    fetch('/log', {
      method: 'POST', keepalive: true,
      body: JSON.stringify({ ua: navigator.userAgent, role: S.role, room: S.room, dbg: /dbg=1/.test(location.search), ev }),
    }).catch(() => {});
  } catch (_) {}
}
function plogOverlayInit() {
  if (!/dbg=1/.test(location.search)) return;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99999;max-width:96vw;background:rgba(20,24,32,.86);color:#d8f3dc;font:11px/1.45 ui-monospace,Menlo,monospace;padding:8px 10px;border-radius:8px;white-space:pre-wrap;pointer-events:none;box-shadow:0 4px 18px rgba(0,0,0,.25)';
  box.textContent = '书写探针 v1126m';
  document.body.appendChild(box);
  PLOG.overlay = { lines: [], body: box };
}
window.addEventListener('load', () => {
  plogOverlayInit();
  plog('probe-on', 'ver=' + APP_VER + ' ua=' + navigator.userAgent.slice(0, 70));
  try {
    const info = ['cvBase', 'cv', 'cvInk', 'cvPred'].map((id) => {
      const c = document.getElementById(id);
      if (!c) return id + ':缺';
      const r = c.getBoundingClientRect();
      return id + ':' + c.width + 'x' + c.height + '@' + Math.round(r.width) + 'x' + Math.round(r.height) + 'z' + getComputedStyle(c).zIndex;
    }).join(' / ');
    plog('layers', info + ' dpr=' + dpr());
  } catch (_) {}
  setInterval(() => {
    PLOG.beats++;
    let hit = '';
    if (PLOG.beats % 4 === 0) {
      try {
        const r = stage.getBoundingClientRect();
        const pts = [[0.5, 0.55], [0.75, 0.7], [0.25, 0.4]];
        hit = pts.map(([fx, fy]) => {
          const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
          const id = el && (el.id || el.tagName);
          return id;
        }).join(',');
        const cl = document.getElementById('courseLayer');
        const an = document.getElementById('anno');
        hit += ' | 课件=' + (cl && !cl.hidden ? 1 : 0) + ' 标注=' + (an && an.classList.contains('on') ? 1 : 0) +
          ' 焦点=' + (document.hasFocus() ? 1 : 0) + ' 可见=' + document.visibilityState;
      } catch (_) {}
    }
    /* 心跳里带上输入计数：断笔时到底是"没收到"还是"收到了没画"，日志里一眼可见 */
    plog('beat', ('点' + PLOG.ev + ' 触' + PLOG.tc + ' 笔' + PLOG.st +
      ' 触兜底' + (TF.on ? 1 : 0) + ' 上次笔' + Math.round((performance.now() - (S.lastPenPtrAt || 0)) / 1000) + 's ') + hit);
    if (PLOG.overlay && performance.now() - PLOG.paintT > 80) {
      PLOG.paintT = performance.now();
      PLOG.overlay.body.textContent = 'ver=' + APP_VER + ' 心跳' + PLOG.beats + ' 点' + PLOG.ev + ' 触' + PLOG.tc + ' 笔' + PLOG.st + (S.connected ? '' : ' 【已断开】') + '\n' + PLOG.overlay.lines.join('\n');
    }
  }, 300);
});

/* 原始事件流：监听 window 捕获阶段，不干扰业务逻辑 */
(() => {
  const seen = new Map();
  const kinds = ['pointerdown', 'pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture', 'gotpointercapture', 'pointerrawupdate'];
  kinds.forEach((k) => {
    window.addEventListener(k, (e) => {
      let extra = '';
      PLOG.ev++;
      if (k === 'pointerdown') { PLOG.per = 0; }
      const co = (e.getCoalescedEvents && e.getCoalescedEvents()) ? e.getCoalescedEvents().length : -1;
      extra = `p=${e.pointerType}/${e.pointerId} b=${e.buttons} pr=${(e.pressure || 0).toFixed(2)} co=${co} xy=${Math.round(e.clientX)},${Math.round(e.clientY)} tgt=${e.target && e.target.id ? e.target.id : (e.target && e.target.tagName) || '-'}`;
      plog(k, extra);
    }, { capture: true, passive: true });
  });
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((k) => {
    window.addEventListener(k, (e) => {
      if (k === 'touchmove') { if (PLOG.per > 6 && PLOG.per % 10 !== 0) return; }
      plog(k, 'n=' + (e.touches ? e.touches.length : 0) + ' ch=' + (e.changedTouches ? e.changedTouches.length : 0) + ' tgt=' + (e.target && e.target.id ? e.target.id : (e.target && e.target.tagName) || '-'));
    }, { capture: true, passive: true });
  });
  window.addEventListener('pointermove', (e) => {
    PLOG.per++;
    if (PLOG.per > 6 && PLOG.per % 10 !== 0) return;
    const co = (e.getCoalescedEvents && e.getCoalescedEvents()) ? e.getCoalescedEvents().length : -1;
    plog('pointermove', `p=${e.pointerType}/${e.pointerId} pr=${(e.pressure || 0).toFixed(2)} co=${co} xy=${Math.round(e.clientX)},${Math.round(e.clientY)}`);
  }, { capture: true, passive: true });
})();

