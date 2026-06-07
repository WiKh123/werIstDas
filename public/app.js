// ── Category metadata ────────────────────────────────────────────────────────
const CATEGORY_META = [
  { id: 'politik',    label: 'Politik',          icon: '🏗️' },
  { id: 'wirtschaft', label: 'Wirtschaft & Tech', icon: '💼' },
  { id: 'sport',      label: 'Sport',             icon: '⚽' },
  { id: 'musik',      label: 'Musik',             icon: '🎵' },
  { id: 'film',       label: 'Film & TV',         icon: '🎬' },
  { id: 'geschichte', label: 'Geschichte',        icon: '📚' },
];

// ── State ──────────────────────────────────────────────────────────────────
let db, auth;
let uid = null;
let myName = '';
let roomCode = '';
let isHost = false;
let roundsCount = 10;
let currentPersonIndex = null;
let hasGuessedThisRound = false;
let lastRoomState = null;
let lastCurrentRound = -99;
let hostTimerInterval = null;
let roundEndedFlag = false;
let roomRef = null;
let currentPoolSize = PERSONS.length;
let currentRoomSnapshot = null;
let currentSuggestions = [];
const processedGuessUids = new Set();
const imageUrlCache = {};

// ── Wikipedia Image Loader ─────────────────────────────────────────────────
async function getImageUrl(person) {
  const key = person && person.wikiTitle;
  if (!key) return null;
  if (imageUrlCache[key]) return imageUrlCache[key];
  try {
    const url = 'https://en.wikipedia.org/w/api.php?action=query' +
      '&titles=' + encodeURIComponent(key) +
      '&prop=pageimages&format=json&pithumbsize=500&origin=*';
    const res = await fetch(url);
    const data = await res.json();
    const pages = data && data.query && data.query.pages;
    const page = pages && Object.values(pages)[0];
    const src = page && page.thumbnail && page.thumbnail.source;
    if (src) imageUrlCache[key] = src;
    return src || null;
  } catch(e) { return null; }
}

function preloadAllImages(pool) {
  (pool || PERSONS).forEach(p => getImageUrl(p));
}

// ── Pool helpers ───────────────────────────────────────────────────────────
function getPool(room) {
  const p = room && room.personPool;
  const base = p ? (Array.isArray(p) ? p : Object.values(p)) : PERSONS;
  const cats = room && room.selectedCategories;
  if (!cats) return base;
  const catArr = Array.isArray(cats) ? cats : Object.values(cats);
  if (!catArr.length) return base;
  const catSet = new Set(catArr);
  return base.filter(person => !person.category || catSet.has(person.category));
}

function getSelectedCats(room) {
  const cats = room && room.selectedCategories;
  if (!cats) return CATEGORY_META.map(c => c.id);
  return Array.isArray(cats) ? [...cats] : Object.values(cats);
}

async function toggleCategory(catId) {
  if (!isHost || !currentRoomSnapshot) return;
  const cats = getSelectedCats(currentRoomSnapshot);
  const idx = cats.indexOf(catId);
  if (idx >= 0) {
    if (cats.length <= 1) return;
    cats.splice(idx, 1);
  } else {
    cats.push(catId);
  }
  await db.ref(`rooms/${roomCode}/selectedCategories`).set(cats);
}

function renderCategoryChips(room) {
  const container = document.getElementById('category-chips');
  if (!container) return;
  const p = room && room.personPool;
  const base = p ? (Array.isArray(p) ? p : Object.values(p)) : PERSONS;
  const selectedSet = new Set(getSelectedCats(room));
  const onlyOne = selectedSet.size === 1;
  container.innerHTML = CATEGORY_META.map(cat => {
    const active = selectedSet.has(cat.id);
    const cantDeselect = active && onlyOne;
    const count = base.filter(pr => pr.category === cat.id).length;
    return `<button class="cat-chip${active ? ' active' : ''}" onclick="toggleCategory('${cat.id}')" ${cantDeselect ? 'disabled' : ''}>${cat.icon} ${cat.label}<span class="cat-chip-count">${count}</span></button>`;
  }).join('');
}

