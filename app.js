/* ---------- storage ---------- */
const KEY='tipsy:v1';
let mem=null;
async function load(){
  try{ const r=await window.storage.get(KEY); mem=r?JSON.parse(r.value):{entries:[]}; }
  catch(e){ mem=mem||{entries:[]}; }
  if(!mem.entries) mem.entries=[];
}
async function save(){
  try{ await window.storage.set(KEY, JSON.stringify(mem)); }
  catch(e){ /* keeps working in memory for this session */ }
}
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- beer color by SRM ---------- */
const SRM=['#F8E08A','#F6D257','#EFC133','#E8A81C','#DE9110','#D07A0B','#BE6408','#A85207','#8F4106','#763306','#5E2705','#4A1D04','#361503','#241002','#170A02'];
function srmColor(v){ const i=Math.max(0,Math.min(14,Math.round((Number(v)||8)/2.8))); return SRM[i]; }

/* ---------- cap svg ---------- */
function capSVG(fill,stroke,pct){
  const id='c'+Math.random().toString(36).slice(2,7);
  const clip = pct>=1?'':`<clipPath id="${id}"><rect x="0" y="0" width="${12*pct*2}" height="24"/></clipPath>`;
  const inner = `<circle cx="12" cy="12" r="9.6" fill="${fill}"/><circle cx="12" cy="12" r="9.6" fill="none" stroke="${stroke}" stroke-width="3.4" stroke-dasharray="2.2 2.1"/><circle cx="12" cy="12" r="4.6" fill="none" stroke="${stroke}" stroke-width="1.3" opacity=".65"/>`;
  return `<svg class="cap" viewBox="0 0 24 24">${clip}
    <circle cx="12" cy="12" r="9.6" fill="rgba(246,239,225,.10)"/>
    <circle cx="12" cy="12" r="9.6" fill="none" stroke="rgba(246,239,225,.22)" stroke-width="3.4" stroke-dasharray="2.2 2.1"/>
    <g ${pct>=1?'':`clip-path="url(#${id})"`}>${pct>0?inner:''}</g></svg>`;
}

/* ---------- state for the draft ---------- */
let draft=null;

/* ---------- image -> base64 (resized) ---------- */
function readResized(file){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onerror=()=>rej(new Error('read'));
    fr.onload=()=>{
      const img=new Image();
      img.onerror=()=>rej(new Error('img'));
      img.onload=()=>{
        const max=1000, s=Math.min(1,max/Math.max(img.width,img.height));
        const c=document.createElement('canvas');
        c.width=Math.round(img.width*s); c.height=Math.round(img.height*s);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        const url=c.toDataURL('image/jpeg',0.82);
        res({url,b64:url.split(',')[1]});
      };
      img.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ---------- Claude identification ---------- */
const IDENT_PROMPT=`אתה מזהה בירות מתמונה. הסתכל על התווית, הצבע, הכוס והמותג.
החזר JSON בלבד, בלי טקסט לפני או אחרי, בלי סימני קוד. מבנה:
{"name":"שם הבירה","brewery":"שם המבשלה","style":"סגנון בעברית","family":"אחד מ: ipa|pale_ale|lager|stout|porter|wheat|sour|belgian|cider|other","abv":5.2,"country":"ארץ בעברית","srm":8,"desc":"משפט אחד בעברית על הטעם","confidence":"high|medium|low"}
srm הוא בהירות הבירה בסולם 1 (בהיר מאוד) עד 40 (שחור).
אם אינך בטוח בשם — נחש את הסביר ביותר וסמן confidence נמוך. אל תחזיר שדות ריקים.`;

async function callClaude(messages){
  const h={"Content-Type":"application/json"};
  if(mem.key){ h["x-api-key"]=mem.key; h["anthropic-version"]="2023-06-01"; h["anthropic-dangerous-direct-browser-access"]="true"; }
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST", headers:h,
    body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages})
  });
  if(!r.ok) throw new Error('api '+r.status);
  const d=await r.json();
  const txt=(d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
  return JSON.parse(txt.replace(/```json|```/g,'').trim());
}

async function identify(b64){
  return callClaude([{role:"user",content:[
    {type:"image",source:{type:"base64",media_type:"image/jpeg",data:b64}},
    {type:"text",text:IDENT_PROMPT}
  ]}]);
}

