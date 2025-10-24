/**********************
 * 공통 유틸 & 데이터
 **********************/

// ----- 컬럼 자동탐지
function pick(cols, arr){ for(const k of arr){ if(cols.includes(k)) return k; } return null; }
function pickNameCol(cols){ return pick(cols,['콘텐츠명','관광지명','업소명','상호명','이름','타이틀','제목']) || cols[0]; }
function pickTypeCol(cols){ return pick(cols,['유형','분류','카테고리','type']); }
function pickLatCol(cols){ return pick(cols,['위도','lat','Latitude']); }
function pickLngCol(cols){ return pick(cols,['경도','lng','longitude','Lon','Long']); }
function pickAddrCol(cols){ return pick(cols,['주소','address']); }
function pickDescCol(cols){ return pick(cols,['상세내용','소개','설명','본문','부제목','내용','intro','desc']); }
function pickThumbCol(cols){ return pick(cols,['썸네일','대표이미지','대표사진','이미지','사진','이미지URL','image','image_url','thumbnail','thumb']); }
function pickStartCol(cols){ return pick(cols,['시작일','시작일자','start','start_date','행사시작','운영시작']); }
function pickEndCol(cols){ return pick(cols,['종료일','종료일자','end','end_date','행사종료','운영종료']); }

// ----- 이름 정규화/유사도
function normName(s){ return (s||'').toString().trim().toLowerCase().replace(/\s+/g,' '); }
function tokenFreq(s){ const m=new Map(); for(const t of s.split(' ')){ if(!t) continue; m.set(t,(m.get(t)||0)+1);} return m; }
function cosineSim(a,b){ const fa=tokenFreq(a), fb=tokenFreq(b); let dot=0,na=0,nb=0; for(const [k,v] of fa){ na+=v*v; if(fb.has(k)) dot+=v*(fb.get(k)||0);} for(const v of fb.values()) nb+=v*v; return (na&&nb)? dot/(Math.sqrt(na)*Math.sqrt(nb)) : 0; }
function jaroWinkler(s1,s2){ const m=Math.floor(Math.max(s1.length,s2.length)/2)-1; let matches=0, trans=0; const s1M=new Array(s1.length).fill(false), s2M=new Array(s2.length).fill(false);
  for(let i=0;i<s1.length;i++){ const st=Math.max(0,i-m), en=Math.min(i+m+1,s2.length); for(let j=st;j<en;j++){ if(s2M[j]) continue; if(s1[i]===s2[j]){ s1M[i]=s2M[j]=true; matches++; break; } } }
  if(!matches) return 0; let k=0; for(let i=0;i<s1.length;i++){ if(!s1M[i]) continue; while(!s2M[k]) k++; if(s1[i]!==s2[k]) trans++; k++; }
  const j=(matches/s1.length + matches/s2.length + (matches - trans/2)/matches)/3; let l=0; while(l<4 && s1[l]===s2[l]) l++; return j + l*0.1*(1-j);
}
function nameSimilarity(a,b){ a=normName(a); b=normName(b); return 0.6*cosineSim(a,b)+0.4*jaroWinkler(a,b); }
function bestNameMatch(name, ctx, threshold=0.72){
  let best=null,score=0;
  for(const it of ctx.items){ const sc=nameSimilarity(name,it.name); if(sc>score){score=sc;best=it;} }
  return (score>=threshold)?best:null;
}

