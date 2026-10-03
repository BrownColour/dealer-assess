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
const DC=['#5e5ce6','#0a84ff','#ff9f0a','#ff3b30','#30a46c','#bf5af2','#64d2ff'];
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
D.forEach(d=>{const adv=d.z.map((v,j)=>[F[j],Math.max(0,-SG[F[j]]*v)]);d.ct0=adv.map(a=>a[1]*(PF[d.pot]||1));d.raw=adv.reduce((s,a)=>s+a[1],0)*(PF[d.pot]||1);d.why=adv.filter(a=>a[1]>.6).sort((a,b)=>b[1]-a[1]).slice(0,3).map(a=>a[0]);d.emerging=d.cl<2&&d.z[6]<-1.2});
const mx=Math.max(...D.map(d=>d.raw))||1;D.forEach(d=>{d.score=Math.round(d.raw/mx*100);d.ct=d.ct0.map(v=>v/mx*100)});
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
Object.values(CH).forEach(c=>c&&c.destroy());Chart.defaults.font.family="'IBM Plex Sans'";Chart.defaults.color=getComputedStyle(document.body).getPropertyValue('--m').trim();Chart.defaults.borderColor=document.documentElement.dataset.theme=='dark'?'rgba(255,255,255,.1)':'rgba(0,0,0,.08)';
const O={maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:8,padding:16}}}};
CH.b=new Chart($('c2'),{type:'bar',data:{labels:META.map(m=>m[0]),datasets:F.map((k,q)=>({label:L[k],backgroundColor:DC[q],data:META.map((m,i)=>{const a=V.filter(d=>d.cl==i);return a.length?+mean(a.map(d=>d.ct[q])).toFixed(1):0})}))},options:{...O,indexAxis:'y',scales:{x:{stacked:true,title:{display:true,text:'Avg points added to priority score'}},y:{stacked:true}}}});
const byReg=MODE=='all',keys=byReg?regs:['High','Medium','Low'];$('t3').textContent=byReg?'Group mix by region':`Group mix by market potential · ${REG}`;
CH.c=new Chart($('c3'),{type:'bar',data:{labels:keys,datasets:META.map((m,i)=>({label:m[0],backgroundColor:m[1],borderRadius:3,data:keys.map(k=>V.filter(d=>(byReg?d.region:d.pot)==k&&d.cl==i).length)}))},options:{...O,scales:{x:{stacked:true},y:{stacked:true}}}});

model();map();table()}
function kpis(){const V=view();$('kpis').innerHTML=KPI.map(([k,t,f])=>`<button class="card kpi ${KF==k?'on':''}" onclick="setKF('${k}')"><b>${V.filter(f).length}</b><span>${t}${MODE=='region'?' · '+REG:''}</span><i>View list →</i></button>`).join('')}
function model(){const g=v=>`<div class="g"><i style="width:${Math.max(0,v)*100}%"></i></div>`;
$('model').innerHTML=`<div><small>Model check · held-out silhouette</small><b>${S.sil.te.toFixed(2)}</b>${g(S.sil.te)}<p>${S.ne} unseen dealers</p></div><div><small>Training silhouette</small><b>${S.sil.tr.toFixed(2)}</b>${g(S.sil.tr)}<p>${S.nt} dealers (80% split)</p></div>
<div><small>How to read</small><p>Silhouette runs −1 to 1; above 0.25 means distinct groups. Similar train and held-out scores mean the groups generalise to dealers the model hasn't seen.</p></div>
<div><small>Method</small><p>K-means++ · k=4 · best of 10 starts · fitted on the whole network. Features: ${F.map(k=>L[k]).join(', ')}.</p></div>`}