/* ---------- add flow ---------- */
function showForm(url){
  $('#stage-shoot').classList.add('hidden');
  $('#stage-form').classList.remove('hidden');
  if(url){ $('#prev-img').src=url; $('#prev-box').classList.remove('hidden'); }
  else { $('#prev-box').classList.add('hidden'); }
}
function resetAdd(){
  draft=null;
  $('#stage-form').classList.add('hidden');
  $('#stage-shoot').classList.remove('hidden');
  $('#ai-err').innerHTML='';
  $('#edit-fields').classList.add('hidden');
  $('#f-note').value=''; $('#f-place').value='';
  document.querySelectorAll('#serve-chips .chip').forEach((c,i)=>c.classList.toggle('on',i===0));
  drawRate(0);
}
function paintIdent(){
  const d=draft.beer;
  $('#id-name').textContent=d.name||'בירה ללא שם';
  $('#id-brew').textContent=d.brewery||'מבשלה לא ידועה';
  const bits=[d.style,d.abv?d.abv+'%':null,d.country].filter(Boolean);
  $('#id-meta').textContent=bits.join(' · ');
  $('#id-desc').textContent=d.desc||'';
  $('#pint-fill').style.background=srmColor(d.srm);
  $('#f-name').value=d.name||''; $('#f-brew').value=d.brewery||'';
  $('#f-style').value=d.style||''; $('#f-abv').value=d.abv||'';
  $('#f-country').value=d.country||''; $('#f-fam').value=d.family||'other';
  if(d.confidence==='low'){
    $('#ai-err').innerHTML='<div class="err">לא הצלחתי לזהות בוודאות. בדוק את הפרטים לפני שמירה.</div>';
  }
}
async function handleFile(file){
  if(!file) return;
  let img;
  try{ img=await readResized(file); }
  catch(e){ alert('לא הצלחתי לקרוא את התמונה. נסה תמונה אחרת.'); return; }
  draft={photo:img.url,beer:{name:'',brewery:'',style:'',family:'other',abv:'',country:'',srm:8,desc:''}};
  showForm(img.url);
  paintIdent();
  $('#thinking').classList.remove('hidden');
  try{
    const b=await identify(img.b64);
    draft.beer=Object.assign(draft.beer,b);
    paintIdent();
  }catch(e){
    $('#ai-err').innerHTML='<div class="err">הזיהוי נכשל. מלא את הפרטים ידנית ושמור — התמונה נשמרת בכל מקרה.</div>';
    $('#edit-fields').classList.remove('hidden');
  }finally{
    $('#thinking').classList.add('hidden');
  }
}

/* rating */
let rating=0;
function drawRate(v){
  rating=v;
  $('#rate-num').textContent=v?v.toFixed(2).replace(/\.?0+$/,''):'—';
  const box=$('#rate-caps'); box.innerHTML='';
  for(let i=1;i<=5;i++){
    const pct=Math.max(0,Math.min(1,v-(i-1)));
    const b=document.createElement('button');
    b.setAttribute('aria-label','דרג '+i);
    b.innerHTML=capSVG('#E39B34','#B4521F',pct);
    b.onclick=(ev)=>{
      const r=b.getBoundingClientRect();
      const half=(ev.clientX-r.left)<r.width/2; /* ltr row: left half = .5 */
      drawRate(i-(half?0.5:0));
    };
    box.appendChild(b);
  }
}