// ----- PRNG & 시드 셔플(재현성)
function prng(seed){ let x=(seed>>>0)||1; return ()=> (x=(x*1664525+1013904223)>>>0)/4294967296; }
function shuffleSeeded(arr, seed){
  const rnd = prng(seed);
  for(let i=arr.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  return arr;
}

// ----- CSV 로드
async function loadDataset(path){
  const res = await fetch(path);
  if(!res.ok){ alert('busan_data.csv 를 찾지 못했습니다.'); throw new Error('csv not found'); }
  const csv = await res.text();
  const parsed = Papa.parse(csv, {header:true, skipEmptyLines:true});
  const rows = parsed.data; if(!rows.length) throw new Error('empty csv');
  const cols = Object.keys(rows[0]);
  const nameCol=pickNameCol(cols), typeCol=pickTypeCol(cols), latCol=pickLatCol(cols), lngCol=pickLngCol(cols),
        addrCol=pickAddrCol(cols), descCol=pickDescCol(cols), thumbCol=pickThumbCol(cols);
  const sCol=pickStartCol(cols), eCol=pickEndCol(cols);
  const items = rows.map(r=>({
    name:(r[nameCol]??'').toString(),
    type:typeCol? (r[typeCol]??'').toString(): '',
    lat:latCol? parseFloat(r[latCol]) : NaN,
    lng:lngCol? parseFloat(r[lngCol]) : NaN,
    addr:addrCol? (r[addrCol]??'').toString() : '',
    desc:descCol? (r[descCol]??'').toString() : '',
    thumb:thumbCol? (r[thumbCol]??'').toString() : '',
    s:sCol? (r[sCol]||'') : '',
    e:eCol? (r[eCol]||'') : '',
    _norm: null, raw:r
  }));
  items.forEach(it=> it._norm = normName(it.name));
  return {items, sCol, eCol};
}

// ----- ✅ 유명지 하드필터(단일 컬럼 CSV)
async function loadBlacklist(path){
  if(!path) return new Set();
  try{
    const res = await fetch(path, {cache:'no-store'});
    if(!res.ok) return new Set();
    const text = await res.text();
    const parsed = Papa.parse(text, {header:false, skipEmptyLines:true});
    return new Set(parsed.data.map(r=> normName(r[0]||'')).filter(Boolean));
  }catch{ return new Set(); }
}
function inBlacklist(it, blacklist){ return blacklist && blacklist.size ? blacklist.has(it._norm || normName(it.name)) : false; }

// ----- 테마/감정 어휘(보조 점수용)
const THEME_DICT = {
  '바다':['바다','해변','해안','포구','항구','해수욕장','파도','방파제','선착장','바닷길'],
  '자연':['자연','숲','공원','산','계곡','둘레길','정원','습지','수목원'],
  '산책':['산책','걷기','트레킹','코스','둘레길','보행'],
  '전망':['전망','전망대','뷰','스카이','전망포인트'],
  '야경':['야경','불빛','루프탑','라이트','야간','야경포인트'],
  '역사':['역사','유적','근대','문화재','향토','기념관','박물관','전시관'],
  '공방/체험':['체험','공방','만들기','클래스','워크숍','체험관'],
  '카페':['카페','티','커피','디저트','베이커리'],
  '시장/맛집':['시장','맛집','분식','음식','식당','국밥','백반','횟집','수산'],
  '축제':['축제','페스티벌','행사','불꽃','퍼레이드'],
  '쇼핑':['쇼핑','몰','백화점','아울렛','상가','거리'],
  '포토스팟':['포토','인생샷','감성','벽화','포토존','배경','스팟']
};
const EMOTION_DICT = {
  '차분':['산책','정원','조용','고즈넉','서점','전망대','공원','숲','둘레길'],
  '힐링':['온천','스파','카페','휴식','초록','바다바람','피크닉','치유'],
  '로맨틱':['야경','루프탑','전망','감성','포토스팟','노을'],
  '들뜸':['축제','공연','음악','이벤트','불꽃','플리마켓'],
  '활기':['시장','거리','체험','쇼핑','놀이','테마파크','맛집'],
  '우울':['바다','파도','산책','전망','고요','치유']
};

// ----- 토큰화/스코어
function tokenize(s){ return (s||'').toString().toLowerCase().replace(/[^0-9a-z가-힣\s]/g,' ').split(/\s+/).filter(Boolean); }
function scoreItem(item, themes, emotions, purpose){
  const text = `${item.name} ${item.type} ${item.addr} ${item.desc}`;
  let s = 0;
  for(const t of themes){ const kws = THEME_DICT[t]||[]; for(const k of kws){ if(text.includes(k)) s += 1.0; }}
  for(const emo of emotions){ for(const k of (EMOTION_DICT[emo]||[])){ if(text.includes(k)) s += 0.8; }}
  for(const k of tokenize(purpose)){ if(k.length>=2 && text.includes(k)) s += 0.4; }
  return s;
}

// ----- 날짜 유틸(타임존 안전)
function parseYMD(s){ if(!s) return null; const [y,m,d]=s.toString().slice(0,10).split('-').map(Number); return new Date(y,(m||1)-1,(d||1)); }
function formatYMD(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function toYMD(x){ if(!x) return null; if(typeof x==='string') return x.slice(0,10); const d=new Date(x); return isNaN(+d)? null : formatYMD(d); }
function splitDays(start,end){
  const S=parseYMD(toYMD(start)), E=parseYMD(toYMD(end)); const out=[];
  if(!S||!E) return out;
  const d=new Date(S);
  while(d<=E){ out.push(new Date(d)); d.setDate(d.getDate()+1); }
  return out;
}

// ----- 기간 필터(문자열/Date 모두 허용)
function withinSchedule(item, tripS, tripE){
  const S=parseYMD(toYMD(tripS)), E=parseYMD(toYMD(tripE));
  const s=item.s? parseYMD(toYMD(item.s)) : null;
  const e=item.e? parseYMD(toYMD(item.e)) : null;
  if(s && e && S && E){ return !(e < S || s > E); }
  return true;
}

// ----- 거리 & 경로(최근접)
function haversine(a,b){
  const R=6371, toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lng-a.lng);
  const lat1=toRad(a.lat), lat2=toRad(b.lat);
  const h=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function nearestRoute(points){
  if(points.length<=2) return points.slice();
  const left=points.slice(); const route=[left.shift()];
  while(left.length){
    let bi=0,bd=Infinity;
    for(let i=0;i<left.length;i++){
      const d=haversine(route[route.length-1], left[i]);
      if(d<bd){ bd=d; bi=i; }
    }
    route.push(left.splice(bi,1)[0]);
  }
  return route;
}

// ----- 이유 생성(방어 처리)
function buildReason(it,themes=[],emotions=[],purpose=''){
  const text = `${(it.name||'')} ${(it.type||'')} ${(it.desc||'')}`.toLowerCase();
  const themeHits = (Array.isArray(themes)?themes:[themes]).filter(t => (THEME_DICT[t]||[]).some(k => text.includes((k||'').toLowerCase())));
  const emoHits   = (Array.isArray(emotions)?emotions:[emotions]).filter(e => (EMOTION_DICT[e]||[]).some(k => text.includes((k||'').toLowerCase())));
  const bits=[];
  if(themeHits.length) bits.push(`선택 테마(${themeHits.join(', ')})와 잘 맞아요`);
  if(emoHits.length)   bits.push(`감정(${emoHits[0]}) 키워드와 부합`);
  if(it.type)          bits.push(`${it.type} 카테고리로 밸런스 보완`);
  return bits.join(' · ') || '동선과 취향을 고려해 배치했습니다';
}

/**********************
 * 로컬 프리뷰 플랜 (하드필터+시드)
 **********************/
function buildPlanLocal(ctx, {purpose,themes,emotions,start,end}, blacklist){
  // 1) 기간 + 좌표 + 하드필터
  const base = ctx.items.filter(it =>
    !inBlacklist(it,blacklist) &&
    Number.isFinite(it.lat)&&Number.isFinite(it.lng) &&
    withinSchedule(it, start, end)
  );

  // 2) 스코어 계산
  base.forEach(it=> it._score = scoreItem(it, themes, emotions, purpose));

  // 3) 시드 셔플 + 스코어 정렬
  shuffleSeeded(base, window.LLM_CONFIG.seed);
  base.sort((a,b)=> b._score - a._score);

  // 4) 일자별로 중복 없이 선별 + 거리 순서
  const days = splitDays(start, end);
  const out=[]; const used=new Set();
  const perDay = window.LLM_CONFIG.maxItemsPerDay || 4;

  for(const day of days){
    const pool = base.filter(it => !used.has(it.name));
    const pick = pool.slice(0, perDay);
    const route = pick.length ? nearestRoute(pick) : pick;
    const times=['10:00','12:30','14:30','18:00'];

    route.forEach((it,i)=>{
      used.add(it.name);
      it._day = formatYMD(day);
      it._order = i+1;
      it._time = times[i]||'';
      it._reason = buildReason(it,themes,emotions,purpose);
      out.push(it);
    });
  }
  return out;
}

/**********************
 * LLM 파이프라인 (필요 시)
 **********************/
function summarizeItem(it){
  return {
    name:it.name, type:it.type||'', addr:it.addr||'',
    lat:Number.isFinite(it.lat)?it.lat:null, lng:Number.isFinite(it.lng)?it.lng:null,
    desc:(it.desc||'').slice(0,200), thumb:it.thumb||''
  };
}
function sampleCandidates(items, k){
  const withPos=items.filter(i=>Number.isFinite(i.lat)&&Number.isFinite(i.lng));
  const others=items.filter(i=>!(Number.isFinite(i.lat)&&Number.isFinite(i.lng)));
  const pool=[...withPos,...others];
  shuffleSeeded(pool, window.LLM_CONFIG.seed);
  return pool.slice(0,k).map(summarizeItem);
}
function dateRangeList(s,e){ const out=[]; let d=new Date(s), E=new Date(e); while(d<=E){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1);} return out; }

function itineraryPrompt(params, candidates){
  const {purpose, themes, emotions, start, end} = params;
  const days = dateRangeList(start, end);
  const maxPerDay = window.LLM_CONFIG.maxItemsPerDay || 4;
  return `
[역할]
당신은 "지역 기반 여행 플래너"입니다. 사용자의 기간·목적·테마·감정을 반영하여,
아래에 제공된 "후보 목록"에서만 선택해 현실적인 일정을 만듭니다. (후보에 없는 장소 금지)

[입력 요약]
- 기간: ${start} ~ ${end} (총 ${days.length}일)
- 목적: ${purpose || '(미입력)'}
- 테마(다중): ${themes.join(', ') || '(없음)'}
- 감정(다중): ${emotions.join(', ') || '(없음)'}

[핵심 목표]
1) 과밀·유명 관광지 제외(혼잡 회피). 로컬/덜 알려진 장소 우선.
2) 테마·감정·목적 키워드와의 적합도 우선.
3) 하루 방문 수 최대 ${maxPerDay}개.
4) 좌표가 있는 후보는 서로 인접한 순서(대략적 근접)로 배열.
5) 이유(reason)는 한국어 1~2문장.

[선정/정렬 규칙]
- 반드시 "후보 목록"의 name만 사용(철자/띄어쓰기 변경 금지).
- 중복 금지(같은 장소 여러 번 배제).
- 좌표 없는 항목은 가급적 제외, 필요 시 1일 1개 이하.
- 음식/휴식 포인트를 하루 1회 이상 포함하도록 노력.
- 축제/기간성 장소는 기간과 무관하면 후순위.
- 동일 입력이면 동일 결과(테마/감정 매칭 → 좌표 근접 → 설명 관련성 → 사전식).

[시간 배치]
- HH:MM 형식(24시간), 오름차순, 중복 시간 금지.

[출력 형식(JSON만 반환)]
{
  "days": [
    {"date":"YYYY-MM-DD",
     "stops":[
       {"name":"<후보 중 정확히 일치>", "time":"HH:MM", "reason":"<한국어 1~2문장>"}
     ]}
  ]
}

[후보 목록]
${JSON.stringify(candidates)}
`;
}

async function callLLM(apiKey, model, promptText){
  if(window.LLM_CONFIG.useProxy){
    const res = await fetch(window.LLM_CONFIG.proxyURL, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({model, prompt: promptText})});
    if(!res.ok) throw new Error('Proxy HTTP '+res.status);
    return await res.json();
  }else{
    const endpoint = window.LLM_CONFIG.endpoint(model);
    const body = { contents:[{parts:[{text:promptText}]}], generationConfig:{ responseMimeType: window.LLM_CONFIG.responseMimeType } };
    const res = await fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json','x-goog-api-key': apiKey }, body: JSON.stringify(body) });
    if(!res.ok) throw new Error('LLM HTTP '+res.status);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(text);
  }
}

