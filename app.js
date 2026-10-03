/* Dealer Access – clustering, scoring, map and UI (vanilla JS) */
const REQ=['Dealer_ID','Dealer_Name','Region','Month','Sales_vs_Target_Percent','Sales_Growth_Percent','Inventory_Ageing_Percent','Payment_Delay_Days','Service_Performance_Percent','Customer_Complaints_Count','Local_Market_Potential'];
const F=['sales','growth','inv','delay','svc','comp','trend'];
const L={sales:'Sales vs target',growth:'Sales growth',inv:'Inventory ageing',delay:'Payment delay',svc:'Service score',comp:'Complaints',trend:'Sales momentum'};
const U={sales:'%',growth:'%',inv:'%',delay:' d',svc:'%',comp:'',trend:' pts'};
const SG={sales:1,growth:1,inv:-1,delay:-1,svc:1,comp:-1,trend:1};
const ACT={sales:'Agree a sales-recovery plan with the dealer principal; review target realism',growth:'Co-fund local demand generation and lead sharing',inv:'Rebalance stock: transfer or discount aged units, slow new allocations',delay:'Credit review: structured payment plan, tighten credit limit until cleared',svc:'Service audit and workshop/technician training',comp:'Root-cause review of complaints; customer-experience coaching',trend:'Early check-in call: sales momentum is slipping'};
const META=[['Healthy','#30a46c'],['Stable – watch','#0a84ff'],['Under pressure','#ff9f0a'],['Critical','#ff3b30']];
const RC=['#5e5ce6','#0a84ff','#30a46c','#ff9f0a','#bf5af2'];
const PF={High:1.25,Medium:1,Low:.85};
const isAct=d=>d.score>=55||d.cl==3;
const KPI=[['all','Dealers analysed',()=>1],['crit','Critical dealers',d=>d.cl==3],['act','Need action now',isAct],['emg','Emerging concerns',d=>d.emerging]];
let S=null,CH={},SEL=null,MODE='all',REG='',KF='all',GF='',MAPOK=false;
const $=id=>document.getElementById(id);
const mean=a=>a.reduce((x,y)=>x+y,0)/(a.length||1),sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)**2)))||1};
const d2=(a,b)=>a.reduce((s,v,i)=>s+(v-b[i])**2,0);
const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};

/* ---------- navigation ---------- */
function go(i){$('p0').classList.toggle('on',i==0);$('p1').classList.toggle('on',i==1);$('t0').classList.toggle('on',i==0);$('t1').classList.toggle('on',i==1);scrollTo(0,0);if(i==1&&S)render()}