/* ---------- badges ---------- */
const BADGES=[
  {id:'first', name:'פקק ראשון', hint:'רשום בירה אחת', test:e=>e.length>=1},
  {id:'five', name:'חמישייה', hint:'5 בירות', test:e=>e.length>=5},
  {id:'ten', name:'מניין', hint:'10 בירות', test:e=>e.length>=10},
  {id:'explorer', name:'סקרן', hint:'5 משפחות סגנון', test:e=>new Set(e.map(x=>x.beer.family)).size>=5},
  {id:'hops', name:'ראש כשות', hint:'3 בירות IPA', test:e=>e.filter(x=>x.beer.family==='ipa').length>=3},
  {id:'dark', name:'צד אפל', hint:'3 סטאוט או פורטר', test:e=>e.filter(x=>['stout','porter'].includes(x.beer.family)).length>=3},
  {id:'sour', name:'חמצמץ', hint:'בירה חמוצה אחת', test:e=>e.some(x=>x.beer.family==='sour')},
  {id:'strong', name:'כבד', hint:'בירה מעל 8%', test:e=>e.some(x=>Number(x.beer.abv)>=8)},
  {id:'world', name:'דרכון', hint:'4 ארצות שונות', test:e=>new Set(e.map(x=>(x.beer.country||'').trim()).filter(Boolean)).size>=4},
  {id:'local', name:'תוצרת הארץ', hint:'3 בירות ישראליות', test:e=>e.filter(x=>/ישראל/.test(x.beer.country||'')).length>=3},
  {id:'critic', name:'מבקר', hint:'5 רשומות עם תיאור טעם', test:e=>e.filter(x=>(x.note||'').trim().length>3).length>=5},
  {id:'draft', name:'איש החבית', hint:'5 בירות מהחבית', test:e=>e.filter(x=>x.serve==='חבית').length>=5},
];
function renderWall(){
  const e=mem.entries;
  $('#wall').innerHTML=BADGES.map(b=>{
    const got=b.test(e);
    return `<div class="badge ${got?'':'locked'}">
      <div class="disc">${capSVG(got?'#E39B34':'#5A4437', got?'#B4521F':'#3A2820',1)}</div>
      <p>${esc(b.name)}</p><small>${esc(b.hint)}</small></div>`;
  }).join('');
}

/* ---------- shelf ---------- */
function renderShelf(){
  const e=[...mem.entries].sort((a,b)=>b.at-a.at);
  $('#shelf-sub').textContent=e.length?`${e.length} רשומות · ${new Set(e.map(x=>x.beer.name)).size} בירות שונות`:'';
  if(!e.length){
    $('#shelf-list').innerHTML=`<div class="empty">
      <svg viewBox="0 0 40 52" fill="none"><path d="M11 4h18v9l5 8v27a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V21l5-8V4Z" stroke="#A08A79" stroke-width="2"/></svg>
      <h2>המדף ריק</h2><p>הבירה הראשונה שתצלם תפתח לך את הפקק הראשון.</p></div>`;
    return;
  }
  $('#shelf-list').innerHTML=`<div class="card">`+e.map(x=>`
    <div class="entry">
      ${x.photo?`<img class="thumb" src="${x.photo}" alt="">`:`<div class="thumb" style="background:${srmColor(x.beer.srm)}"></div>`}
      <div style="flex:1;min-width:0">
        <h3>${esc(x.beer.name||'בירה')}</h3>
        <div class="brew">${esc(x.beer.brewery||'')}</div>
        <div class="score">${capSVG('#E39B34','#B4521F',1)}<span>${x.rating?x.rating:'—'}</span>
          <span style="font-family:Heebo;font-weight:300;font-size:13px;color:var(--dim)">${esc(x.beer.style||'')}</span></div>
        ${x.note?`<div class="note">${esc(x.note)}</div>`:''}
        <div class="foot">${esc(x.serve)}${x.place?' · '+esc(x.place):''} · ${new Date(x.at).toLocaleDateString('he-IL')}</div>
        <button class="del" data-del="${x.id}">מחק</button>
      </div>
    </div>`).join('')+`</div>`;
  $('#shelf-list').querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    mem.entries=mem.entries.filter(x=>x.id!==b.dataset.del);
    await save(); renderAll(); toast('נמחק');
  });
}

/* ---------- me ---------- */
const FAM_HE={ipa:'IPA',pale_ale:'פייל אייל',lager:'לאגר',stout:'סטאוט',porter:'פורטר',wheat:'חיטה',sour:'חמוצה',belgian:'בלגית',cider:'סיידר',other:'אחר'};
function renderMe(){
  const e=mem.entries;
  const rated=e.filter(x=>x.rating);
  const avg=rated.length?(rated.reduce((s,x)=>s+x.rating,0)/rated.length):0;
  $('#stats').innerHTML=`
    <div><b>${e.length}</b><span>רשומות</span></div>
    <div><b>${new Set(e.map(x=>x.beer.name)).size}</b><span>בירות שונות</span></div>
    <div><b>${avg?avg.toFixed(2):'—'}</b><span>ציון ממוצע</span></div>`;
  const counts={};
  e.forEach(x=>{const f=x.beer.family||'other';counts[f]=(counts[f]||0)+1;});
  const arr=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  $('#styles-bars').innerHTML = arr.length? arr.map(([f,n])=>`
    <div class="bar"><div class="lab"><span>${FAM_HE[f]||f}</span><span>${n}</span></div>
    <div class="track"><div class="fill" style="width:${Math.round(n/e.length*100)}%"></div></div></div>`).join('')
    : '<p class="sub">עוד לא רשמת בירות.</p>';
}

