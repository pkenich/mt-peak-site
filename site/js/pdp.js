/* MT. PEAK — product detail page behavior (gallery, quantity, add-to-cart, reveals) */

/* ===== GALLERY ===== */
const galMain=document.getElementById('galMain');
const thumbs=[...document.querySelectorAll('.gal-thumb')];
function swapMain(html){
  const cur=galMain.firstElementChild;
  if(cur){cur.style.opacity='0';}
  setTimeout(()=>{
    galMain.innerHTML=html;
    const el=galMain.firstElementChild;
    el.style.opacity='0';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.opacity='1';}));
  },220);
}
thumbs.forEach(t=>t.addEventListener('click',()=>{
  if(t.classList.contains('active'))return;
  thumbs.forEach(x=>x.classList.remove('active'));t.classList.add('active');
  if(t.dataset.type==='img'){
    swapMain(`<img src="${t.dataset.src}" alt="${t.dataset.alt}">`);
  }else{
    swapMain(`<div class="gal-ph"><div class="ph-mark">${t.dataset.label}</div><div class="ph-sub">${t.dataset.sub}</div></div>`);
  }
}));

/* ===== QUANTITY ===== */
const qVal=document.getElementById('qVal');
function clampQ(){let v=parseInt(qVal.value)||1;v=Math.max(1,Math.min(20,v));qVal.value=v;return v;}
document.getElementById('qMinus').onclick=()=>{qVal.value=Math.max(1,(parseInt(qVal.value)||1)-1);};
document.getElementById('qPlus').onclick=()=>{qVal.value=Math.min(20,(parseInt(qVal.value)||1)+1);};
qVal.addEventListener('change',clampQ);

/* ===== ADD TO CART (product identity comes from data-name/data-price attrs) ===== */
const btnAdd=document.getElementById('btnAdd');
const PRODUCT_NAME=btnAdd.dataset.name;
const PRODUCT_PRICE=Number(btnAdd.dataset.price);
const addLabel='Add to Reserve — £'+PRODUCT_PRICE;
btnAdd.addEventListener('click',()=>{
  addToCart(PRODUCT_NAME,PRODUCT_PRICE,clampQ());
  btnAdd.classList.add('added');btnAdd.textContent='Added to Reserve ✓';
  setTimeout(()=>{btnAdd.classList.remove('added');btnAdd.textContent=addLabel;},1600);
});
const btnAdd2=document.getElementById('btnAdd2');
if(btnAdd2){
  btnAdd2.addEventListener('click',e=>{e.preventDefault();addToCart(PRODUCT_NAME,PRODUCT_PRICE,1);});
}

/* ===== SCROLL REVEALS ===== */
const rvEls=[...document.querySelectorAll('.info,.sec-label,.sec-h,.taste-grid,.taste-foot,.brew-grid,.brew-method,.make-grid,.os-content,.spec-table,.pdp-closer h2,.pdp-closer p,.pdp-closer .cbtn')];
rvEls.forEach(el=>el.classList.add('rv'));
const rio=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');rio.unobserve(e.target);}}),{threshold:.12,rootMargin:'0px 0px -40px 0px'});
rvEls.forEach(el=>rio.observe(el));