function renderPoolScreen(room) {
  const p = room && room.personPool;
  const pool = p ? (Array.isArray(p) ? p : Object.values(p)) : PERSONS;
  document.getElementById('pool-screen-count').textContent = pool.length + ' Personen';
  document.getElementById('pool-person-list').innerHTML = pool.length
    ? pool.map((pr, i) =>
        `<div class="pool-item">
          <span class="pool-item-name">${esc(pr.name)}</span>
          <button class="pool-remove-btn" onclick="removePersonFromPool(${i})">×</button>
        </div>`
      ).join('')
    : '<p class="muted" style="margin:.75rem 0">Keine Personen im Pool.</p>';
}

async function removePersonFromPool(index) {
  const snap = await db.ref(`rooms/${roomCode}/personPool`).get();
  const raw = snap.val() || [];
  const pool = Array.isArray(raw) ? [...raw] : Object.values(raw);
  pool.splice(index, 1);
  await db.ref(`rooms/${roomCode}/personPool`).set(pool);
}

async function addPersonToPool() {
  const input = document.getElementById('pool-name-input');
  const name = input.value.trim();
  if (!name) return;
  const btn = document.getElementById('btn-add-person');
  const fb = document.getElementById('pool-feedback');
  btn.disabled = true;
  fb.textContent = 'Suche auf Wikipedia…';
  fb.className = 'pool-feedback muted';
  fb.classList.remove('hidden');
  try {
    const searchUrl = 'https://en.wikipedia.org/w/api.php?action=query&list=search' +
      '&srsearch=' + encodeURIComponent(name) +
      '&srlimit=1&srprop=&format=json&origin=*';
    const res = await fetch(searchUrl);
    const data = await res.json();
    const results = data && data.query && data.query.search;
    const wikiTitle = (results && results.length > 0)
      ? results[0].title.replace(/\s+/g, '_')
      : name.replace(/\s+/g, '_');
    const lastName = name.split(' ').at(-1);
    const newPerson = { name, aliases: [lastName], wikiTitle, info: '' };
    const snap = await db.ref(`rooms/${roomCode}/personPool`).get();
    const raw = snap.val() || [];
    const pool = Array.isArray(raw) ? [...raw] : Object.values(raw);
    pool.push(newPerson);
    await db.ref(`rooms/${roomCode}/personPool`).set(pool);
    input.value = '';
    fb.textContent = '✓ ' + name + ' hinzugefügt';
    fb.className = 'pool-feedback correct';
    getImageUrl(newPerson);
  } catch(e) {
    fb.textContent = 'Fehler. Bitte versuche es erneut.';
    fb.className = 'pool-feedback wrong';
  }
  btn.disabled = false;
}