/* ---------- taste profile ---------- */
$('#btn-taste').onclick=async()=>{
  const e=mem.entries;
  if(e.length<3){ toast('צריך לפחות 3 בירות'); return; }
  const btn=$('#btn-taste'); btn.disabled=true; btn.textContent='חושב…';
  const list=e.map(x=>`${x.beer.name} (${x.beer.style}, ${x.beer.abv}%) — ציון ${x.rating||'ללא'}${x.note?', "'+x.note+'"':''}`).join('\n');
  try{
    const p=await callClaude([{role:"user",content:
`אלה הבירות שאדם רשם ביומן, עם הציונים שנתן:\n${list}\n
נתח מה הוא אוהב והמלץ. החזר JSON בלבד, בלי טקסט נוסף ובלי סימני קוד:
{"summary":"שתי שורות בעברית על פרופיל הטעם שלו","recs":[{"name":"סגנון או בירה","why":"משפט קצר בעברית למה זה יתאים לו"}]}
שלוש המלצות ב-recs.`}]);
    $('#taste-out').innerHTML=`<p style="margin:10px 0 4px">${esc(p.summary)}</p>`+
      (p.recs||[]).map(x=>`<div style="border-top:1px solid var(--line);padding-top:9px;margin-top:9px">
        <b style="color:var(--amber)">${esc(x.name)}</b><div class="sub">${esc(x.why)}</div></div>`).join('');
  }catch(err){
    $('#taste-out').innerHTML='<div class="err">הניתוח נכשל. נסה שוב בעוד רגע.</div>';
  }
  btn.disabled=false; btn.textContent='נתח את הטעם שלי';
};

/* ---------- misc ui ---------- */
function toast(m){
  const t=document.createElement('div'); t.className='toast'; t.textContent=m;
  document.body.appendChild(t); setTimeout(()=>t.remove(),2200);
}
function renderAll(){ renderShelf(); renderWall(); renderMe(); }
function go(v){
  document.querySelectorAll('.view').forEach(s=>s.classList.toggle('on',s.id==='view-'+v));
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  window.scrollTo(0,0);
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>go(b.dataset.v));

$('#in-cam').onchange=e=>{handleFile(e.target.files[0]); e.target.value='';};
$('#in-gal').onchange=e=>{handleFile(e.target.files[0]); e.target.value='';};

/* in-page camera (works where the host app blocks the file chooser) */
let stream=null;
$('#btn-live').onclick=async()=>{
  $('#cam-modal').classList.remove('hidden');
  $('#cam-err').innerHTML='';
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    $('#cam-video').srcObject=stream;
  }catch(err){
    $('#cam-err').innerHTML='<div class="err">אין גישה למצלמה מכאן. הורד את הקובץ ופתח אותו ב-Chrome — שם זה עובד.</div>';
  }
};
function closeCam(){
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
  $('#cam-video').srcObject=null;
  $('#cam-modal').classList.add('hidden');
}
$('#cam-close').onclick=closeCam;
$('#cam-snap').onclick=async()=>{
  const v=$('#cam-video');
  if(!v.videoWidth){ toast('המצלמה עוד לא מוכנה'); return; }
  const max=1000, s=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight));
  const c=document.createElement('canvas');
  c.width=Math.round(v.videoWidth*s); c.height=Math.round(v.videoHeight*s);
  c.getContext('2d').drawImage(v,0,0,c.width,c.height);
  const url=c.toDataURL('image/jpeg',0.82);
  closeCam();
  draft={photo:url,beer:{name:'',brewery:'',style:'',family:'other',abv:'',country:'',srm:8,desc:''}};
  showForm(url); paintIdent();
  $('#thinking').classList.remove('hidden');
  try{
    draft.beer=Object.assign(draft.beer,await identify(url.split(',')[1]));
    paintIdent();
  }catch(err){
    $('#ai-err').innerHTML='<div class="err">הזיהוי נכשל. מלא ידנית ושמור — התמונה נשמרת בכל מקרה.</div>';
    $('#edit-fields').classList.remove('hidden');
  }finally{ $('#thinking').classList.add('hidden'); }
};