/* ---------- data + model ---------- */
function parse(txt){const ls=txt.trim().split(/\r?\n/),h=ls[0].split(',').map(s=>s.trim());const miss=REQ.filter(c=>!h.includes(c));if(miss.length)throw Error('Missing columns: '+miss.join(', '));
return ls.slice(1).filter(Boolean).map(l=>{const v=l.split(','),o={};h.forEach((k,i)=>o[k]=v[i]?.trim());return o})}
function profile(rows){const m=new Map();rows.forEach(r=>{if(!m.has(r.Dealer_ID))m.set(r.Dealer_ID,{id:r.Dealer_ID,name:r.Dealer_Name,region:r.Region,pot:r.Local_Market_Potential,lat:+r.Latitude,lon:+r.Longitude,rows:[]});m.get(r.Dealer_ID).rows.push(r)});
return [...m.values()].map(d=>{d.geo=isFinite(d.lat)&&isFinite(d.lon)&&d.lat!==0;const rc=d.rows.slice(-6),pv=d.rows.slice(-12,-6),g=(a,k)=>mean(a.map(r=>+r[k]));
d.f={sales:g(rc,'Sales_vs_Target_Percent'),growth:g(rc,'Sales_Growth_Percent'),inv:g(rc,'Inventory_Ageing_Percent'),delay:g(rc,'Payment_Delay_Days'),svc:g(rc,'Service_Performance_Percent'),comp:g(rc,'Customer_Complaints_Count'),trend:pv.length?g(rc,'Sales_vs_Target_Percent')-g(pv,'Sales_vs_Target_Percent'):0};return d}).filter(d=>F.every(k=>isFinite(d.f[k])))}
const near=(x,C)=>{let b=0,bd=1e18;C.forEach((c,i)=>{const d=d2(x,c);if(d<bd){bd=d;b=i}});return b};
function kmeans(X,k,r){let C=[X[Math.floor(r()*X.length)]];while(C.length<k){const d=X.map(x=>Math.min(...C.map(c=>d2(x,c))));let t=r()*d.reduce((a,b)=>a+b,0),i=0;for(;i<d.length-1&&(t-=d[i])>0;i++);C.push(X[i])}
for(let it=0;it<100;it++){const N=C.map(()=>({s:Array(X[0].length).fill(0),n:0}));X.forEach(x=>{const c=near(x,C);N[c].n++;x.forEach((v,j)=>N[c].s[j]+=v)});const nc=N.map((o,c)=>o.n?o.s.map(v=>v/o.n):C[c]);const done=nc.every((c,i)=>d2(c,C[i])<1e-9);C=nc;if(done)break}
return{C,inertia:X.reduce((s,x)=>s+d2(x,C[near(x,C)]),0)}}
function sil(Z,lab,idx){return mean(idx.map(i=>{const s={},n={};Z.forEach((z,j)=>{if(j==i)return;const d=Math.sqrt(d2(Z[i],z));s[lab[j]]=(s[lab[j]]||0)+d;n[lab[j]]=(n[lab[j]]||0)+1});const a=(s[lab[i]]||0)/(n[lab[i]]||1);let b=1e18;for(const c in s)if(c!=lab[i])b=Math.min(b,s[c]/n[c]);return(b-a)/Math.max(a,b)}))}
function build(D){const mu={},sg={};F.forEach(k=>{const a=D.map(d=>d.f[k]);mu[k]=mean(a);sg[k]=sd(a)});
D.forEach(d=>d.z=F.map(k=>(d.f[k]-mu[k])/sg[k]));
const r=rng(42),ix=D.map((_,i)=>i).sort(()=>r()-.5),nt=Math.round(D.length*.8),tr=ix.slice(0,nt),te=ix.slice(nt);
let best=null;for(let s=0;s<10;s++){const m=kmeans(tr.map(i=>D[i].z),4,rng(s+1));if(!best||m.inertia<best.inertia)best=m}
const hl=best.C.map((c,i)=>[i,c.reduce((s,v,j)=>s+v*SG[F[j]],0)]).sort((a,b)=>b[1]-a[1]),rank={};hl.forEach(([i],p)=>rank[i]=p);
D.forEach(d=>d.cl=rank[near(d.z,best.C)]);
const lab=D.map(d=>d.cl),Z=D.map(d=>d.z);
D.forEach(d=>{const adv=d.z.map((v,j)=>[F[j],Math.max(0,-SG[F[j]]*v)]);d.raw=adv.reduce((s,a)=>s+a[1],0)*(PF[d.pot]||1);d.why=adv.filter(a=>a[1]>.6).sort((a,b)=>b[1]-a[1]).slice(0,3).map(a=>a[0]);d.emerging=d.cl<2&&d.z[6]<-1.2});
const mx=Math.max(...D.map(d=>d.raw))||1;D.forEach(d=>d.score=Math.round(d.raw/mx*100));
return{D,mu,sg,cen:hl.map(([i])=>best.C[i]),sil:{tr:sil(Z,lab,tr),te:sil(Z,lab,te)},nt:tr.length,ne:te.length}}
function load(txt,label){try{$('err').textContent='';const D=profile(parse(txt));if(D.length<12)throw Error('Need at least 12 dealers.');S=build(D);$('src').textContent=label+' · '+D.length+' dealers';SEL=null;KF='all';GF='';MAPOK=false;MODE='all';REG='';render()}catch(e){$('err').textContent=e.message}}
$('file').onchange=e=>{const f=e.target.files[0];if(f)f.text().then(t=>load(t,f.name))};
$('hl').innerHTML=REQ.map(c=>`<span class="chip mono">${c}</span>`).join('')+['Latitude','Longitude'].map(c=>`<span class="chip mono" style="color:var(--a)">${c} (optional, for map)</span>`).join('');

/* ---------- controls ---------- */
const view=()=>S.D.filter(d=>MODE=='all'||d.region==REG);
function setMode(m){MODE=m;KF='all';GF='';render()}
function setKF(k){KF=k;kpis();table();$('pl').scrollIntoView({behavior:'smooth',block:'start'})}
const fmt=(k,v)=>v.toFixed(1)+U[k];
const pill=c=>`<span class="pill" style="background:${META[c][1]}">${META[c][0]}</span>`;

