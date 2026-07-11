/* MT. PEAK — home page behavior (loader, hero, manifesto, origin/ritual canvases, reveals) */

/* ===== LOADER ===== */
function initEntrance(){
  setTimeout(() => {
    document.getElementById('loader').classList.add('done');
    startHero();
  }, 1500);
}
if(document.readyState==='complete') initEntrance();
else window.addEventListener('load', initEntrance);

/* ===== HERO ENTRANCE ===== */
function animate(el, props, delay=0){ setTimeout(()=>{ Object.assign(el.style, props); }, delay); }
function startHero(){
  const mark = document.getElementById('heroMark');
  const titleSpans = document.querySelectorAll('.hero-title .line span');
  const eyebrow = document.getElementById('heroEyebrow');
  const sub = document.getElementById('heroSub');
  const alt = document.getElementById('heroAltitude');
  const scroll = document.getElementById('heroScroll');

  mark.style.transform='translateY(-15px) scale(.9)';
  mark.style.transition='opacity 1.2s ease, transform 1.2s cubic-bezier(.16,1,.3,1)';
  animate(mark,{opacity:'1',transform:'translateY(0) scale(1)'},100);

  eyebrow.style.transition='opacity 1s ease, transform 1s ease';
  animate(eyebrow,{opacity:'1',transform:'translateY(0)'},300);

  titleSpans.forEach((s,i)=>{
    s.style.transition='transform 1.1s cubic-bezier(.16,1,.3,1)';
    animate(s,{transform:'translateY(0)'},500+i*100);
  });

  sub.style.transition='opacity 1.2s ease';
  animate(sub,{opacity:'1'},900);

  [alt,scroll].forEach((el,i)=>{
    el.style.transition='opacity 1.2s ease';
    animate(el,{opacity:'1'},1200+i*150);
  });
}

/* ===== NAV SCROLL ===== */
const nav=document.getElementById('nav');
window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>80),{passive:true});

/* ===== REVEAL ===== */
const io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.2});
document.querySelectorAll('.r-up,.r-fade').forEach(el=>io.observe(el));

/* ===== MANIFESTO — quiet line fades (staggered, one-shot) ===== */
const mLines=[...document.querySelectorAll('.m-line')];
const mio=new IntersectionObserver(es=>{
  es.forEach(e=>{
    if(e.isIntersecting){
      mLines.forEach((l,i)=>{ l.style.transitionDelay=(i*0.14)+'s'; setTimeout(()=>l.classList.add('in'),0); });
      mio.disconnect();
    }
  });
},{threshold:.35});
if(mLines.length) mio.observe(mLines[0].parentElement);

/* ===== HERO BACKDROP PARALLAX ===== */
const heroBackdrop=document.getElementById('heroBackdrop');
const heroCenter=document.querySelector('.hero-center');
let heroY=0;
(function heroLoop(){requestAnimationFrame(heroLoop);
  const target=Math.min(scrollY,innerHeight);
  heroY+=(target-heroY)*.14;
  if(Math.abs(target-heroY)<.05&&scrollY>innerHeight)return;
  const p=heroY/innerHeight;
  heroBackdrop.style.transform=`translate(-50%,${-46 - p*8}%) scale(${1+p*0.08})`;
  heroBackdrop.style.opacity=String(0.06*(1-p*0.6));
  heroCenter.style.transform=`translateY(${heroY*0.25}px)`;
  heroCenter.style.opacity=String(1-p*1.1);
})();

/* ===== visibility helpers (pause offscreen canvases for mobile smoothness) ===== */
function inViewObserver(el, cb){
  const o=new IntersectionObserver(es=>cb(es[0].isIntersecting),{threshold:0});
  o.observe(el); return o;
}
let pageVisible=!document.hidden;
document.addEventListener('visibilitychange',()=>pageVisible=!document.hidden);
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall=window.matchMedia('(max-width:900px)').matches;

/* ===== FALLING LEAVES ===== */
const lc=document.getElementById('leaves'),lx=lc.getContext('2d');
let LW,LH,leafArr=[];
function sizeL(){const d=Math.min(devicePixelRatio||1,2);LW=innerWidth;LH=innerHeight;
  lc.width=LW*d;lc.height=LH*d;lx.setTransform(d,0,0,d,0,0);}
