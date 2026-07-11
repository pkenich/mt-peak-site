/* MT. PEAK — shared cart (localStorage-backed, carries between all pages) */
const STORE='mtpeak_cart';
let cart=[];
try{cart=JSON.parse(localStorage.getItem(STORE))||[];}catch(e){cart=[];}
const navCart=document.getElementById('navCart');

function save(){try{localStorage.setItem(STORE,JSON.stringify(cart));}catch(e){}}

function addToCart(n,p,q=1){
  const e=cart.find(i=>i.n===n);
  if(e)e.q+=q;else cart.push({n,p,q});
  save();render();openCart();
}

function render(){
  const b=document.getElementById('cartBody');
  const t=cart.reduce((s,i)=>s+i.p*i.q,0);
  document.getElementById('cartTotal').textContent=t;
  navCart.textContent='Cart · '+cart.reduce((s,i)=>s+i.q,0);
  if(!cart.length){b.innerHTML='<div class="cart-empty">Your reserve is empty</div>';return;}
  b.innerHTML=cart.map((i,x)=>`<div class="cart-line"><div><h3>${i.n}</h3><div class="q">Quantity · ${i.q}</div></div>
    <div class="right"><div class="price">£${i.p*i.q}</div><button onclick="rm(${x})">Remove</button></div></div>`).join('');
}

function rm(x){cart.splice(x,1);save();render();}
function openCart(){document.getElementById('cartOverlay').classList.add('open');document.getElementById('cartPanel').classList.add('open');}
function closeCart(){document.getElementById('cartOverlay').classList.remove('open');document.getElementById('cartPanel').classList.remove('open');}
function checkout(){if(!cart.length){return;}alert('Proceeding to secure checkout · connect Stripe or Shopify');}

navCart.addEventListener('click',openCart);
render();