/* ---------- render ---------- */
function render(){if(!$('p1').classList.contains('on'))return;
const regs=[...new Set(S.D.map(d=>d.region))].sort();if(MODE=='region'&&!REG)REG=regs[0];
$('rg').hidden=MODE!='region';$('rg').innerHTML=regs.map(r=>`<option ${r==REG?'selected':''}>${r}</option>`).join('');
$('m0').classList.toggle('on',MODE=='all');$('m1').classList.toggle('on',MODE=='region');$('back').hidden=MODE=='all';
const V=view();kpis();
Object.values(CH).forEach(c=>c&&c.destroy());Chart.defaults.font.family="'IBM Plex Sans'";Chart.defaults.color=getComputedStyle(document.body).getPropertyValue('--m').trim();
const O={maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:8,padding:16}}}};
CH.a=new Chart($('c1'),{type:'scatter',data:{datasets:META.map((m,i)=>({label:m[0],backgroundColor:m[1]+'cc',pointRadius:5,pointHoverRadius:8,data:V.filter(d=>d.cl==i).map(d=>({x:d.f.sales,y:d.f.inv,n:d.name}))}))},options:{...O,scales:{x:{title:{display:true,text:'Sales vs target %'}},y:{title:{display:true,text:'Inventory ageing %'}}},plugins:{...O.plugins,tooltip:{callbacks:{label:c=>c.raw.n}}}}});
CH.b=new Chart($('c2'),{type:'bar',data:{labels:F.map(k=>L[k]),datasets:META.map((m,i)=>({label:m[0],backgroundColor:m[1],borderRadius:4,data:S.cen[i].map(v=>+v.toFixed(2))}))},options:O});
const byReg=MODE=='all',keys=byReg?regs:['High','Medium','Low'];$('t3').textContent=byReg?'Group mix by region':`Group mix by market potential · ${REG}`;
CH.c=new Chart($('c3'),{type:'bar',data:{labels:keys,datasets:META.map((m,i)=>({label:m[0],backgroundColor:m[1],borderRadius:3,data:keys.map(k=>V.filter(d=>(byReg?d.region:d.pot)==k&&d.cl==i).length)}))},options:{...O,scales:{x:{stacked:true},y:{stacked:true}}}});
const months=[...new Set(V.flatMap(d=>d.rows.map(r=>r.Month)))];
CH.e=new Chart($('c5'),{type:'line',data:{labels:months,datasets:META.map((m,i)=>({label:m[0],borderColor:m[1],backgroundColor:m[1],tension:.35,pointRadius:0,borderWidth:2.5,data:months.map(mo=>{const a=V.filter(d=>d.cl==i).flatMap(d=>d.rows.filter(r=>r.Month==mo).map(r=>+r.Sales_vs_Target_Percent));return a.length?+mean(a).toFixed(1):null})}))},options:{...O,scales:{x:{ticks:{maxTicksLimit:12}}}}});
model();map();table()}
function kpis(){const V=view();$('kpis').innerHTML=KPI.map(([k,t,f])=>`<button class="card kpi ${KF==k?'on':''}" onclick="setKF('${k}')"><b>${V.filter(f).length}</b><span>${t}${MODE=='region'?' · '+REG:''}</span><i>View list →</i></button>`).join('')}
function model(){const g=v=>`<div class="g"><i style="width:${Math.max(0,v)*100}%"></i></div>`;
$('model').innerHTML=`<div><small>Model check · held-out silhouette</small><b>${S.sil.te.toFixed(2)}</b>${g(S.sil.te)}<p>${S.ne} unseen dealers</p></div><div><small>Training silhouette</small><b>${S.sil.tr.toFixed(2)}</b>${g(S.sil.tr)}<p>${S.nt} dealers (80% split)</p></div>
<div><small>How to read</small><p>Silhouette runs −1 to 1; above 0.25 means distinct groups. Similar train and held-out scores mean the groups generalise to dealers the model hasn't seen.</p></div>
<div><small>Method</small><p>K-means++ · k=4 · best of 10 starts · fitted on the whole network. Features: ${F.map(k=>L[k]).join(', ')}.</p></div>`}