// ── Firebase Init ─────────────────────────────────────────────────────────
async function initFirebase() {
  firebase.initializeApp(FIREBASE_CONFIG);
  db   = firebase.database();
  auth = firebase.auth();
  await auth.signInAnonymously();
  uid  = auth.currentUser.uid;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:4}, () => c[Math.floor(Math.random()*c.length)]).join('');
}
function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function norm(s) {
  return String(s).toLowerCase().trim()
    .replace(/\s+/g,' ')
    .replace(/[ä]/g,'ae').replace(/[ö]/g,'oe').replace(/[ü]/g,'ue').replace(/[ß]/g,'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g,'');
}
function isCorrect(guess, person) {
  const g=norm(guess), full=norm(person.name), last=full.split(' ').at(-1);
  return g===full || g===last || (person.aliases||[]).map(norm).includes(g);
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Firebase write with timeout ──────────────────────────────────────────────
function fbUpdate(ref, data, ms=8000) {
  return Promise.race([
    ref.update(data),
    new Promise((_,reject) => setTimeout(() => reject(new Error('Firebase Timeout – bitte Seite neu laden.')), ms))
  ]);
}

// ── Screen ──────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-'+id).classList.add('active');
  window.scrollTo(0,0);
}

// ── Render ─────────────────────────────────────────────────────────────────
const MEDALS = ['🥇','🥈','🥉'];

function renderLobbyPlayers(players, hostUid) {
  document.getElementById('player-list').innerHTML =
    Object.entries(players||{}).map(([id,p]) =>
      `<div class="player-item">
        <div class="player-avatar">${esc(p.name[0].toUpperCase())}</div>
        <span class="player-name-text">${esc(p.name)}</span>
        ${id===hostUid?'<span class="host-badge">Host</span>':''}
      </div>`
    ).join('');
}

function renderScores(players, containerId, showGuessed=false) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const sorted = Object.values(players||{}).sort((a,b)=>b.score-a.score);
  el.innerHTML = sorted.map((p,i) =>
    `<div class="score-item${showGuessed&&p.hasGuessed?' has-guessed':''}">
      <span class="score-rank">${MEDALS[i]||`${i+1}.`}</span>
      <span class="score-name">${esc(p.name)}</span>
      <span class="score-points">${p.score} Pkt.</span>
    </div>`
  ).join('');
}

function updateTimer(t) {
  const pct=Math.max(0,(t/30)*100);
  const arc=document.getElementById('timer-arc');
  if(arc){arc.setAttribute('stroke-dasharray',`${pct},100`);arc.style.stroke=t<=10?'#ff5c5c':'var(--accent)';}
  const txt=document.getElementById('timer-text');
  if(txt) txt.textContent=t;
}

// ── Autocomplete ─────────────────────────────────────────────────────────
function hideSuggestions() {
  const box=document.getElementById('guess-suggestions');
  box.className='guess-suggestions hidden';
  box.innerHTML='';
  currentSuggestions=[];
}

function updateSuggestions() {
  const box=document.getElementById('guess-suggestions');
  if(hasGuessedThisRound||!currentRoomSnapshot){ hideSuggestions(); return; }
  const raw=document.getElementById('guess-input').value;
  const q=norm(raw);
  if(q.length<2){ hideSuggestions(); return; }
  const pool=getPool(currentRoomSnapshot);
  const seen=new Set();
  const matches=[];
  for(const p of pool){
    const cands=[p.name,...(p.aliases||[])].map(norm);
    if(cands.some(c=>c.startsWith(q)) && !seen.has(p.name)){ seen.add(p.name); matches.push(p); }
  }
  for(const p of pool){
  const cands=[p.name,...(p.aliases||[])].map(norm);
    if(cands.some(c=>c.includes(q)) && !seen.has(p.name)){ seen.add(p.name); matches.push(p); }
  }
  const top=matches.slice(0,6);
  if(!top.length){ hideSuggestions(); return; }
  currentSuggestions=top;
  box.innerHTML=top.map((p,i)=>`<div class="suggestion-item" onclick="pickSuggestion(${i})">${esc(p.name)}</div>`).join('');
  box.className='guess-suggestions';
}

function pickSuggestion(i) {
  const p=currentSuggestions[i];
  if(!p) return;
  document.getElementById('guess-input').value=p.name;
  hideSuggestions();
  doGuess();
}