sizeL();addEventListener('resize',sizeL);
function newLeaf(){return{x:Math.random()*LW,y:-30-Math.random()*LH,s:5+Math.random()*7,
  vy:.3+Math.random()*.6,vx:(Math.random()-.5)*.5,rot:Math.random()*6.28,vr:(Math.random()-.5)*.025,
  sway:Math.random()*6.28,op:.12+Math.random()*.25};}
const LEAF_COUNT=isSmall?7:14;
for(let i=0;i<LEAF_COUNT;i++)leafArr.push(newLeaf());
function leaf(l){lx.save();lx.translate(l.x,l.y);lx.rotate(l.rot);lx.globalAlpha=l.op;
  lx.fillStyle='#c9a961';lx.beginPath();lx.moveTo(0,-l.s);
  lx.quadraticCurveTo(l.s*.65,0,0,l.s);lx.quadraticCurveTo(-l.s*.65,0,0,-l.s);lx.fill();lx.restore();}
function loopL(){requestAnimationFrame(loopL);
  if(!pageVisible||reduceMotion){return;}
  lx.clearRect(0,0,LW,LH);leafArr.forEach(l=>{l.sway+=.02;l.y+=l.vy;
    l.x+=l.vx+Math.sin(l.sway)*.35;l.rot+=l.vr;
    if(l.y>LH+30)Object.assign(l,newLeaf());leaf(l);});}
loopL();

/* ===== ORIGIN CANVAS — atmospheric dawn backdrop ===== */
const oc=document.getElementById('originCanvas'),ox=oc.getContext('2d');
let OW,OH,haze=[],motes=[],originVisible=true;
function sizeO(){const r=oc.getBoundingClientRect();const d=Math.min(devicePixelRatio||1,2);
  oc.width=r.width*d;oc.height=r.height*d;ox.setTransform(d,0,0,d,0,0);OW=r.width;OH=r.height;}
sizeO();addEventListener('resize',sizeO);
inViewObserver(document.querySelector('.origin-visual'),v=>originVisible=v);
for(let i=0;i<7;i++)haze.push({y:.2+Math.random()*.6,x:Math.random(),
  w:.5+Math.random()*.6,h:.05+Math.random()*.08,v:.00006+Math.random()*.00012,op:.03+Math.random()*.05});
const MOTES=isSmall?16:30;
for(let i=0;i<MOTES;i++)motes.push({x:Math.random(),y:Math.random(),
  s:.6+Math.random()*1.6,vx:(Math.random()-.5)*.0002,vy:-.00005-Math.random()*.0001,
  op:.1+Math.random()*.3,tw:Math.random()*6.28});
function loopO(){requestAnimationFrame(loopO);
  if(!originVisible||!pageVisible||reduceMotion){return;}
  ox.clearRect(0,0,OW,OH);
  const sky=ox.createRadialGradient(OW*0.5,OH*0.42,0,OW*0.5,OH*0.42,OW*0.75);
  sky.addColorStop(0,'rgba(201,169,97,0.16)');sky.addColorStop(0.35,'rgba(31,74,58,0.18)');
  sky.addColorStop(1,'rgba(10,20,16,0)');ox.fillStyle=sky;ox.fillRect(0,0,OW,OH);
  const sunY=OH*0.40+Math.sin(Date.now()*0.0002)*6;
  const sg=ox.createRadialGradient(OW*0.5,sunY,0,OW*0.5,sunY,OW*0.30);
  sg.addColorStop(0,'rgba(232,205,143,0.20)');sg.addColorStop(0.6,'rgba(232,205,143,0.04)');
  sg.addColorStop(1,'rgba(232,205,143,0)');ox.fillStyle=sg;ox.fillRect(0,0,OW,OH);
  motes.forEach(m=>{m.x+=m.vx;m.y+=m.vy;m.tw+=0.03;
    if(m.y<-.05){m.y=1.05;m.x=Math.random();}
    if(m.x<-.05)m.x=1.05;if(m.x>1.05)m.x=-.05;
    const tw=0.5+0.5*Math.sin(m.tw);
    ox.beginPath();ox.arc(m.x*OW,m.y*OH,m.s,0,6.28);
    ox.fillStyle=`rgba(232,205,143,${m.op*tw})`;ox.fill();});
  haze.forEach(h=>{h.x+=h.v;if(h.x>1.4)h.x=-.4;
    const px=h.x*OW,py=h.y*OH,w=h.w*OW,hh=h.h*OH;
    const g=ox.createLinearGradient(px,py,px,py+hh);
    g.addColorStop(0,'rgba(220,225,220,0)');g.addColorStop(.5,`rgba(225,228,222,${h.op})`);
    g.addColorStop(1,'rgba(220,225,220,0)');ox.fillStyle=g;ox.fillRect(px,py,w,hh);});}