/* ---------- map ---------- */
const PX=(lo,la)=>[(lo-67)*9.3,(37.5-la)*10],FULL=[-8,-8,310,330];let CUR=FULL.slice(),AF;
const fit=(b,ar)=>{let[x,y,w,h]=b;if(w/h<ar){const nw=h*ar;x-=(nw-w)/2;w=nw}else{const nh=w/ar;y-=(nh-h)/2;h=nh}return[x,y,w,h]};
function hull(P){P=[...P].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(P.length<3)return P;const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const h=[];for(const p of P){while(h.length>1&&cr(h[h.length-2],h[h.length-1],p)<=0)h.pop();h.push(p)}const t=h.length+1;for(let i=P.length-2;i>=0;i--){const p=P[i];while(h.length>=t&&cr(h[h.length-2],h[h.length-1],p)<=0)h.pop();h.push(p)}h.pop();return h}
function mapBuild(){const mp=$('mp'),G=S.D.filter(d=>d.geo),has=G.length>0;$('nomap').hidden=has;mp.style.display=has?'block':'none';$('lg').innerHTML=has?META.map(m=>`<span><i style="background:${m[1]}"></i>${m[0]}</span>`).join(''):'';if(!has)return;
const regs=[...new Set(G.map(d=>d.region))].sort();
const out=INDIA.map(p=>'<path class="out" d="M'+p[0].map(c=>PX(...c).map(v=>v.toFixed(1)).join(',')).join('L')+'Z"/>').join('');
const hl=regs.map((r,i)=>{const P=G.filter(d=>d.region==r).map(d=>PX(d.lon,d.lat)),h=hull(P);return`<path class="hl" data-r="${r}" onclick="REG='${r}';setMode('region')" d="M${h.map(p=>p.map(v=>v.toFixed(1)).join(',')).join('L')}Z" fill="${RC[i%5]}" stroke="${RC[i%5]}" stroke-width="9"/>`}).join('');
const lb=regs.map(r=>{const P=G.filter(d=>d.region==r).map(d=>PX(d.lon,d.lat)),c=[mean(P.map(p=>p[0])),mean(P.map(p=>p[1]))];return`<text class="lb" data-r="${r}" x="${c[0]}" y="${c[1]}">${r}</text>`}).join('');
const dots=G.map(d=>{const p=PX(d.lon,d.lat);return`<circle class="dot" data-id="${d.id}" data-r="${d.region}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" fill="${META[d.cl][1]}" onclick="pick('${d.id}')"><title>${d.name} · ${META[d.cl][0]} · priority ${d.score}</title></circle>`}).join('');
mp.innerHTML=out+hl+dots+lb;MAPOK=true;CUR=fit(FULL,mp.getBoundingClientRect().width/mp.getBoundingClientRect().height||1);apply(CUR)}
function mapTarget(){const r=$('mp').getBoundingClientRect(),ar=r.width/r.height||1;if(MODE=='all')return fit(FULL,ar);
const P=S.D.filter(d=>d.geo&&d.region==REG).map(d=>PX(d.lon,d.lat)),xs=P.map(p=>p[0]),ys=P.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),pad=Math.max(20,(x1-x0)*.18,(y1-y0)*.18);return fit([x0-pad,y0-pad,x1-x0+2*pad,y1-y0+2*pad],ar)}
function apply(b){CUR=b;const mp=$('mp');mp.setAttribute('viewBox',b.join(' '));const k=b[2]/(mp.getBoundingClientRect().width||1);mp.querySelectorAll('.dot').forEach(c=>c.setAttribute('r',k*(MODE=='all'?4.5:7)));mp.querySelectorAll('.lb').forEach(t=>t.setAttribute('font-size',k*13))}
function map(){if(!MAPOK)mapBuild();if(!MAPOK)return;const mp=$('mp'),all=MODE=='all';
mp.querySelectorAll('.hl').forEach(h=>{h.classList.toggle('sel',!all&&h.dataset.r==REG);h.classList.toggle('dim',!all&&h.dataset.r!=REG)});
mp.querySelectorAll('.dot,.lb').forEach(e=>e.classList.toggle('dim',!all&&e.dataset.r!=REG));
cancelAnimationFrame(AF);const a=CUR.slice(),b=mapTarget(),t0=performance.now();
const step=t=>{let p=Math.min(1,(t-t0)/900);p=p<.5?4*p*p*p:1-(-2*p+2)**3/2;apply(a.map((v,i)=>v+(b[i]-v)*p));if(p<1)AF=requestAnimationFrame(step)};AF=requestAnimationFrame(step)}
addEventListener('resize',()=>{if(MAPOK&&$('p1').classList.contains('on'))apply(mapTarget())});

