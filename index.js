// ============================================================
//  Parcel Tracker - index.js
//  Public website + public tracking API + MongoDB connection
//  Admin panel lives in admin.js (mounted below)
// ============================================================
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json({ limit: '50kb' }));

// ---------- Settings ----------
const STATUSES = ['Order Placed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];

// ---------- MongoDB (cached for Vercel serverless) ----------
let cached = global._parcelMongo;
if (!cached) cached = global._parcelMongo = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, { bufferCommands: false, serverSelectionTimeoutMS: 8000 })
      .then((m) => m);
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  return cached.conn;
}

// ---------- Model ----------
const parcelSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true, unique: true, uppercase: true, trim: true },
    customerName: { type: String, required: true, trim: true },
    destination: { type: String, default: '', trim: true },
    status: { type: String, enum: STATUSES, default: STATUSES[0] },
    history: [
      {
        status: String,
        location: { type: String, default: '' },
        note: { type: String, default: '' },
        date: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);
const Parcel = mongoose.models.Parcel || mongoose.model('Parcel', parcelSchema);

// ---------- Connect DB before any /api request ----------
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (e) {
    console.error('DB error:', e.message);
    res.status(500).json({ error: 'Database connection failed. Please try again later.' });
  }
});

// ---------- Public tracking API ----------
app.get('/api/track/:orderNo', async (req, res) => {
  try {
    const orderNo = String(req.params.orderNo || '').trim().toUpperCase();
    if (!orderNo || orderNo.length > 40) return res.status(400).json({ error: 'Please enter a valid order number.' });
    const p = await Parcel.findOne({ orderNo }).lean();
    if (!p) return res.status(404).json({ error: 'No parcel found for this order number.' });
    const name = p.customerName || '';
    res.json({
      orderNo: p.orderNo,
      customer: name ? name.charAt(0) + '*'.repeat(Math.max(name.length - 1, 2)) : '',
      destination: p.destination,
      status: p.status,
      steps: STATUSES,
      history: (p.history || []).slice().reverse(),
      updatedAt: p.updatedAt,
    });
  } catch (e) {
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// ---------- Admin panel + admin API ----------
require('./admin')(app, { Parcel, STATUSES });

// ---------- Home page ----------
const HOME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ParcelPal - Track Your Parcel</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Roboto,Arial,sans-serif;min-height:100vh;color:#fff;
    background:linear-gradient(135deg,#6a11cb,#2575fc 45%,#ff6a88 100%);background-attachment:fixed;
    display:flex;flex-direction:column;align-items:center;padding:24px 16px}
  .blob{position:fixed;border-radius:50%;filter:blur(60px);opacity:.35;z-index:0;animation:float 9s ease-in-out infinite}
  .b1{width:260px;height:260px;background:#ffd200;top:-60px;left:-60px}
  .b2{width:300px;height:300px;background:#00f2fe;bottom:-80px;right:-80px;animation-delay:2s}
  @keyframes float{50%{transform:translateY(30px)}}
  header,main,footer{position:relative;z-index:1;width:100%;max-width:640px}
  header{text-align:center;margin:30px 0 22px}
  .logo{font-size:56px;display:inline-block;animation:bounce 2s infinite}
  @keyframes bounce{50%{transform:translateY(-8px)}}
  h1{font-size:2.3rem;margin-top:6px;letter-spacing:1px}
  header p{opacity:.9;margin-top:6px}
  .card{background:rgba(255,255,255,.96);color:#2d2d3a;border-radius:22px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.25)}
  form{display:flex;gap:10px;flex-wrap:wrap}
  input{flex:1;min-width:180px;padding:15px 18px;font-size:1rem;border:2px solid #e3e3f0;border-radius:14px;outline:none;text-transform:uppercase}
  input:focus{border-color:#6a11cb}
  button{padding:15px 26px;font-size:1rem;font-weight:700;color:#fff;border:0;border-radius:14px;cursor:pointer;
    background:linear-gradient(90deg,#ff512f,#dd2476);box-shadow:0 8px 18px rgba(221,36,118,.35);transition:.2s}
  button:hover{transform:translateY(-2px)}
  #msg{margin-top:16px;padding:12px 16px;border-radius:12px;background:#ffe5ea;color:#b3123a;display:none;font-weight:600}
  #result{display:none;margin-top:22px}
  .top{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center}
  .order{font-size:1.2rem;font-weight:800;color:#6a11cb}
  .badge{padding:6px 14px;border-radius:30px;font-weight:700;font-size:.85rem;color:#fff;background:linear-gradient(90deg,#11998e,#38ef7d)}
  .meta{margin-top:8px;color:#666;font-size:.95rem;line-height:1.6}
  .steps{display:flex;justify-content:space-between;margin:28px 0 10px;position:relative}
  .steps:before{content:'';position:absolute;top:19px;left:8%;right:8%;height:5px;background:#e6e6f2;border-radius:5px}
  .fill{position:absolute;top:19px;left:8%;height:5px;border-radius:5px;background:linear-gradient(90deg,#f7971e,#ff512f,#dd2476);transition:width .8s}
  .step{flex:1;text-align:center;position:relative;z-index:1;font-size:.72rem;color:#999;font-weight:600}
  .dot{width:42px;height:42px;margin:0 auto 8px;border-radius:50%;background:#e6e6f2;display:flex;align-items:center;justify-content:center;font-size:19px;transition:.4s}
  .step.done{color:#2d2d3a}
  .step.done .dot{background:linear-gradient(135deg,#f7971e,#dd2476);box-shadow:0 6px 14px rgba(221,36,118,.4)}
  .step.now .dot{animation:pulse 1.4s infinite}
  @keyframes pulse{50%{transform:scale(1.15)}}
  h3{margin:22px 0 10px;color:#2575fc}
  .tl{list-style:none;border-left:3px solid #d9d9ee;margin-left:8px}
  .tl li{padding:0 0 14px 18px;position:relative}
  .tl li:before{content:'';position:absolute;left:-9px;top:3px;width:15px;height:15px;border-radius:50%;background:#2575fc;border:3px solid #fff;box-shadow:0 0 0 2px #2575fc}
  .tl b{display:block}
  .tl small{color:#888}
  footer{text-align:center;margin:24px 0 10px;font-size:.85rem;opacity:.85}
  footer a{color:#fff}
  @media(max-width:480px){.step{font-size:.62rem}.dot{width:34px;height:34px;font-size:15px}.steps:before,.fill{top:15px}}
</style>
</head>
<body>
<div class="blob b1"></div><div class="blob b2"></div>
<header>
  <div class="logo">📦</div>
  <h1>ParcelPal</h1>
  <p>Enter your order number to see where your parcel is</p>
</header>
<main>
  <div class="card">
    <form id="f">
      <input id="q" placeholder="e.g. ORD1001" maxlength="40" autocomplete="off" required>
      <button type="submit">🔍 Track</button>
    </form>
    <div id="msg"></div>
    <div id="result">
      <div class="top"><span class="order" id="rOrder"></span><span class="badge" id="rStatus"></span></div>
      <div class="meta" id="rMeta"></div>
      <div class="steps" id="steps"><div class="fill" id="fill"></div></div>
      <h3>Tracking History</h3>
      <ul class="tl" id="tl"></ul>
    </div>
  </div>
</main>
<footer>Made with ❤️ · <a href="/admin">Admin</a></footer>
<script>
var ICONS=['📝','📦','🚚','🛵','🏠'];
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fmt(d){return new Date(d).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
var msg=document.getElementById('msg'),result=document.getElementById('result');
async function track(no){
  msg.style.display='none';result.style.display='none';
  try{
    var r=await fetch('/api/track/'+encodeURIComponent(no));
    var d=await r.json();
    if(!r.ok){msg.textContent=d.error||'Error';msg.style.display='block';return}
    document.getElementById('rOrder').textContent='#'+d.orderNo;
    document.getElementById('rStatus').textContent=d.status;
    document.getElementById('rMeta').innerHTML='👤 '+esc(d.customer)+(d.destination?'<br>📍 '+esc(d.destination):'')+'<br>🕒 Last update: '+fmt(d.updatedAt);
    var idx=d.steps.indexOf(d.status),h='<div class="fill" id="fill"></div>';
    d.steps.forEach(function(s,i){h+='<div class="step '+(i<=idx?'done ':'')+(i===idx?'now':'')+'"><div class="dot">'+ICONS[i]+'</div>'+esc(s)+'</div>'});
    var st=document.getElementById('steps');st.innerHTML=h;
    var pct=idx<=0?0:(idx/(d.steps.length-1))*84;
    setTimeout(function(){document.getElementById('fill').style.width=pct+'%'},50);
    document.getElementById('tl').innerHTML=d.history.map(function(x){
      return '<li><b>'+esc(x.status)+'</b>'+(x.note?esc(x.note)+'<br>':'')+'<small>'+(x.location?'📍 '+esc(x.location)+' · ':'')+fmt(x.date)+'</small></li>'}).join('')||'<li>No updates yet.</li>';
    result.style.display='block';
  }catch(e){msg.textContent='Network error. Please try again.';msg.style.display='block'}
}
document.getElementById('f').addEventListener('submit',function(e){
  e.preventDefault();var v=document.getElementById('q').value.trim();if(v)track(v);
});
var p=new URLSearchParams(location.search).get('order');
if(p){document.getElementById('q').value=p;track(p)}
</script>
</body>
</html>`;

app.get('/', (req, res) => res.type('html').send(HOME_HTML));

// ---------- Export for Vercel / run locally ----------
module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log('Parcel tracker running on http://localhost:' + port));
}