/* ---------- map ---------- */
const PX=(lo,la)=>[(lo-67)*9.3,(37.5-la)*10],FULL=[-8,-8,310,330];let CUR=FULL.slice(),AF;
const fit=(b,ar)=>{let[x,y,w,h]=b;if(w/h<ar){const nw=h*ar;x-=(nw-w)/2;w=nw}else{const nh=w/ar;y-=(nh-h)/2;h=nh}return[x,y,w,h]};
function mapBuild(){const mp=$('mp'),G=S.D.filter(d=>d.geo),has=G.length>0;$('mapcard').style.display=has?'':'none';if(!has)return;$('lg').innerHTML=META.map(m=>`<span><i style="background:${m[1]}"></i>${m[0]}</span>`).join('');
const regs=Object.keys(INDIA_REGIONS),pt=c=>PX(c[0],c[1]).map(v=>v.toFixed(1)).join(',');
const hl=regs.map((r,i)=>`<path class="hl" data-r="${r}" onclick="REG='${r}';setMode('region')" d="${INDIA_REGIONS[r].p.map(p=>'M'+p.map(pt).join('L')+'Z').join('')}" fill="${RC[i]}" stroke="${RC[i]}"/>`).join('');
const lb=regs.map(r=>{const c=PX(...INDIA_REGIONS[r].c);return`<text class="lb" data-r="${r}" x="${c[0]}" y="${c[1]}">${r}</text>`}).join('');
const dots=G.map(d=>{const p=PX(d.lon,d.lat);return`<circle class="dot" data-id="${d.id}" data-r="${d.region}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" fill="${META[d.cl][1]}" onclick="pick('${d.id}')"><title>${d.name} · ${META[d.cl][0]} · priority ${d.score}</title></circle>`}).join('');
mp.innerHTML=hl+dots+lb;MAPOK=true;const r=mp.getBoundingClientRect();CUR=fit(FULL,r.width/r.height||1);apply(CUR)}
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
<div style="margin-bottom:14px"><b>Score breakdown</b>${(()=>{const q=F.map((k,i)=>[k,i,d.ct[i]]).filter(a=>a[2]>.05).sort((a,b)=>b[2]-a[2]),m=q[0]?q[0][2]:1;return q.map(([k,i,v])=>`<div class="cb"><span>${L[k]}</span><span class="tr"><i style="width:${v/m*100}%;background:${DC[i]}"></i></span><b>${v.toFixed(0)}</b></div>`).join('')||'<div class="m">No adverse factors.</div>'})()}<div class="m" style="font-size:11.5px;margin-top:4px">Points add up to the priority score · potential factor ×${PF[d.pot]||1}</div></div>
${why.length?'<b>Recommended actions</b>'+why.map(k=>`<div class="act">${ACT[k]}</div>`).join(''):''}
<div class="cv" style="height:200px;margin-top:12px"><canvas id="c4"></canvas></div>`;
if(CH.d)CH.d.destroy();const rw=d.rows;
CH.d=new Chart($('c4'),{type:'line',data:{labels:rw.map(r=>r.Month),datasets:[{label:'Sales vs target %',data:rw.map(r=>+r.Sales_vs_Target_Percent),borderColor:'#0071e3',tension:.3,pointRadius:0,yAxisID:'y'},{label:'Payment delay (days)',data:rw.map(r=>+r.Payment_Delay_Days),borderColor:'#ff9f0a',tension:.3,pointRadius:0,yAxisID:'y1'}]},options:{maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:8}}},scales:{x:{ticks:{maxTicksLimit:5}},y:{position:'left'},y1:{position:'right',grid:{drawOnChartArea:false}}}}})}
/* ---------- theme ---------- */
let TH={};function theme(){const s=getComputedStyle(document.documentElement);['--t','--m','--l','--c','--a'].forEach(k=>TH[k]=s.getPropertyValue(k).trim());const d=document.documentElement.dataset.theme=='dark';$('th').textContent=d?'☀ Light mode':'☾ Dark mode'}
function toggleTheme(){const n=document.documentElement.dataset.theme=='dark'?'light':'dark';document.documentElement.dataset.theme=n;try{localStorage.setItem('da-theme',n)}catch(e){}theme();if(S)render()}
/* ---------- 3D status view (custom canvas, no library) ---------- */
const R3={yaw:.8,pitch:.35,zoom:1,auto:true,pts:[],hover:null,drag:null,moved:0};
['ax0','ax1','ax2'].forEach((id,i)=>$(id).innerHTML=F.map(k=>`<option value="${k}" ${k==['sales','inv','delay'][i]?'selected':''}>${L[k]}</option>`).join(''));
function draw3(){const cv=$('c3d');if(!S||!$('p1').classList.contains('on'))return;const dpr=devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;if(!w)return;if(cv.width!=w*dpr||cv.height!=h*dpr){cv.width=w*dpr;cv.height=h*dpr}
const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);
const ax=['ax0','ax1','ax2'].map(i=>$(i).value),rg=ax.map(k=>{const a=S.D.map(d=>d.f[k]);return[Math.min(...a),Math.max(...a)]});
const cy=Math.cos(R3.yaw),sy=Math.sin(R3.yaw),cp=Math.cos(R3.pitch),sp=Math.sin(R3.pitch),sc=Math.min(w,h)*.3*R3.zoom;
const P=(a,b,c)=>{const x1=a*cy+c*sy,z1=-a*sy+c*cy,y1=b*cp-z1*sp,z2=b*sp+z1*cp,f=1/(1+z2*.22);return[w/2+x1*sc*f,h/2-y1*sc*f,z2,f]};
x.strokeStyle=TH['--l'];x.lineWidth=1;const C=[-1,1];
for(const a of C)for(const b of C){[[-1,a,b,1,a,b],[a,-1,b,a,1,b],[a,b,-1,a,b,1]].forEach(e=>{const p=P(e[0],e[1],e[2]),q=P(e[3],e[4],e[5]);x.beginPath();x.moveTo(p[0],p[1]);x.lineTo(q[0],q[1]);x.stroke()})}
x.font="500 12px 'IBM Plex Sans'";x.fillStyle=TH['--m'];x.strokeStyle=TH['--a'];x.lineWidth=2;
[[1,-1,-1],[-1,1,-1],[-1,-1,1]].forEach((e,i)=>{const o=P(-1,-1,-1),p=P(...e);x.beginPath();x.moveTo(o[0],o[1]);x.lineTo(p[0],p[1]);x.stroke();x.fillStyle=TH['--a'];x.textAlign='center';x.fillText(L[ax[i]]+' ('+rg[i][0].toFixed(0)+'–'+rg[i][1].toFixed(0)+')',p[0],p[1]+(i==1?-8:16));x.fillStyle=TH['--m']});
R3.pts=view().map(d=>{const v=ax.map((k,i)=>2*(d.f[k]-rg[i][0])/((rg[i][1]-rg[i][0])||1)-1);return{d,p:P(...v)}}).sort((a,b)=>b.p[2]-a.p[2]);
R3.pts.forEach(({d,p})=>{const r=5.5*p[3]*Math.sqrt(R3.zoom);x.beginPath();x.arc(p[0],p[1],r,0,7);x.fillStyle=META[d.cl][1]+'dd';x.fill();x.lineWidth=1;x.strokeStyle=TH['--c'];x.stroke();
if(d.id==SEL||(R3.hover&&R3.hover.id==d.id)){x.beginPath();x.arc(p[0],p[1],r+4,0,7);x.lineWidth=2;x.strokeStyle=TH['--t'];x.stroke()}})}
(function loop(){if(R3.auto&&!R3.drag)R3.yaw+=.004;draw3();requestAnimationFrame(loop)})();
(function(){const cv=$('c3d'),tip=$('tip3');
const hit=e=>{const b=cv.getBoundingClientRect(),mx=e.clientX-b.left,my=e.clientY-b.top;let f=null,bd=14;for(const {d,p} of [...R3.pts].reverse()){const q=Math.hypot(p[0]-mx,p[1]-my);if(q<bd){bd=q;f=d}}return[f,mx,my]};
cv.onpointerdown=e=>{R3.drag=[e.clientX,e.clientY];R3.moved=0;R3.auto=false;cv.setPointerCapture(e.pointerId)};
cv.onpointermove=e=>{if(R3.drag){const dx=e.clientX-R3.drag[0],dy=e.clientY-R3.drag[1];R3.moved+=Math.abs(dx)+Math.abs(dy);R3.yaw+=dx*.01;R3.pitch=Math.max(-1.4,Math.min(1.4,R3.pitch+dy*.01));R3.drag=[e.clientX,e.clientY];tip.style.display='none';return}
const[f,mx,my]=hit(e);R3.hover=f;if(f){const ax=['ax0','ax1','ax2'].map(i=>$(i).value);tip.innerHTML=`<b>${f.name}</b> · ${META[f.cl][0]}<br>`+ax.map(k=>`<span class="m">${L[k]}</span> ${fmt(k,f.f[k])}`).join('<br>');tip.style.display='block';tip.style.left=Math.min(mx+14,cv.clientWidth-190)+'px';tip.style.top=(my+14)+'px'}else tip.style.display='none'};
cv.onpointerup=e=>{const was=R3.drag;R3.drag=null;if(was&&R3.moved<4){const[f]=hit(e);if(f)pick(f.id)}};
cv.onpointerleave=()=>{R3.hover=null;tip.style.display='none'};
cv.addEventListener('wheel',e=>{e.preventDefault();R3.zoom=Math.max(.5,Math.min(2.5,R3.zoom*(e.deltaY<0?1.08:.92)))},{passive:false})})();
/* ---------- video ---------- */
function dlVid(){const a=document.createElement('a');a.href='data/presentation.mp4';a.download='dealer-assess-presentation.mp4';a.click()}

/* ---------- export CSV ---------- */
function exportCSV(){if(!S)return;
const V=view(),f=(KPI.find(k=>k[0]==KF)||KPI[0])[2];
const rows=V.filter(d=>f(d)&&(GF===''||d.cl==GF)).sort((a,b)=>b.score-a.score);
const hdr=['Rank','Dealer_ID','Dealer_Name','Region','Market_Potential','Group','Priority_Score','Emerging_Concern',...F.map(k=>L[k]),'Top_Drivers','Recommended_Actions'];
const body=rows.map((d,i)=>[i+1,d.id,d.name,d.region,d.pot,META[d.cl][0],d.score,d.emerging?'Yes':'No',...F.map(k=>d.f[k].toFixed(1)),d.why.map(k=>L[k]).join('; '),d.why.map(k=>ACT[k]).join(' | ')]);
const csv=[hdr,...body].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);
const region=MODE=='region'?`_${REG}`:'';const filter=KF!='all'?`_${KPI.find(k=>k[0]==KF)[1].replace(/ /g,'-')}`:'';
a.download=`dealer-assess-priority${region}${filter}.csv`;a.click()}

theme();
load(SEED,'Sample dataset');