/* ---------- priority list + detail ---------- */
function table(){const V=view(),f=(KPI.find(k=>k[0]==KF)||KPI[0])[2];
$('fc').innerHTML='<option value="">All groups</option>'+META.map((m,i)=>`<option value="${i}" ${GF!==''&&GF==i?'selected':''}>${m[0]}</option>`).join('');
const L2=V.filter(d=>f(d)&&(GF===''||d.cl==GF)).sort((a,b)=>b.score-a.score);$('cnt').textContent=L2.length+' dealers';
$('bn').innerHTML=KF!='all'?`<span class="ban">${KPI.find(k=>k[0]==KF)[1]}<button onclick="setKF('all')" title="Clear">✕</button></span>`:'';
if(!L2.find(d=>d.id==SEL))SEL=L2[0]?.id;
$('tb').innerHTML='<tr><th>#</th><th>Dealer</th><th>Group</th><th>Priority</th><th>Main drivers</th></tr>'+L2.slice(0,300).map((d,i)=>`<tr class="row ${SEL==d.id?'sel':''}" onclick="pick('${d.id}')"><td class="m">${i+1}</td><td><b>${d.name}</b><br><span class="m">${d.region} · ${d.pot} potential</span></td><td>${pill(d.cl)}${d.emerging?'<br><span class="chip" style="color:var(--o);margin-top:6px">⚠ emerging</span>':''}</td><td style="white-space:nowrap"><span class="bar"><i style="width:${d.score}%;background:${d.score>=55?'var(--r)':d.score>=30?'var(--o)':'var(--g)'}"></i></span><b>${d.score}</b></td><td>${d.why.map(k=>`<span class="chip">${L[k]}</span>`).join('')||'<span class="m">–</span>'}</td></tr>`).join('');
detail()}
function pick(id){SEL=id;const d=S.D.find(x=>x.id==id);if(d&&MODE=='region'&&d.region!=REG)SEL=null;if(KF!='all'||GF!==''){const f=(KPI.find(k=>k[0]==KF)||KPI[0])[2];if(!f(d)||(GF!==''&&d.cl!=GF)){KF='all';GF='';kpis()}}table()}
function detail(){const d=S.D.find(x=>x.id==SEL);document.querySelectorAll('.dot').forEach(c=>c.classList.toggle('sel',c.dataset.id==SEL));if(!d){$('dt').innerHTML='<span class="m">No dealers in this selection.</span>';return}
const why=d.why.length?d.why:(d.emerging?['trend']:[]);
$('dt').innerHTML=`<h3 style="font-size:19px">${d.name} ${pill(d.cl)}</h3><span class="m">${d.region} · ${d.pot} market potential · priority ${d.score}/100</span>
<div style="margin:16px 0"><b>Why flagged</b>${why.length?why.map(k=>`<div style="margin:6px 0">• ${L[k]}: <b>${fmt(k,d.f[k])}</b> <span class="m">(network ${fmt(k,S.mu[k])})</span></div>`).join(''):'<div class="m">No metric stands out. Keep routine monitoring.</div>'}</div>
${why.length?'<b>Recommended actions</b>'+why.map(k=>`<div class="act">${ACT[k]}</div>`).join(''):''}
<div class="cv" style="height:220px;margin-top:12px"><canvas id="c4"></canvas></div>`;
if(CH.d)CH.d.destroy();const rw=d.rows;
CH.d=new Chart($('c4'),{type:'line',data:{labels:rw.map(r=>r.Month),datasets:[{label:'Sales vs target %',data:rw.map(r=>+r.Sales_vs_Target_Percent),borderColor:'#0071e3',tension:.3,pointRadius:0,yAxisID:'y'},{label:'Payment delay (days)',data:rw.map(r=>+r.Payment_Delay_Days),borderColor:'#ff9f0a',tension:.3,pointRadius:0,yAxisID:'y1'}]},options:{maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:8}}},scales:{x:{ticks:{maxTicksLimit:5}},y:{position:'left'},y1:{position:'right',grid:{drawOnChartArea:false}}}}})}
load(SEED,'Sample dataset');