/* API key for standalone use */
$('#btn-gear').onclick=()=>{ $('#f-key').value=mem.key||''; $('#set-modal').classList.remove('hidden'); };
$('#set-close').onclick=()=>$('#set-modal').classList.add('hidden');
$('#set-save').onclick=async()=>{
  mem.key=$('#f-key').value.trim(); await save();
  $('#set-modal').classList.add('hidden'); toast(mem.key?'המפתח נשמר':'המפתח נמחק');
};
$('#btn-manual').onclick=()=>{
  draft={photo:null,beer:{name:'',brewery:'',style:'',family:'other',abv:'',country:'',srm:8,desc:''}};
  showForm(null); paintIdent(); $('#edit-fields').classList.remove('hidden');
};
$('#btn-edit').onclick=()=>$('#edit-fields').classList.toggle('hidden');
$('#btn-cancel').onclick=resetAdd;
document.querySelectorAll('#serve-chips .chip').forEach(c=>c.onclick=()=>{
  document.querySelectorAll('#serve-chips .chip').forEach(x=>x.classList.remove('on'));
  c.classList.add('on');
});
['f-name','f-brew','f-style','f-abv','f-country','f-fam'].forEach(id=>{
  $('#'+id).addEventListener('input',()=>{
    draft.beer.name=$('#f-name').value; draft.beer.brewery=$('#f-brew').value;
    draft.beer.style=$('#f-style').value; draft.beer.abv=$('#f-abv').value;
    draft.beer.country=$('#f-country').value; draft.beer.family=$('#f-fam').value;
    $('#id-name').textContent=draft.beer.name||'בירה ללא שם';
    $('#id-brew').textContent=draft.beer.brewery||'מבשלה לא ידועה';
    $('#id-meta').textContent=[draft.beer.style,draft.beer.abv?draft.beer.abv+'%':null,draft.beer.country].filter(Boolean).join(' · ');
  });
});

$('#btn-save').onclick=async()=>{
  if(!draft) return;
  if(!draft.beer.name.trim()){ toast('צריך שם לבירה'); $('#edit-fields').classList.remove('hidden'); $('#f-name').focus(); return; }
  const before=BADGES.filter(b=>b.test(mem.entries)).map(b=>b.id);
  mem.entries.push({
    id:Date.now().toString(36),
    at:Date.now(),
    photo:draft.photo,
    beer:draft.beer,
    rating:rating||null,
    serve:document.querySelector('#serve-chips .chip.on').dataset.s,
    place:$('#f-place').value.trim(),
    note:$('#f-note').value.trim()
  });
  await save();
  const gained=BADGES.filter(b=>b.test(mem.entries)&&!before.includes(b.id));
  renderAll(); resetAdd(); go('shelf');
  toast(gained.length?`פקק חדש: ${gained[0].name}`:'נשמר על המדף');
};

$('#btn-export').onclick=()=>{
  const blob=new Blob([JSON.stringify(mem.entries.map(({photo,...r})=>r),null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='tipsy-beers.json'; a.click();
};
$('#btn-clear').onclick=async()=>{
  if(!confirm('למחוק את כל הרשומות? אין דרך חזרה.')) return;
  mem.entries=[]; await save(); renderAll(); toast('המדף רוקן');
};

/* ---------- boot ---------- */
(async()=>{
  await load();
  drawRate(0);
  renderAll();
  if(mem.entries.length) $('#tagline').textContent=`${mem.entries.length} בירות על המדף. מה שותים עכשיו?`;
  const embedded = window.self!==window.top;
  $('#shoot-hint').innerHTML = embedded
    ? 'אם שני הכפתורים העליונים לא מגיבים — זו מגבלה של האפליקציה, לא של הקוד. נסה "צלם בתוך האפליקציה", או הורד את הקובץ ופתח ב-Chrome.'
    : (mem.key ? '' : 'פתחת את הקובץ ישירות בדפדפן. כדי שהזיהוי האוטומטי יעבוד, הזן מפתח API בכפתור שלמעלה.');
})();