function normalizeItinerary(json, ctx, blacklist, params){
  const out=[]; const days=json.days||[];
  days.forEach(day=>{
    const stops=day.stops||[];
    stops.forEach((s,i)=>{
      let src = ctx.items.find(it=> it.name===s.name ) || bestNameMatch(s.name, ctx);
      if(!src) return;
      if(inBlacklist(src, blacklist)) return;
      out.push({
        ...src,
        _day: day.date,
        _order: i+1,
        _time: s.time||['10:00','12:30','14:30','18:00'][i]||'',
        _reason: (s.reason && s.reason.trim()) ? s.reason : buildReason(src, params.themes, params.emotions, params.purpose)
      });
    });
  });
  return out;
}

async function buildPlanLLM(ctx, params, apiKey, blacklist){
  const pre = ctx.items.filter(it=> !inBlacklist(it, blacklist));
  const cands = sampleCandidates(pre, window.LLM_CONFIG.preTopK);
  const prompt = itineraryPrompt(params, cands);
  const json = await callLLM(apiKey, window.LLM_CONFIG.model, prompt);
  return normalizeItinerary(json, ctx, blacklist, params);
}

/**********************
 * 렌더(목록+지도) / CSV
 **********************/
let _map,_layer; const DAY_COLORS=['#2563eb','#16a34a','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#db2777'];