// ── Room Operations ───────────────────────────────────────────────────────
async function createRoom(name) {
  const code=genCode();
  const defaultPool=PERSONS.map(p=>({name:p.name,aliases:p.aliases||[],wikiTitle:p.wikiTitle,info:p.info||'',category:p.category||''}));
  await db.ref(`rooms/${code}`).set({
    host:uid, state:'lobby',
    personPool:defaultPool,
    selectedCategories: CATEGORY_META.map(c => c.id),
    rounds:null, totalRounds:null, currentRound:-1,
    timeLeft:30, roundResult:null, currentImageUrl:'',
    players:{[uid]:{name,score:0,hasGuessed:false}},
    guesses:null,
  });
  db.ref(`rooms/${code}/players/${uid}/online`).onDisconnect().set(false);
  myName=name; roomCode=code; isHost=true; lastRoomState=null; lastCurrentRound=-99;
  subscribeRoom();
  document.getElementById('lobby-code').textContent=code;
  document.getElementById('host-controls').classList.remove('hidden');
  document.getElementById('waiting-msg').classList.add('hidden');
  showScreen('lobby');
}

async function joinRoom(name, code) {
  let snap;
  try { snap=await db.ref(`rooms/${code}`).get(); }
  catch { showJoinError('Verbindungsfehler.'); return; }
  if(!snap.exists()){showJoinError('Raum nicht gefunden.');return;}
  const room=snap.val();
  if(room.state!=='lobby'){showJoinError('Das Spiel hat bereits begonnen.');return;}
  const taken=Object.values(room.players||{}).map(p=>norm(p.name));
  if(taken.includes(norm(name))){showJoinError('Dieser Name ist bereits vergeben.');return;}
  await db.ref(`rooms/${code}/players/${uid}`).set({name,score:0,hasGuessed:false});
  db.ref(`rooms/${code}/players/${uid}/online`).onDisconnect().set(false);
  myName=name; roomCode=code; isHost=false; lastRoomState=null; lastCurrentRound=-99;
  subscribeRoom();
  document.getElementById('lobby-code').textContent=code;
  document.getElementById('host-controls').classList.add('hidden');
  document.getElementById('waiting-msg').classList.remove('hidden');
  showScreen('lobby');
}

// ── Room Subscription ────────────────────────────────────────────────────
function subscribeRoom() {
  if(roomRef){roomRef.off();roomRef=null;}
  roomRef=db.ref(`rooms/${roomCode}`);
  roomRef.on('value', snap=>{if(snap.exists()) handleRoom(snap.val());});
}

// ── Room State Machine ───────────────────────────────────────────────────
function handleRoom(room) {
  currentRoomSnapshot = room;
  const {state,players,host,currentRound,timeLeft,roundResult}=room;

  if(state==='lobby') {
    renderLobbyPlayers(players,host);
    const pool=getPool(room);
    currentPoolSize=pool.length;
    const countEl=document.getElementById('pool-count-label');
    if(countEl) countEl.textContent=pool.length+' Personen';
    const rdisplay=document.getElementById('rounds-display');
    if(rdisplay && roundsCount>currentPoolSize){
      roundsCount=Math.max(3,currentPoolSize);
      rdisplay.textContent=roundsCount;
    }
    renderCategoryChips(room);
    if(document.getElementById('screen-pool').classList.contains('active')){
      renderPoolScreen(room);
    }
    if(lastRoomState!=='lobby') preloadAllImages(pool);
    if(host===uid&&!isHost){isHost=true;document.getElementById('host-controls').classList.remove('hidden');document.getElementById('waiting-msg').classList.add('hidden');}
    lastRoomState='lobby'; return;
  }

  if(state==='playing') {
    if(currentRound!==lastCurrentRound||lastRoomState!=='playing') {
      lastCurrentRound=currentRound; lastRoomState='playing';
      processedGuessUids.clear(); roundEndedFlag=false;
      startRoundUI(room); return;
    }
    updateTimer(timeLeft||0);
    renderScores(players,'live-scores',true);
    const me=players[uid];
    if(me) document.getElementById('my-score').textContent=`${me.score} Pkt.`;
    const imgEl=document.getElementById('person-image');
    if(room.currentImageUrl && imgEl.getAttribute('src')!==room.currentImageUrl) setImage(imgEl, room.currentImageUrl);
    if(isHost&&room.guesses) hostProcessGuesses(room);
    return;
  }

  if(state==='round_end'&&lastRoomState!=='round_end') {
    lastRoomState='round_end';
    if(hostTimerInterval){clearInterval(hostTimerInterval);hostTimerInterval=null;}
    const {name,info,imageUrl,isLastRound}=roundResult;
    document.getElementById('reveal-image').src=imageUrl||'';
    document.getElementById('reveal-name').textContent=name;
    document.getElementById('reveal-info-text').textContent=info||'';
    renderScores(players,'round-scores');
    if(isHost){
      document.getElementById('btn-next').textContent=isLastRound?'Endergebnis 🏆':'Nächste Runde ▶';
      document.getElementById('host-next').classList.remove('hidden');
      document.getElementById('waiting-next').classList.add('hidden');
    } else {
      document.getElementById('host-next').classList.add('hidden');
      document.getElementById('waiting-next').classList.remove('hidden');
    }
    showScreen('round-end'); return;
  }

  if(state==='finished'&&lastRoomState!=='finished') {
    lastRoomState='finished';
    if(hostTimerInterval){clearInterval(hostTimerInterval);hostTimerInterval=null;}
    renderScores(players,'final-scores');
    showScreen('end');
  }
}

