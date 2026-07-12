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

/* ===== CINEMATIC HERO SCENE — parallax mountains, dawn sun, stars, mist, gold dust ===== */
(function heroScene(){
  const cv=document.getElementById('heroScene'); if(!cv) return;
  const cx=cv.getContext('2d');
  let W=0,H=0,layers=[],stars=[],dust=[],mx=0,my=0,tx=0,ty=0,t=0;
  const D=()=>Math.min(devicePixelRatio||1,2);

  // jagged ridgeline as points spanning -pad..W+pad (slack for parallax shift)
  function makeRidge(baseFrac,amp,step,seed){
    const pad=48,pts=[]; let s=seed;
    const rnd=()=>{ s=(s*9301+49297)%233280; return s/233280; };
    const baseY=H*baseFrac;
    for(let x=-pad;x<=W+pad;x+=step){
      const h=rnd()*0.55+(rnd()*rnd())*0.85; // ridged: sharp peaks, soft valleys
      pts.push({x,y:baseY-h*amp});
    }
    return {pts};
  }
  function build(){
    layers=[
      {r:makeRidge(0.70,58,74,11),fill:'rgba(31,74,58,0.55)', rim:'rgba(201,169,97,0.12)',par:8},
      {r:makeRidge(0.80,92,56,29),fill:'rgba(18,44,34,0.92)', rim:'rgba(201,169,97,0.18)',par:16},
      {r:makeRidge(0.93,124,44,53),fill:'#09110d',            rim:'rgba(201,169,97,0.30)',par:28},
    ];
    const SN=isSmall?24:52,DN=isSmall?12:24;
    stars=Array.from({length:SN},()=>({x:Math.random(),y:Math.random()*0.5,s:Math.random()*1.1+0.3,tw:Math.random()*6.28}));
    dust=Array.from({length:DN},()=>({x:Math.random(),y:Math.random(),s:Math.random()*1.5+0.5,
      v:0.0002+Math.random()*0.0004,tw:Math.random()*6.28,drift:(Math.random()-.5)*0.0003}));
  }
  function size(){ const d=D();W=cv.clientWidth;H=cv.clientHeight;cv.width=W*d;cv.height=H*d;cx.setTransform(d,0,0,d,0,0);build(); }
  size(); addEventListener('resize',size);
  addEventListener('pointermove',e=>{ tx=(e.clientX/innerWidth-0.5)*2; ty=(e.clientY/innerHeight-0.5)*2; },{passive:true});

  function ridge(l,ox,oy){
    const p=l.r.pts; cx.save(); cx.translate(ox,oy);
    cx.beginPath(); cx.moveTo(p[0].x,H+48);
    for(const q of p) cx.lineTo(q.x,q.y);
    cx.lineTo(p[p.length-1].x,H+48); cx.closePath(); cx.fillStyle=l.fill; cx.fill();
    cx.beginPath(); cx.moveTo(p[0].x,p[0].y);
    for(const q of p) cx.lineTo(q.x,q.y);
    cx.strokeStyle=l.rim; cx.lineWidth=1.2; cx.stroke(); cx.restore();
  }
  function frame(){
    mx+=(tx-mx)*0.06; my+=(ty-my)*0.06; t++;
    cx.clearRect(0,0,W,H);
    const sp=Math.min(scrollY/Math.max(innerHeight,1),1);
    if(sp>=1) return; // hero offscreen
    const a=1-sp*0.9, lift=sp*64;

    const sunX=W*0.5+mx*4, sunY=H*0.42-lift*0.4+Math.sin(t*0.004)*4;
    let g=cx.createRadialGradient(sunX,sunY,0,sunX,sunY,Math.max(W,H)*0.42);
    g.addColorStop(0,`rgba(232,205,143,${0.22*a})`);
    g.addColorStop(0.4,`rgba(201,169,97,${0.06*a})`);
    g.addColorStop(1,'rgba(201,169,97,0)');
    cx.fillStyle=g; cx.fillRect(0,0,W,H);

    for(const st of stars){ st.tw+=0.03;
      const px=st.x*W+mx*3, py=st.y*H-lift*0.2;
      const dist=Math.hypot(px-sunX,py-sunY)/(W*0.5), fade=Math.min(Math.max(dist-0.3,0),1);
      cx.globalAlpha=(0.35+0.4*Math.sin(st.tw))*fade*a; cx.fillStyle='#f4efe6';
      cx.beginPath(); cx.arc(px,py,st.s,0,6.28); cx.fill(); }
    cx.globalAlpha=1;

    ridge(layers[0],mx*layers[0].par,lift*0.3);
    let m=cx.createLinearGradient(0,H*0.72,0,H*0.9); m.addColorStop(0,'rgba(214,222,216,0)');
    m.addColorStop(0.5,`rgba(214,222,216,${0.05*a})`); m.addColorStop(1,'rgba(214,222,216,0)');
    cx.fillStyle=m; cx.fillRect(0,H*0.7-lift*0.2,W,H*0.22);
    ridge(layers[1],mx*layers[1].par,lift*0.5);
    ridge(layers[2],mx*layers[2].par,lift*0.7);

    for(const d of dust){ d.y-=d.v; d.x+=d.drift; d.tw+=0.04; if(d.y<-0.02){d.y=1.02;d.x=Math.random();}
      cx.globalAlpha=(0.3+0.4*Math.sin(d.tw))*a; cx.fillStyle='#e8cd8f';
      cx.beginPath(); cx.arc(d.x*W+mx*10,d.y*H,d.s,0,6.28); cx.fill(); }
    cx.globalAlpha=1;
  }
  if(reduceMotion){ frame(); return; }
  (function loop(){ requestAnimationFrame(loop); if(!pageVisible) return; frame(); })();
})();

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
/* Brew simulation v2 — a physical pour:
   embers while the pot warms → the pot leans and a droplet stream falls
   under gravity, splashing and rippling on the surface → colour blooms and
   leaves swirl while it steeps → sparkles and a ring pulse at serve.
   All particle pools are capped (lower on small screens); the fill level
   stays a pure function of scroll so scrubbing backwards works. */
