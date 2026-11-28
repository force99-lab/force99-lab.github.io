/* 纯墨迹内核：单画布、双通道输入、零重建。
   目的：把"写不出"这件事和设备/浏览器彻底分开 —— 这里没有输入框、没有分层、没有整页重绘。*/
(() => {
  const cv = document.getElementById('cv');
  const hud = document.getElementById('hud');
  const ctx = cv.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);

  const S = { tool: 'pen', color: '#1f2430', width: 2.2, strokes: [], cur: null, ptr: undefined };
  const C = { ev: 0, tc: 0, st: 0, lastKind: '-', lastGap: 0 };

  function resize() {
    const w = innerWidth, h = innerHeight;
    cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#f7f8fa'; ctx.fillRect(0, 0, w, h);
    redraw();
  }
  function redraw() {
    ctx.fillStyle = '#f7f8fa'; ctx.fillRect(0, 0, innerWidth, innerHeight);
    S.strokes.forEach(drawStroke);
    if (S.cur) drawStroke(S.cur);
  }
  function styleFor(kind) {
    if (kind === 'hl') return { color: 'rgba(184,58,46,.28)', width: 14 };
    if (kind === 'eraser') return { color: '#f7f8fa', width: 16 };
    return { color: S.color, width: S.width };
  }
  function drawSegment(s, a, b) {
    const st = styleFor(s.kind);
    ctx.strokeStyle = st.color; ctx.lineWidth = st.width;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  function drawStroke(s) {
    if (!s.pts.length) return;
    if (s.pts.length === 1) { drawSegment(s, s.pts[0], { x: s.pts[0].x + .1, y: s.pts[0].y }); return; }
    for (let i = 1; i < s.pts.length; i++) drawSegment(s, s.pts[i - 1], s.pts[i]);
  }

  function begin(x, y, kind) {
    S.cur = { kind, pts: [{ x, y }] };
    C.st++; hudPaint();
  }
  function extend(x, y) {
    if (!S.cur) return;
    const p = S.cur.pts[S.cur.pts.length - 1];
    if (Math.hypot(x - p.x, y - p.y) < 1.1) return;
    S.cur.pts.push({ x, y });
    drawSegment(S.cur, p, { x, y });
  }
  function end() {
    if (!S.cur) return;
    if (S.cur.pts.length >= 2) S.strokes.push(S.cur);
    S.cur = null;
    hudPaint();
  }

  /* ---------------- 输入通道一：PointerEvents（笔优先） ---------------- */
  let lastDown = { t: 0, x: 0, y: 0 };
  cv.addEventListener('pointerdown', (e) => {
    C.ev++; lastDown = { t: performance.now(), x: e.clientX, y: e.clientY };
    markKind('pointer:' + e.pointerType);
    if (S.cur) end();
    S.ptr = e.pointerId;
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    begin(e.clientX, e.clientY, S.tool);
  }, { passive: true });

  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId !== S.ptr || !S.cur) return;
    const list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    if (list.length > 1) list.forEach((q) => extend(q.clientX, q.clientY));
    else extend(e.clientX, e.clientY);
    C.ev++;
  }, { passive: true });

  const up = (e) => {
    if (S.ptr !== e.pointerId) return;
    S.ptr = undefined; end();
  };
  window.addEventListener('pointerup', up, { passive: true });
  window.addEventListener('pointercancel', up, { passive: true });

  /* ---------------- 输入通道二：TouchEvents（Pointer 被吞时的兜底） ---------------- */
  const TF = { on: false, id: undefined, tracks: new Map() };
  cv.addEventListener('touchstart', (e) => {
    C.tc += e.changedTouches.length; markKind('touchstart');
    [[...e.changedTouches]].flat().forEach((t) => {
      TF.tracks.set(t.identifier, { id: t.identifier, sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY, moved: 0, t0: performance.now() });
    });
  }, { passive: true });

  cv.addEventListener('touchmove', (e) => {
    C.tc++; markKind('touchmove');
    [...e.changedTouches].forEach((t) => {
      const tr = TF.tracks.get(t.identifier);
      if (!tr) return;
      tr.x = t.clientX; tr.y = t.clientY;
      tr.moved = Math.max(tr.moved, Math.hypot(tr.x - tr.sx, tr.y - tr.sy));
      if (TF.on && TF.id === tr.id) { extend(tr.x, tr.y); return; }
      if (TF.on) return;
      const now = performance.now();
      if (now - tr.t0 < 55 || tr.moved < 8) return;
      if (now - lastDown.t < 180) return;                 // 这一下已经走 pointer 通道了
      let busy = false;
      TF.tracks.forEach((o) => { if (o.id !== tr.id && o.moved > 14) busy = true; });
      if (busy) return;                                    // 两根手指 = 缩放/多指，不接管
      TF.on = true; TF.id = tr.id;
      begin(tr.sx, tr.sy, S.tool);
      extend(tr.x, tr.y);
    });
  }, { passive: true });

  const tEnd = (e) => {
    [...e.changedTouches].forEach((t) => {
      const tr = TF.tracks.get(t.identifier);
      if (!tr) return;
      if (TF.on && TF.id === tr.id) { TF.on = false; TF.id = undefined; end(); }
      TF.tracks.delete(t.identifier);
    });
  };
  window.addEventListener('touchend', tEnd, { passive: true });
  window.addEventListener('touchcancel', tEnd, { passive: true });

  /* pointer 通道回来了 → 兜底那半笔丢掉重画，避免双线 */
  window.addEventListener('pointerdown', () => {
    if (!TF.on) return;
    TF.on = false; TF.id = undefined;
    S.cur = null; redraw();
  }, { capture: true, passive: true });

  /* ---------------- iPad「随手写」杀手：任何可编辑元素一律夺焦 ----------------
     笔迹被系统当手写识别吞掉，最常见的原因就是页面上有输入框处于聚焦态。 */
  function killEditable() {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { try { a.blur(); } catch (_) {} }
    if (window.visualViewport && window.visualViewport.scale !== 1) { /* 忽略 */ }
  }
  setInterval(killEditable, 1500);
  window.addEventListener('focusin', killEditable, true);

  /* ---------------- 工具 ---------------- */
  function markKind(k) {
    const now = performance.now();
    C.lastGap = C.lastKind === '-' ? 0 : Math.round(now - (C._t || now));
    C._t = now; C.lastKind = k;
    hudPaint();
  }
  let hudT = 0;
  function hudPaint() {
    if (performance.now() - hudT < 60) return;
    hudT = performance.now();
    hud.textContent = 'ver=ink1 · ' + S.tool + '\n点' + C.ev + ' 触' + C.tc + ' 笔' + C.st +
      '\n最近:' + C.lastKind + ' 距上次' + C.lastGap + 'ms' + (TF.on ? ' [触兜底]' : '');
  }
  setInterval(hudPaint, 400);

  document.querySelectorAll('.bar button[data-tool]').forEach((b) => {
    b.onclick = () => {
      S.tool = b.dataset.tool;
      document.querySelectorAll('.bar button[data-tool]').forEach((x) => x.classList.toggle('on', x === b));
      hudPaint();
    };
  });
  document.getElementById('bUndo').onclick = () => { S.strokes.pop(); S.cur = null; redraw(); C.st = S.strokes.length; hudPaint(); };
  document.getElementById('bClear').onclick = () => { S.strokes = []; S.cur = null; C.st = 0; redraw(); hudPaint(); };

  addEventListener('resize', () => { resize(); });
  addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize(); hudPaint();
  window.__ink = { S, C, TF };
})();