function ensureMap(){
  if(_map) return _map;
  _map=L.map('map',{zoomControl:true}).setView([35.1796,129.0756],11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(_map);
  _layer=L.layerGroup().addTo(_map);
  return _map;
}
function colorDot(color){ return L.divIcon({className:'', html:`<div class="marker-dot" style="background:${color}"></div>` , iconSize:[14,14], iconAnchor:[7,7]}); }

function escapeHtml(s){ return (s||'').toString().replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function trim(s,n){ s=(s||'')+''; return s.length>n? s.slice(0,n)+'…' : s; }

function renderPlan(items){
  const box=document.getElementById('cards'); box.innerHTML='';
  const byDay={}; items.forEach(x=>{ (byDay[x._day]??=[]).push(x); });
  const days=Object.keys(byDay).sort();

  days.forEach(d=>{
    const list = byDay[d].sort((a,b)=>a._order-b._order);
    const h=document.createElement('h3'); h.className='dayTitle'; h.textContent= d; box.appendChild(h);

    list.forEach(it=>{
      const el=document.createElement('div'); el.className='card card--with-thumb';
      const img = (it.thumb||'').trim();
      const imgTag = img
        ? `<img class="thumb" src="${escapeHtml(img)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
        : `<div class="thumb thumb--placeholder"></div>`;
      el.innerHTML = `
        ${imgTag}
        <div class="card__body">
          <div class="t">${it._time} · ${escapeHtml(it.name)} <span class="meta">${escapeHtml(it.type||'')}</span></div>
          <div class="meta">${escapeHtml(it.addr||'')}</div>
          <div class="reason">${escapeHtml(it._reason||'')}</div>
          <div class="meta">${trim(it.desc, 120)}</div>
        </div>`;
      box.appendChild(el);
    });
  });

  ensureMap(); _layer.clearLayers();
  const bounds=[];
  days.forEach((d,di)=>{
    const color=DAY_COLORS[di%DAY_COLORS.length];
    const pts=byDay[d].filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
    const latlngs=pts.map(p=>[p.lat,p.lng]);
    latlngs.forEach((xy,i)=>{ bounds.push(xy); L.marker(xy,{icon:colorDot(color)}).bindPopup(`${i+1}. ${pts[i].name}`).addTo(_layer); });
    if(latlngs.length>=2){ L.polyline(latlngs,{color,weight:4,opacity:0.9}).addTo(_layer); }
  });
  if(bounds.length){ _map.fitBounds(bounds,{padding:[30,30]}); }
}

function downloadPlanCsv(items){
  const headers=['date','order','time','name','type','addr','reason','lat','lng','thumb'];
  const rows=items.map(it=>[it._day,it._order,it._time,it.name,it.type,it.addr,it._reason||'',it.lat||'',it.lng||'',it.thumb||'']);
  const data=[headers,...rows].map(r=>r.map(v=>`"${(v||'').toString().replaceAll('"','""')}"`).join(',')).join('\n');
  const blob=new Blob(["\ufeff"+data],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='itinerary.csv'; a.click(); URL.revokeObjectURL(url);
}

/**********************
 * 일정 캐시(잠금) 유틸 + 전부 초기화
 **********************/
window.GILDAM_KEYS = ['gildam_start','gildam_end','gildam_themes','gildam_emotions','gildam_purpose'];

function resetSelections({ clearPlans = true } = {}){
  try{
    for(const k of window.GILDAM_KEYS){ localStorage.removeItem(k); }
    if(clearPlans){
      Object.keys(localStorage).forEach(k=>{
        if(k.startsWith('gildam_plan_')) localStorage.removeItem(k);
      });
    }
  }catch(e){ console.warn('resetSelections error', e); }
}

// 뒤로가기(bfcache)로 이전 화면 복원 방지
(function(){
  window.addEventListener('pageshow', (e)=>{
    if(e.persisted){ location.reload(); }
  });
})();

/**********************
 * 일정 캐시(잠금) 키/저장
 **********************/
function hashStr(s){ let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=(h*16777619)>>>0; } return (h>>>0).toString(16); }
function planKey({purpose,themes,emotions,start,end}){
  const sig = ['v3', toYMD(start), toYMD(end), (themes||[]).join('|'), (emotions||[]).join('|'), hashStr(purpose||'')].join('::');
  return 'gildam_plan_' + hashStr(sig);
}
function serializePlan(items){
  return items.map(it => ({ _day: it._day, _order: it._order, _time: it._time, name: it.name, type: it.type||'', addr: it.addr||'', reason: it._reason||'', lat: it.lat, lng: it.lng, thumb: it.thumb||'' }));
}
function deserializePlan(arr){
  return (arr||[]).map(it => ({ _day: it._day, _order: it._order, _time: it._time, name: it.name, type: it.type, addr: it.addr, _reason: it.reason, lat: it.lat, lng: it.lng, thumb: it.thumb }));
}
function savePlan(key, items, meta={}){ const payload = { meta: {...meta, savedAt: Date.now()}, items: serializePlan(items) }; localStorage.setItem(key, JSON.stringify(payload)); }
function loadPlan(key){ try{ const raw=localStorage.getItem(key); if(!raw) return null; const parsed=JSON.parse(raw); return { meta: parsed.meta||{}, items: deserializePlan(parsed.items||[]) }; }catch{ return null; } }
function clearPlan(key){ localStorage.removeItem(key); }

// 전역 노출
window.planKey = planKey;
window.savePlan = savePlan;
window.loadPlan = loadPlan;
window.clearPlan = clearPlan;
window.loadDataset=loadDataset;
window.loadBlacklist=loadBlacklist;
window.buildPlanLocal=buildPlanLocal;
window.buildPlanLLM=buildPlanLLM;
window.renderPlan=renderPlan;
window.downloadPlanCsv=downloadPlanCsv;
window.resetSelections=resetSelections;
