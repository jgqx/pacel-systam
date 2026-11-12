// ============================================================
//  Parcel Tracker - admin.js
//  Admin login, admin API and admin panel page
//  Mounted from index.js:  require('./admin')(app, { Parcel, STATUSES })
// ============================================================
const crypto = require('crypto');

module.exports = function mountAdmin(app, { Parcel, STATUSES }) {
  const SECRET = () => process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || '';

  // ---------- tiny signed-token helpers (no extra packages) ----------
  function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
    return body + '.' + sig;
  }
  function verify(token) {
    if (!token || !SECRET()) return false;
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return false;
    const expect = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now();
    } catch (e) {
      return false;
    }
  }
  function auth(req, res, next) {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    if (!verify(t)) return res.status(401).json({ error: 'Unauthorized. Please log in again.' });
    next();
  }

  // ---------- Login ----------
  app.post('/api/admin/login', (req, res) => {
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw) return res.status(500).json({ error: 'ADMIN_PASSWORD is not set on the server.' });
    const given = Buffer.from(String((req.body && req.body.password) || ''));
    const real = Buffer.from(pw);
    const ok = given.length === real.length && crypto.timingSafeEqual(given, real);
    if (!ok) return res.status(401).json({ error: 'Wrong password.' });
    res.json({ token: sign({ exp: Date.now() + 8 * 60 * 60 * 1000 }) });
  });

  // ---------- List parcels ----------
  app.get('/api/admin/parcels', auth, async (req, res) => {
    const list = await Parcel.find().sort({ updatedAt: -1 }).limit(300).lean();
    res.json({ statuses: STATUSES, parcels: list });
  });

  // ---------- Create parcel ----------
  app.post('/api/admin/parcels', auth, async (req, res) => {
    try {
      const b = req.body || {};
      const orderNo = String(b.orderNo || '').trim().toUpperCase();
      const customerName = String(b.customerName || '').trim();
      if (!orderNo || !customerName) return res.status(400).json({ error: 'Order number and customer name are required.' });
      const status = STATUSES.includes(b.status) ? b.status : STATUSES[0];
      const p = await Parcel.create({
        orderNo,
        customerName,
        destination: String(b.destination || '').trim(),
        status,
        history: [{ status, location: String(b.location || '').trim(), note: 'Order received' }],
      });
      res.json({ ok: true, parcel: p });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ error: 'This order number already exists.' });
      res.status(500).json({ error: 'Could not create parcel.' });
    }
  });

  // ---------- Update status ----------
  app.put('/api/admin/parcels/:id', auth, async (req, res) => {
    try {
      const b = req.body || {};
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Invalid status.' });
      const p = await Parcel.findById(req.params.id);
      if (!p) return res.status(404).json({ error: 'Parcel not found.' });
      p.status = b.status;
      p.history.push({
        status: b.status,
        location: String(b.location || '').trim(),
        note: String(b.note || '').trim(),
      });
      await p.save();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Could not update parcel.' });
    }
  });

  // ---------- Delete parcel ----------
  app.delete('/api/admin/parcels/:id', auth, async (req, res) => {
    try {
      await Parcel.findByIdAndDelete(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Could not delete parcel.' });
    }
  });

  // ---------- Admin page ----------
  app.get('/admin', (req, res) => res.type('html').send(ADMIN_HTML));
};

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ParcelPal Admin</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Roboto,Arial,sans-serif;min-height:100vh;color:#2d2d3a;
    background:linear-gradient(135deg,#0f2027,#203a43 50%,#2c5364);background-attachment:fixed;padding:20px 14px}
  .wrap{max-width:980px;margin:0 auto}
  h1{color:#fff;text-align:center;margin:10px 0 20px}
  .card{background:#fff;border-radius:18px;padding:22px;box-shadow:0 15px 40px rgba(0,0,0,.3);margin-bottom:20px}
  h2{margin-bottom:14px;color:#6a11cb}
  .row{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
  input,select{padding:12px 14px;border:2px solid #e3e3f0;border-radius:12px;font-size:.95rem;outline:none;width:100%}
  input:focus,select:focus{border-color:#2575fc}
  button{padding:12px 20px;border:0;border-radius:12px;color:#fff;font-weight:700;cursor:pointer;font-size:.95rem;
    background:linear-gradient(90deg,#11998e,#38ef7d);transition:.2s}
  button:hover{transform:translateY(-2px)}
  .red{background:linear-gradient(90deg,#ff416c,#ff4b2b)}
  .blue{background:linear-gradient(90deg,#2575fc,#6a11cb)}
  #err{background:#ffe5ea;color:#b3123a;padding:10px 14px;border-radius:10px;margin-bottom:12px;display:none;font-weight:600}
  #ok{background:#dcfce7;color:#116b3a;padding:10px 14px;border-radius:10px;margin-bottom:12px;display:none;font-weight:600}
  .p{border:2px solid #eee;border-radius:14px;padding:14px;margin-bottom:12px}
  .p .head{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:10px}
  .p b{color:#dd2476;font-size:1.05rem}
  .tag{padding:4px 12px;border-radius:20px;background:linear-gradient(90deg,#f7971e,#ffd200);font-weight:700;font-size:.8rem}
  .sub{color:#777;font-size:.88rem;margin-bottom:10px}
  .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  #app{display:none}
  .login{max-width:380px;margin:60px auto}
  .top{display:flex;justify-content:flex-end;margin-bottom:10px}
  a.home{color:#fff;margin-right:auto;align-self:center}
</style>
</head>
<body>
<div class="wrap">
  <h1>🔐 ParcelPal Admin</h1>

  <div class="card login" id="login">
    <h2>Admin Login</h2>
    <div id="lerr" style="color:#b3123a;font-weight:600;margin-bottom:10px;display:none"></div>
    <input type="password" id="pw" placeholder="Admin password" style="margin-bottom:12px">
    <button class="blue" id="lbtn" style="width:100%">Login</button>
  </div>

  <div id="app">
    <div class="top"><a class="home" href="/">← Back to website</a><button class="red" id="logout">Logout</button></div>
    <div id="err"></div><div id="ok"></div>

    <div class="card">
      <h2>➕ Add New Parcel</h2>
      <div class="row">
        <input id="n_order" placeholder="Order No (e.g. ORD1001)">
        <input id="n_name" placeholder="Customer name">
        <input id="n_dest" placeholder="Destination city">
        <input id="n_loc" placeholder="Current location">
        <select id="n_status"></select>
      </div>
      <div class="acts"><button id="add">Add Parcel</button></div>
    </div>

    <div class="card">
      <h2>📋 All Parcels</h2>
      <input id="search" placeholder="Search by order no or name..." style="margin-bottom:14px">
      <div id="list"></div>
    </div>
  </div>
</div>

<script>
var token=null,STATUSES=[],ALL=[];
try{token=sessionStorage.getItem('pp_token')}catch(e){}
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function flash(id,t){var e=$(id);e.textContent=t;e.style.display='block';setTimeout(function(){e.style.display='none'},3500)}
async function api(url,method,body){
  var r=await fetch(url,{method:method||'GET',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:body?JSON.stringify(body):undefined});
  var d=await r.json().catch(function(){return {}});
  if(r.status===401){logout();throw new Error(d.error||'Session expired')}
  if(!r.ok)throw new Error(d.error||'Error');
  return d;
}
function logout(){token=null;try{sessionStorage.removeItem('pp_token')}catch(e){}$('app').style.display='none';$('login').style.display='block'}
async function login(){
  $('lerr').style.display='none';
  var r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('pw').value})});
  var d=await r.json();
  if(!r.ok){$('lerr').textContent=d.error||'Login failed';$('lerr').style.display='block';return}
  token=d.token;try{sessionStorage.setItem('pp_token',token)}catch(e){}
  $('pw').value='';start();
}
async function start(){
  try{
    var d=await api('/api/admin/parcels');
    STATUSES=d.statuses;ALL=d.parcels;
    $('login').style.display='none';$('app').style.display='block';
    $('n_status').innerHTML=STATUSES.map(function(s){return '<option>'+esc(s)+'</option>'}).join('');
    render();
  }catch(e){}
}
function render(){
  var q=$('search').value.trim().toLowerCase();
  var list=ALL.filter(function(p){return !q||p.orderNo.toLowerCase().indexOf(q)>-1||p.customerName.toLowerCase().indexOf(q)>-1});
  $('list').innerHTML=list.map(function(p){
    var opts=STATUSES.map(function(s){return '<option'+(s===p.status?' selected':'')+'>'+esc(s)+'</option>'}).join('');
    return '<div class="p" data-id="'+esc(p._id)+'">'+
      '<div class="head"><b>#'+esc(p.orderNo)+'</b><span class="tag">'+esc(p.status)+'</span></div>'+
      '<div class="sub">👤 '+esc(p.customerName)+(p.destination?' · 📍 '+esc(p.destination):'')+'</div>'+
      '<div class="row"><select class="u_status">'+opts+'</select>'+
      '<input class="u_loc" placeholder="Location"><input class="u_note" placeholder="Note (optional)"></div>'+
      '<div class="acts"><button class="blue upd">Update Status</button><button class="red del">Delete</button></div></div>';
  }).join('')||'<p style="color:#888">No parcels found.</p>';
}
$('lbtn').onclick=login;
$('pw').addEventListener('keydown',function(e){if(e.key==='Enter')login()});
$('logout').onclick=logout;
$('search').oninput=render;
$('add').onclick=async function(){
  try{
    await api('/api/admin/parcels','POST',{orderNo:$('n_order').value,customerName:$('n_name').value,destination:$('n_dest').value,location:$('n_loc').value,status:$('n_status').value});
    ['n_order','n_name','n_dest','n_loc'].forEach(function(i){$(i).value=''});
    flash('ok','Parcel added ✔');start();
  }catch(e){flash('err',e.message)}
};
$('list').addEventListener('click',async function(e){
  var card=e.target.closest('.p');if(!card)return;var id=card.getAttribute('data-id');
  try{
    if(e.target.classList.contains('upd')){
      await api('/api/admin/parcels/'+id,'PUT',{status:card.querySelector('.u_status').value,location:card.querySelector('.u_loc').value,note:card.querySelector('.u_note').value});
      flash('ok','Status updated ✔');start();
    }else if(e.target.classList.contains('del')){
      if(!confirm('Delete this parcel?'))return;
      await api('/api/admin/parcels/'+id,'DELETE');flash('ok','Parcel deleted');start();
    }
  }catch(err){flash('err',err.message)}
});
if(token)start();
</script>
</body>
</html>`;