function setImage(imgEl, src) {
  if (!src) return;
  imgEl.onerror = function() { imgEl.style.display='none'; };
  imgEl.onload  = function() { imgEl.style.display=''; };
  imgEl.src = src;
}

function startRoundUI(room) {
  hasGuessedThisRound=false;
  const pool=getPool(room);
  currentPersonIndex=room.rounds[room.currentRound];
  document.getElementById('round-label').textContent=`Runde ${room.currentRound+1}/${room.totalRounds}`;
  const gi=document.getElementById('guess-input');
  gi.value=''; gi.disabled=false;
  document.getElementById('btn-guess').disabled=false;
  document.getElementById('guess-feedback').className='hidden';
  document.getElementById('correct-overlay').classList.add('hidden');
  document.getElementById('live-scores').innerHTML='';
  document.getElementById('my-score').textContent=`${room.players[uid]?.score||0} Pkt.`;
  hideSuggestions();
  updateTimer(30);
  const imgEl=document.getElementById('person-image');
  imgEl.src=''; imgEl.style.display=''; imgEl.alt='Lädt...';
  if(room.currentImageUrl) setImage(imgEl, room.currentImageUrl);
  if(isHost) startHostTimer();
  showScreen('game');
}

// ── Player: Submit Guess ──────────────────────────────────────────────────
async function doGuess() {
  if(hasGuessedThisRound||currentPersonIndex===null||!currentRoomSnapshot) return;
  const guess=document.getElementById('guess-input').value.trim();
  if(guess.length<2) return;
  const person=getPool(currentRoomSnapshot)[currentPersonIndex];
  const fb=document.getElementById('guess-feedback');
  if(isCorrect(guess,person)) {
    hasGuessedThisRound=true;
    hideSuggestions();
    document.getElementById('guess-input').disabled=true;
    document.getElementById('btn-guess').disabled=true;
    document.getElementById('correct-overlay').classList.remove('hidden');
    fb.textContent='✓ Richtig! Punkte werden vergeben…';
    fb.className='correct';
    await db.ref(`rooms/${roomCode}/guesses/${uid}`).set(person.name);
  } else {
    fb.textContent='✗ Falsch! Versuch es nochmal.';
    fb.className='wrong';
    document.getElementById('guess-input').select();
  }
}

// ── Host Timer ────────────────────────────────────────────────────────────
function startHostTimer() {
  if(hostTimerInterval) clearInterval(hostTimerInterval);
  let t=30;
  hostTimerInterval=setInterval(async()=>{
    t--;
    await db.ref(`rooms/${roomCode}/timeLeft`).set(t);
    if(t<=0){clearInterval(hostTimerInterval);hostTimerInterval=null;hostEndRound();}
  },1000);
}

