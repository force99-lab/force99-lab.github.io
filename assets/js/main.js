/* ============================================================
   main.js  —  交互逻辑：粒子背景 / 滚动揭示 / 作品渲染 / 筛选 / 导航
   ============================================================ */

/* ---------- 导航：滚动样式 + 移动端菜单 ---------- */
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 30));

const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
if (toggle) toggle.addEventListener('click', () => links.classList.toggle('open'));
if (links) links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));

/* ---------- 粒子网络背景 ---------- */
(function particles(){
  const cv = document.getElementById('particles');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let w, h, pts, raf;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize(){
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = w * DPR; cv.height = h * DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
    const count = Math.min(90, Math.floor(w * h / 16000));
    pts = Array.from({length:count}, () => ({
      x: Math.random()*w, y: Math.random()*h,
      vx:(Math.random()-.5)*.35, vy:(Math.random()-.5)*.35,
      r: Math.random()*1.8 + .6
    }));
  }
  function step(){
    ctx.clearRect(0,0,w,h);
    for (const p of pts){
      p.x += p.vx; p.y += p.vy;
      if (p.x<0||p.x>w) p.vx*=-1;
      if (p.y<0||p.y>h) p.vy*=-1;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7);
      ctx.fillStyle='rgba(127,245,230,0.75)'; ctx.fill();
    }
    for (let i=0;i<pts.length;i++){
      for (let j=i+1;j<pts.length;j++){
        const a=pts[i], b=pts[j];
        const dx=a.x-b.x, dy=a.y-b.y, d=Math.hypot(dx,dy);
        if (d<128){
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
          ctx.strokeStyle='rgba(15,181,168,'+(0.16*(1-d/128))+')';
          ctx.lineWidth=1; ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(step);
  }
  resize(); step();
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); resize(); step(); });
})();

/* ---------- 滚动揭示 ---------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold:0.12 });
function observeReveals(root=document){
  root.querySelectorAll('.reveal').forEach(el => io.observe(el));
}

/* ---------- 作品卡片渲染 ---------- */
function cardHTML(item){
  const coverStyle = item.cover ? `style="background-image:url('${item.cover}');"` : '';
  const coverCls = `cover ${TYPE_GRAD[item.type]}${item.cover ? ' has-img' : ''}`;
  return `
  <article class="card reveal" data-type="${item.type}">
    <a href="${item.link}" style="display:contents">
      <div class="${coverCls}" ${coverStyle}>
        <span class="type-tag">${TYPE_LABEL[item.type]}</span>
        <span class="ic">${item.icon}</span>
      </div>
      <div class="body">
        <h3>${item.title}</h3>
        <p>${item.desc}</p>
        <div class="meta"><span>${item.date}${item.tag?(' · '+item.tag):''}</span><span class="go">查看 →</span></div>
      </div>
    </a>
  </article>`;
}

/* 首页：全部作品 + 筛选 */
function initHome(){
  const grid = document.getElementById('workGrid');
  if (!grid) return;
  const types = ['all', ...Object.keys(TYPE_LABEL)];
  const bar = document.getElementById('filters');
  bar.innerHTML = types.map((t,i) =>
    `<button class="filter ${i===0?'active':''}" data-f="${t}">${t==='all'?'全部':TYPE_LABEL[t]}</button>`).join('');
  function render(filter='all'){
    const list = filter==='all' ? WORKS : WORKS.filter(w=>w.type===filter);
    grid.innerHTML = list.map(cardHTML).join('');
    observeReveals(grid);
  }
  render();
  bar.addEventListener('click', e => {
    const b = e.target.closest('.filter'); if(!b) return;
    bar.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    render(b.dataset.f);
  });
}

/* 分类页：按 type 渲染 */
function initCategory(type){
  const grid = document.getElementById('catGrid');
  if (!grid) return;
  grid.innerHTML = WORKS.filter(w=>w.type===type).map(cardHTML).join('');
  observeReveals(grid);
}

/* 文章列表页 */
function initArticles(){
  const box = document.getElementById('articleList');
  if (!box) return;
  const fmt = d => { const [y,m,day]=d.split('-'); return `<div class="date"><b>${day}</b>${y}.${m}</div>`; };
  box.innerHTML = WORKS.filter(w=>w.type==='article').sort((a,b)=>b.date.localeCompare(a.date)).map(it => `
    <a class="article-row reveal" href="${it.link}">
      ${fmt(it.date)}
      <div><h3>${it.title}</h3><p>${it.desc}</p></div>
      <div class="arrow">→</div>
    </a>`).join('');
  observeReveals(box);
}

document.addEventListener('DOMContentLoaded', () => {
  observeReveals();
  initHome();
  initArticles();
  // 分类页通过 body[data-cat] 调用
  const cat = document.body.dataset.cat;
  if (cat) initCategory(cat);
});