const drops=[],splashes=[],ripples=[],leaves2=[],embers=[],sparks=[];
const CAP={drops:isSmall?36:80,splash:isSmall?20:44,steam:isSmall?24:54,embers:isSmall?10:18};
for(let i=0;i<5;i++)leaves2.push({a:Math.random()*6.28,r:.14+Math.random()*.3,
  va:.004+Math.random()*.006,rot:Math.random()*6.28,vr:(Math.random()-.5)*.05,s:3+Math.random()*3.5,d:.35+Math.random()*.5});
let tilt=0,lastRing=0;

function steamP(cx,cy){return{x:cx+(Math.random()-.5)*46,y:cy,s:4+Math.random()*9,
  v:.4+Math.random()*.7,op:.3+Math.random()*.25,sway:Math.random()*6.28,grow:.05+Math.random()*.08};}

function drawBrew(p){
  bx.clearRect(0,0,BW,BH);
  const cx=BW/2,now=Date.now();
  glow.style.transform=`scale(${.6+p*.8})`;
  glow.style.opacity=String(.4+p*.6);
  const stage=p<.2?0:p<.45?1:p<.82?2:3;
  steps.forEach(s=>s.classList.toggle('active',+s.dataset.step<=stage));

  const potX=cx,potY=BH*.22,potRx=BW*.19,potRy=BH*.12;
  const cupY=BH*.66,cupW=BW*.30,cupH=BH*.16;
  const surfaceFill=Math.min(Math.max((p-.18)/.6,0),1);
  const surfaceY=cupY+cupH/2-cupH*surfaceFill;
  const pouring=p>.2&&p<.82;

  // ---- WARM: embers rising around the pot ----
  if(p>.03&&p<.3&&embers.length<CAP.embers&&Math.random()<.3)
    embers.push({x:potX+(Math.random()-.5)*potRx*2.4,y:potY+potRy*1.4,
      s:.8+Math.random()*1.6,v:.25+Math.random()*.4,op:.5+Math.random()*.3,sway:Math.random()*6.28});
  for(let i=embers.length-1;i>=0;i--){const e=embers[i];
    e.y-=e.v;e.sway+=.06;e.x+=Math.sin(e.sway)*.3;e.op-=.006;
    if(e.op<=0){embers.splice(i,1);continue;}
    bx.globalAlpha=e.op;bx.fillStyle='#e8cd8f';
    bx.beginPath();bx.arc(e.x,e.y,e.s,0,6.28);bx.fill();bx.globalAlpha=1;}

  // ---- POT (tilts into the pour) ----
  const tiltTarget=pouring?.30+Math.sin(now*.003)*.035:0;
  tilt+=(tiltTarget-tilt)*.08;
  const spoutX=potX-potRx*1.28,spoutY=potY-potRy*.15;
  bx.save();
  bx.translate(potX,potY);bx.rotate(-tilt);bx.translate(-potX,-potY);
  bx.strokeStyle='#c9a961';bx.lineWidth=2;bx.fillStyle='rgba(201,169,97,.05)';
  bx.beginPath();bx.ellipse(potX,potY,potRx,potRy,0,0,6.28);bx.fill();bx.stroke();
  bx.beginPath();bx.ellipse(potX,potY-potRy*.85,potRx*.55,potRy*.22,0,0,6.28);bx.stroke();
  bx.beginPath();bx.arc(potX,potY-potRy*1.05,3.5,0,6.28);bx.fillStyle='#c9a961';bx.fill();
  // spout (left) + handle (right)
  bx.beginPath();bx.moveTo(potX-potRx*.92,potY-potRy*.35);
  bx.quadraticCurveTo(spoutX-6,spoutY-10,spoutX,spoutY);
  bx.lineWidth=2;bx.stroke();
  bx.beginPath();bx.moveTo(potX+potRx*.95,potY-potRy*.4);
  bx.quadraticCurveTo(potX+potRx*1.7,potY,potX+potRx*.95,potY+potRy*.5);bx.stroke();
  bx.restore();

  // world-space spout tip after rotation about pot centre
  const dx=spoutX-potX,dy=spoutY-potY,ct=Math.cos(-tilt),st=Math.sin(-tilt);
  const tipX=potX+dx*ct-dy*st,tipY=potY+dx*st+dy*ct;

  // ---- POUR: droplet stream under gravity ----
  if(pouring){
    const rate=isSmall?2:4;
    for(let i=0;i<rate;i++)if(drops.length<CAP.drops)
      drops.push({x:tipX+(Math.random()-.5)*2.5,y:tipY+Math.random()*3,
        vx:-.55-Math.random()*.4,vy:.4+Math.random()*.6,s:1.1+Math.random()*1.5,op:.75+Math.random()*.25});
  }
  const targetX=cx-cupW*.13;
  for(let i=drops.length-1;i>=0;i--){const d=drops[i];
    d.vy+=.34;d.x+=d.vx;d.vx+=(targetX-d.x)*.0016;d.y+=d.vy;
    if(d.y>=surfaceY-1&&surfaceFill>.01){
      drops.splice(i,1);
      if(splashes.length<CAP.splash)for(let k=0;k<2;k++)
        splashes.push({x:d.x,y:surfaceY,vx:(Math.random()-.5)*1.6,vy:-1-Math.random()*1.4,
          s:.8+Math.random()*1,op:.7});
      if(ripples.length<6&&Math.random()<.3)ripples.push({x:d.x,y:surfaceY,r:2,op:.5});
      continue;}
    if(d.y>cupY+cupH){drops.splice(i,1);continue;}
    bx.globalAlpha=d.op;bx.fillStyle='#c98a3e';
    bx.beginPath();bx.ellipse(d.x,d.y,d.s*.75,d.s*1.5,0,0,6.28);bx.fill();bx.globalAlpha=1;}
  // continuous stream core while pouring (droplets ride on top of it)
  if(pouring&&surfaceFill>.005){
    const g=bx.createLinearGradient(tipX,tipY,targetX,surfaceY);
    g.addColorStop(0,'rgba(201,138,62,.55)');g.addColorStop(1,'rgba(201,138,62,.18)');
    bx.strokeStyle=g;bx.lineWidth=2+Math.sin(now*.02)*.7;
    bx.beginPath();bx.moveTo(tipX,tipY);
    bx.quadraticCurveTo(tipX-BW*.02,(tipY+surfaceY)/2,targetX,surfaceY);bx.stroke();}

  for(let i=splashes.length-1;i>=0;i--){const s=splashes[i];
    s.vy+=.22;s.x+=s.vx;s.y+=s.vy;s.op-=.03;
    if(s.op<=0||s.y>surfaceY+8){splashes.splice(i,1);continue;}
    bx.globalAlpha=s.op;bx.fillStyle='#e8cd8f';
    bx.beginPath();bx.arc(s.x,s.y,s.s,0,6.28);bx.fill();bx.globalAlpha=1;}

  // ---- CUP ----
  bx.strokeStyle='#c9a961';bx.lineWidth=2;
  bx.beginPath();bx.moveTo(cx-cupW/2,cupY-cupH/2);
  bx.lineTo(cx-cupW/2+5,cupY+cupH/2);
  bx.quadraticCurveTo(cx,cupY+cupH/2+7,cx+cupW/2-5,cupY+cupH/2);
  bx.lineTo(cx+cupW/2,cupY-cupH/2);bx.stroke();
  bx.beginPath();bx.moveTo(cx+cupW/2-2,cupY-cupH*.2);
  bx.quadraticCurveTo(cx+cupW/2+20,cupY,cx+cupW/2-2,cupY+cupH*.28);bx.stroke();

  if(surfaceFill>.02){
    bx.save();bx.beginPath();
    bx.moveTo(cx-cupW/2+2,cupY-cupH/2);bx.lineTo(cx-cupW/2+5,cupY+cupH/2);
    bx.quadraticCurveTo(cx,cupY+cupH/2+5,cx+cupW/2-5,cupY+cupH/2);
    bx.lineTo(cx+cupW/2-2,cupY-cupH/2);bx.clip();
    // base liquor
    const g=bx.createLinearGradient(0,surfaceY,0,cupY+cupH/2);
    g.addColorStop(0,'#c98a3e');g.addColorStop(1,'#7a4a16');bx.fillStyle=g;
    bx.beginPath();bx.moveTo(cx-cupW/2,surfaceY);
    for(let x=-cupW/2;x<=cupW/2;x+=6)bx.lineTo(cx+x,surfaceY+Math.sin(x*.1+now*.003)*1.5);
    bx.lineTo(cx+cupW/2,cupY+cupH);bx.lineTo(cx-cupW/2,cupY+cupH);bx.closePath();bx.fill();
    // colour bloom while steeping: three drifting amber clouds deepen the cup
    const bloom=Math.min(Math.max((p-.45)/.35,0),1);
    if(bloom>0){
      for(let i=0;i<3;i++){
        const a=now*.0004*(i+1)+i*2.1;
        const bxp=cx+Math.cos(a)*cupW*.18,byp=surfaceY+(cupY+cupH/2-surfaceY)*(.35+.25*Math.sin(a*1.3+i));
        const rg=bx.createRadialGradient(bxp,byp,0,bxp,byp,cupW*.28);
        rg.addColorStop(0,`rgba(122,58,12,${.34*bloom})`);rg.addColorStop(1,'rgba(122,58,12,0)');
        bx.fillStyle=rg;bx.fillRect(cx-cupW/2,surfaceY,cupW,cupH);}
      // swirling leaves
      for(const l of leaves2){l.a+=l.va;l.rot+=l.vr;
        const lx2=cx+Math.cos(l.a)*cupW*l.r,ly2=surfaceY+(cupY+cupH/2-surfaceY)*l.d+Math.sin(l.a*2)*3;
        bx.save();bx.translate(lx2,ly2);bx.rotate(l.rot);bx.globalAlpha=.5*bloom;
        bx.fillStyle='#8a5a20';bx.beginPath();bx.moveTo(0,-l.s);
        bx.quadraticCurveTo(l.s*.6,0,0,l.s);bx.quadraticCurveTo(-l.s*.6,0,0,-l.s);bx.fill();bx.restore();}
    }
    // gold shimmer on the surface
    bx.globalAlpha=.28+.12*Math.sin(now*.004);bx.strokeStyle='#e8cd8f';bx.lineWidth=1.2;
    bx.beginPath();bx.moveTo(cx-cupW/2+4,surfaceY);
    for(let x=-cupW/2+4;x<=cupW/2-4;x+=6)bx.lineTo(cx+x,surfaceY+Math.sin(x*.1+now*.003)*1.5);
    bx.stroke();bx.globalAlpha=1;
    bx.restore();
  }

  // ---- ripples spreading on the surface ----
  for(let i=ripples.length-1;i>=0;i--){const r=ripples[i];
    r.r+=.8;r.op-=.012;
    if(r.op<=0){ripples.splice(i,1);continue;}
    bx.globalAlpha=r.op;bx.strokeStyle='#e8cd8f';bx.lineWidth=1;
    bx.beginPath();bx.ellipse(r.x,r.y,r.r,r.r*.3,0,0,6.28);bx.stroke();bx.globalAlpha=1;}

  // ---- steam: sinuous curls that widen as they rise ----
  const steamRate=p<.4?0:p<.82?.5:.28;
  if(Math.random()<steamRate&&steam.length<CAP.steam)steam.push(steamP(cx,surfaceY-4));
  for(let i=steam.length-1;i>=0;i--){const s=steam[i];
    s.y-=s.v;s.sway+=.045;s.x+=Math.sin(s.sway+s.y*.02)*.8;s.s+=s.grow;s.op-=.004;
    if(s.op<=0){steam.splice(i,1);continue;}
    bx.globalAlpha=s.op*Math.min(p*1.5,1)*.5;bx.fillStyle='#e8cd8f';
    bx.beginPath();bx.arc(s.x,s.y,s.s,0,6.28);bx.fill();bx.globalAlpha=1;}

  // ---- SERVE: ring pulse + star sparkles ----
  if(p>.85){
    if(now-lastRing>1300){lastRing=now;ripples.push({x:cx,y:cupY-cupH*.1,r:6,op:.45,serve:true});}
    if(Math.random()<.12&&sparks.length<8)
      sparks.push({x:cx+(Math.random()-.5)*cupW*1.5,y:cupY-cupH*(.2+Math.random()*.9),
        s:0,max:2.5+Math.random()*2.5,op:1,phase:0});
  }
  for(let i=sparks.length-1;i>=0;i--){const k=sparks[i];
    k.phase+=.06;const t=Math.sin(Math.min(k.phase,3.14));k.s=k.max*t;
    if(k.phase>=3.14){sparks.splice(i,1);continue;}
    bx.globalAlpha=t;bx.strokeStyle='#e8cd8f';bx.lineWidth=1;
    bx.beginPath();bx.moveTo(k.x-k.s,k.y);bx.lineTo(k.x+k.s,k.y);
    bx.moveTo(k.x,k.y-k.s);bx.lineTo(k.x,k.y+k.s);bx.stroke();bx.globalAlpha=1;}

  // cup shadow
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
  if(!brewVisible||!pageVisible)return;
  if(reduceMotion){drawBrew(brewP());return;}
  brewProg+=(brewP()-brewProg)*.12;
  drawBrew(brewProg);}
loopB();

/* ===== misc ===== */
function scrollToId(id){const el=document.getElementById(id);
  window.scrollTo({top:el.getBoundingClientRect().top+window.scrollY-40,behavior:'smooth'});}