// ── Host: Validate Guesses ────────────────────────────────────────────────
async function hostProcessGuesses(room) {
  const {guesses,players,rounds,currentRound,timeLeft}=room;
  const pool=getPool(room);
  const person=pool[rounds[currentRound]];
  for(const [gUid,guess] of Object.entries(guesses)) {
    if(processedGuessUids.has(gUid)) continue;
    processedGuessUids.add(gUid);
    const player=players[gUid];
    if(!player||player.hasGuessed) continue;
    if(isCorrect(guess,person)) {
      const pts=Math.max(100,Math.round(500*((timeLeft||0)/30)));
      await db.ref(`rooms/${roomCode}/players/${gUid}`).update({hasGuessed:true,score:(player.score||0)+pts});
      const latestSnap=await db.ref(`rooms/${roomCode}/players`).get();
      if(Object.values(latestSnap.val()||{}).every(p=>p.hasGuessed)) {
        if(hostTimerInterval){clearInterval(hostTimerInterval);hostTimerInterval=null;}
        hostEndRound();
      }
    }
  }
}

async function hostEndRound() {
  if(roundEndedFlag) return;
  roundEndedFlag=true;
  const room=currentRoomSnapshot;
  const {rounds,currentRound,totalRounds,currentImageUrl}=room;
  const pool=getPool(room);
  const person=pool[rounds[currentRound]];
  const imageUrl=currentImageUrl||imageUrlCache[person.wikiTitle]||'';
  await db.ref(`rooms/${roomCode}`).update({
    state:'round_end',
    roundResult:{name:person.name,info:person.info||'',imageUrl,isLastRound:currentRound>=totalRounds-1},
  });
}

// ── Host: Start Game ──────────────────────────────────────────────────────
async function hostStartGame() {
  const btn=document.getElementById('btn-start');
  btn.disabled=true;
  const origText=btn.textContent;
  btn.textContent='Starte…';
  try {
    const room=currentRoomSnapshot;
    if(!room) throw new Error('Raum nicht geladen. Bitte Seite neu laden.');
    const pool=getPool(room);
    if(!pool.length) throw new Error('Keine Personen in den gewählten Kategorien.');
    const allIndices=shuffle(pool.map((_,i)=>i));
    const rounds=allIndices.slice(0,Math.min(roundsCount,pool.length));
    const resets={};
    Object.keys(room.players||{}).forEach(pid=>{resets[`players/${pid}/hasGuessed`]=false;});
    const firstImageUrl = pool[rounds[0]] ? (await getImageUrl(pool[rounds[0]])||'') : '';
    await fbUpdate(db.ref(`rooms/${roomCode}`), {
      ...resets,
      totalRounds:rounds.length, rounds,
      state:'playing', currentRound:0,
      timeLeft:30, roundResult:null, guesses:null,
      currentImageUrl:firstImageUrl,
    });
    rounds.slice(1).forEach(idx=>{ if(pool[idx]) getImageUrl(pool[idx]); });
  } catch(e) {
    console.error('Start fehlgeschlagen:', e);
    alert('Spiel konnte nicht gestartet werden:\n'+(e&&e.message?e.message:String(e)));
    btn.disabled=false;
    btn.textContent=origText;
  }
}

// ── Host: Next Round ──────────────────────────────────────────────────────
async function hostNextRound() {
  const btn=document.getElementById('btn-next');
  btn.disabled=true;
  try {
    const room=currentRoomSnapshot;
    if(!room) throw new Error('Raum nicht geladen.');
    if(room.roundResult&&room.roundResult.isLastRound){
      await fbUpdate(db.ref(`rooms/${roomCode}`), {state:'finished'});
      return;
    }
    const nextRound=room.currentRound+1;
    const pool=getPool(room);
    const nextPerson=pool[room.rounds[nextRound]];
    const resets={};
    Object.keys(room.players||{}).forEach(pid=>{resets[`players/${pid}/hasGuessed`]=false;});
    const nextImageUrl = nextPerson ? (await getImageUrl(nextPerson)||'') : '';
    await fbUpdate(db.ref(`rooms/${roomCode}`), {
      ...resets,
      state:'playing', currentRound:nextRound,
      timeLeft:30, roundResult:null, guesses:null,
      currentImageUrl:nextImageUrl,
    });
  } catch(e) {
    console.error('Nächste Runde fehlgeschlagen:', e);
    alert('Nächste Runde konnte nicht gestartet werden:\n'+(e&&e.message?e.message:String(e)));
  } finally {
    btn.disabled=false;
  }
}