loopO();

/* ===== RITUAL — scroll-driven brew ===== */
const bc=document.getElementById('brewCanvas'),bx=bc.getContext('2d');
const ritual=document.getElementById('ritual');
const brewStatus=document.getElementById('brewStatus');
const glow=document.getElementById('ritualGlow');
const steps=document.querySelectorAll('.ritual-step');
let BW,BH,steam=[],brewVisible=true;
function sizeB(){const r=bc.getBoundingClientRect();const d=Math.min(devicePixelRatio||1,2);
  bc.width=Math.max(1,r.width*d);bc.height=Math.max(1,r.height*d);bx.setTransform(d,0,0,d,0,0);
  BW=r.width;BH=r.height;}
sizeB();addEventListener('resize',sizeB);addEventListener('orientationchange',()=>setTimeout(sizeB,200));
inViewObserver(ritual,v=>brewVisible=v);
function brewP(){const r=ritual.getBoundingClientRect();const tot=ritual.offsetHeight-innerHeight;
  return tot>0?Math.min(Math.max(-r.top,0),tot)/tot:0;}
function steamP(cx,cy){return{x:cx+(Math.random()-.5)*40,y:cy,s:5+Math.random()*8,
  v:.5+Math.random()*.6,op:.35+Math.random()*.25,sway:Math.random()*6.28};}