// ── Error helpers ──────────────────────────────────────────────────────────
function showJoinError(msg){const el=document.getElementById('join-error');el.textContent=msg;el.classList.remove('hidden');}
function clearJoinError(){document.getElementById('join-error').classList.add('hidden');}

// ── Boot ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async()=>{
  const rdisplay=document.getElementById('rounds-display');
  document.getElementById('rounds-minus').onclick=()=>{if(roundsCount>3){roundsCount--;rdisplay.textContent=roundsCount;}};
  document.getElementById('rounds-plus').onclick=()=>{if(roundsCount<Math.min(50,currentPoolSize)){roundsCount++;rdisplay.textContent=roundsCount;}};

  document.getElementById('btn-create').onclick=async()=>{
    const name=document.getElementById('player-name').value.trim();
    if(!name){showJoinError('Bitte gib einen Namen ein.');return;}
    clearJoinError(); await createRoom(name);
  };

  const doJoin=async()=>{
    const name=document.getElementById('player-name').value.trim();
    const code=document.getElementById('room-code').value.trim().toUpperCase();
    if(!name){showJoinError('Bitte gib einen Namen ein.');return;}
    if(code.length!==4){showJoinError('4-stelligen Raumcode eingeben.');return;}
    clearJoinError(); await joinRoom(name,code);
  };
  document.getElementById('btn-join').onclick=doJoin;
  document.getElementById('room-code').addEventListener('keydown',e=>{if(e.key==='Enter')doJoin();});
  document.getElementById('player-name').addEventListener('keydown',e=>{
    if(e.key==='Enter'){const code=document.getElementById('room-code').value.trim();if(code)doJoin();else document.getElementById('btn-create').click();}
  });

  const mgBtn=document.getElementById('btn-manage-pool');
  if(mgBtn) mgBtn.onclick=()=>{
    if(currentRoomSnapshot) renderPoolScreen(currentRoomSnapshot);
    showScreen('pool');
  };
  document.getElementById('btn-pool-back').onclick=()=>showScreen('lobby');
  document.getElementById('btn-add-person').onclick=addPersonToPool;
  document.getElementById('pool-name-input').addEventListener('keydown',e=>{if(e.key==='Enter')addPersonToPool();});

  document.getElementById('btn-start').onclick=hostStartGame;
  document.getElementById('btn-guess').onclick=doGuess;
  const guessInput=document.getElementById('guess-input');
  guessInput.addEventListener('input',updateSuggestions);
  guessInput.addEventListener('keydown',e=>{if(e.key==='Enter'){hideSuggestions();doGuess();}});
  document.getElementById('btn-next').onclick=hostNextRound;
  document.getElementById('btn-play-again').onclick=()=>{
    if(roomRef){roomRef.off();roomRef=null;}
    if(hostTimerInterval){clearInterval(hostTimerInterval);hostTimerInterval=null;}
    roomCode='';isHost=false;lastRoomState=null;lastCurrentRound=-99;
    currentPoolSize=PERSONS.length;currentRoomSnapshot=null;
    clearJoinError(); showScreen('join');
  };

  try { await initFirebase(); }
  catch(e) { alert('Firebase Fehler: '+e.message+'\n\nBitte firebase-config.js prüfen.'); }
});