function drawBrew(p){
  bx.clearRect(0,0,BW,BH);
  const cx=BW/2;
  glow.style.transform=`scale(${.6+p*.8})`;
  glow.style.opacity=String(.4+p*.6);
  let stage=p<.2?0:p<.45?1:p<.82?2:3;
  steps.forEach(s=>s.classList.toggle('active',+s.dataset.step<=stage));

  // ---- POT ----
  const potY=BH*.24, potRx=BW*.20, potRy=BH*.13;
  bx.strokeStyle='#c9a961';bx.lineWidth=2;bx.fillStyle='rgba(201,169,97,.05)';
  bx.beginPath();bx.ellipse(cx,potY,potRx,potRy,0,0,6.28);bx.fill();bx.stroke();
  bx.beginPath();bx.ellipse(cx,potY-potRy*.85,potRx*.55,potRy*.22,0,0,6.28);bx.stroke();
  bx.beginPath();bx.arc(cx,potY-potRy*1.05,3.5,0,6.28);bx.fillStyle='#c9a961';bx.fill();
  const tilt=p>.2&&p<.85?Math.sin(Date.now()*.004)*.03:0;
  bx.save();bx.translate(cx-potRx*.9,potY-potRy*.1);bx.rotate(-.3+tilt);
  bx.beginPath();bx.moveTo(0,0);bx.quadraticCurveTo(-BW*.10,-BH*.02,-BW*.09,BH*.06);
  bx.lineWidth=2;bx.strokeStyle='#c9a961';bx.stroke();bx.restore();
  bx.beginPath();bx.moveTo(cx+potRx*.95,potY-potRy*.4);
  bx.quadraticCurveTo(cx+potRx*1.7,potY,cx+potRx*.95,potY+potRy*.5);bx.stroke();

  // ---- CUP ----
  const cupY=BH*.66,cupW=BW*.30,cupH=BH*.16;
  if(p>.2&&p<.85){
    const sx=cx-potRx*1.0-BW*.06;
    bx.beginPath();bx.moveTo(sx,potY+potRy*.3);
    bx.quadraticCurveTo(sx-5,cupY-cupH,cx-cupW*.15,cupY-cupH*.5);
    bx.lineWidth=2.5;bx.strokeStyle='rgba(168,137,63,.7)';bx.stroke();
    for(let i=0;i<3;i++){bx.beginPath();
      bx.arc(cx-cupW*.15+(Math.random()-.5)*10,cupY-cupH*.4+(Math.random()-.5)*8,1.2,0,6.28);
      bx.fillStyle='rgba(168,137,63,.5)';bx.fill();}
  }
  if(p>.4){if(Math.random()<.35)steam.push(steamP(cx,cupY-cupH*.5));}
  steam.forEach((s,i)=>{s.y-=s.v;s.sway+=.04;s.x+=Math.sin(s.sway)*.5;s.op-=.005;
    if(s.op<=0){steam.splice(i,1);return;}
    bx.save();bx.globalAlpha=s.op*Math.min(p*1.5,1);bx.fillStyle='#e8cd8f';
    bx.beginPath();bx.arc(s.x,s.y,s.s,0,6.28);bx.fill();bx.restore();});

  bx.strokeStyle='#c9a961';bx.lineWidth=2;
  bx.beginPath();bx.moveTo(cx-cupW/2,cupY-cupH/2);
  bx.lineTo(cx-cupW/2+5,cupY+cupH/2);
  bx.quadraticCurveTo(cx,cupY+cupH/2+7,cx+cupW/2-5,cupY+cupH/2);
  bx.lineTo(cx+cupW/2,cupY-cupH/2);bx.stroke();
  bx.beginPath();bx.moveTo(cx+cupW/2-2,cupY-cupH*.2);
  bx.quadraticCurveTo(cx+cupW/2+20,cupY,cx+cupW/2-2,cupY+cupH*.28);bx.stroke();
  const fill=Math.min(Math.max((p-.18)/.6,0),1);
  if(fill>.02){bx.save();bx.beginPath();
    bx.moveTo(cx-cupW/2+2,cupY-cupH/2);bx.lineTo(cx-cupW/2+5,cupY+cupH/2);
    bx.quadraticCurveTo(cx,cupY+cupH/2+5,cx+cupW/2-5,cupY+cupH/2);
    bx.lineTo(cx+cupW/2-2,cupY-cupH/2);bx.clip();
    const top=cupY+cupH/2-cupH*fill;
    const g=bx.createLinearGradient(0,top,0,cupY+cupH/2);
    g.addColorStop(0,'#c98a3e');g.addColorStop(1,'#7a4a16');bx.fillStyle=g;
    bx.beginPath();bx.moveTo(cx-cupW/2,top);
    for(let x=-cupW/2;x<=cupW/2;x+=6)bx.lineTo(cx+x,top+Math.sin(x*.1+Date.now()*.003)*1.5);
    bx.lineTo(cx+cupW/2,cupY+cupH);bx.lineTo(cx-cupW/2,cupY+cupH);bx.closePath();bx.fill();
    bx.restore();}
  bx.beginPath();bx.ellipse(cx,cupY+cupH/2+12,cupW*.78,BH*.016,0,0,6.28);
  bx.strokeStyle='#c9a961';bx.lineWidth=1.5;bx.stroke();

  if(p<.05)brewStatus.textContent='Scroll to begin the pour';
  else if(p<.2)brewStatus.textContent='Warming the vessel…';
  else if(p<.45)brewStatus.textContent='Pouring at altitude…';
  else if(p<.82)brewStatus.textContent='Steeping — '+Math.round(p*100)+'%';
  else brewStatus.textContent='Perfectly drawn.';
}
let brewProg=0;
function loopB(){requestAnimationFrame(loopB);
  if(!brewVisible||!pageVisible){return;}
  brewProg+=(brewP()-brewProg)*.12;
  drawBrew(brewProg);}
loopB();

/* ===== misc ===== */
function scrollToId(id){const el=document.getElementById(id);
  window.scrollTo({top:el.getBoundingClientRect().top+window.scrollY-40,behavior:'smooth'});}
