// ── State ──────────────────────────────────────────────────
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
const processedGuessUids = new Set();

// ── Firebase Init ─────────────────────────────────────────
async function initFirebase() {
  firebase.initializeApp(FIREBASE_CONFIG);
  db   = firebase.database();
  auth = firebase.auth();
  await auth.signInAnonymously();
  uid  = auth.currentUser.uid;
}

// ── Helpers ─────────────────────────────────────────────
function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:4}, () => c[Math.floor(Math.random()*c.length)]).join('');
}
function shuffle(arr) {
  const a = [...arr];
  for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function norm(s) { return s.toLowerCase().trim().replace(/\s+/g,' '); }
function isCorrect(guess, person) {
  const g = norm(guess);
  const full = norm(person.name);
  const last = full.split(' ').at(-1);
  return g===full || g===last || (person.aliases||[]).map(norm).includes(g);
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Screen ──────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-'+id).classList.add('active');
  window.scrollTo(0,0);
}

// ── Render ─────────────────────────────────────────────
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
  const pct = Math.max(0,(t/30)*100);
  const arc = document.getElementById('timer-arc');
  if (arc) { arc.setAttribute('stroke-dasharray',`${pct},100`); arc.style.stroke=t<=10?'#ff5c5c':'var(--accent)'; }
  const txt = document.getElementById('timer-text');
  if (txt) txt.textContent = t;
}

// ── Create Room ─────────────────────────────────────────
async function createRoom(name) {
  const code = genCode();
  const allIdx = shuffle(PERSONS.map((_,i)=>i));
  await db.ref(`rooms/${code}`).set({
    host: uid, state: 'lobby',
    rounds: allIdx, totalRounds: null, currentRound: -1,
    timeLeft: 30, roundResult: null,
    players: { [uid]: {name, score:0, hasGuessed:false} },
    guesses: null,
  });
  db.ref(`rooms/${code}/players/${uid}/online`).onDisconnect().set(false);
  myName=name; roomCode=code; isHost=true; lastRoomState=null; lastCurrentRound=-99;
  subscribeRoom();
  document.getElementById('lobby-code').textContent = code;
  document.getElementById('host-controls').classList.remove('hidden');
  document.getElementById('waiting-msg').classList.add('hidden');
  showScreen('lobby');
}

// ── Join Room ──────────────────────────────────────────
async function joinRoom(name, code) {
  let snap;
  try { snap = await db.ref(`rooms/${code}`).get(); }
  catch { showJoinError('Verbindungsfehler. Bitte erneut versuchen.'); return; }
  if (!snap.exists()) { showJoinError('Raum nicht gefunden.'); return; }
  const room = snap.val();
  if (room.state !== 'lobby') { showJoinError('Das Spiel hat bereits begonnen.'); return; }
  const taken = Object.values(room.players||{}).map(p=>norm(p.name));
  if (taken.includes(norm(name))) { showJoinError('Dieser Name ist bereits vergeben.'); return; }
  await db.ref(`rooms/${code}/players/${uid}`).set({name, score:0, hasGuessed:false});
  db.ref(`rooms/${code}/players/${uid}/online`).onDisconnect().set(false);
  myName=name; roomCode=code; isHost=false; lastRoomState=null; lastCurrentRound=-99;
  subscribeRoom();
  document.getElementById('lobby-code').textContent = code;
  document.getElementById('host-controls').classList.add('hidden');
  document.getElementById('waiting-msg').classList.remove('hidden');
  showScreen('lobby');
}

// ── Room Subscription ────────────────────────────────────
function subscribeRoom() {
  if (roomRef) { roomRef.off(); roomRef=null; }
  roomRef = db.ref(`rooms/${roomCode}`);
  roomRef.on('value', snap => { if (snap.exists()) handleRoom(snap.val()); });
}

// ── Room State Machine ───────────────────────────────────
function handleRoom(room) {
  const {state, players, host, currentRound, timeLeft, roundResult} = room;

  if (state === 'lobby') {
    renderLobbyPlayers(players, host);
    if (host === uid && !isHost) {
      isHost = true;
      document.getElementById('host-controls').classList.remove('hidden');
      document.getElementById('waiting-msg').classList.add('hidden');
    }
    lastRoomState = 'lobby';
    return;
  }

  if (state === 'playing') {
    if (currentRound !== lastCurrentRound || lastRoomState !== 'playing') {
      lastCurrentRound = currentRound;
      lastRoomState = 'playing';
      processedGuessUids.clear();
      roundEndedFlag = false;
      startRoundUI(room);
      return;
    }
    updateTimer(timeLeft||0);
    renderScores(players, 'live-scores', true);
    const me = players[uid];
    if (me) document.getElementById('my-score').textContent = `${me.score} Pkt.`;
    if (isHost && room.guesses) hostProcessGuesses(room);
    return;
  }

  if (state === 'round_end' && lastRoomState !== 'round_end') {
    lastRoomState = 'round_end';
    if (hostTimerInterval) { clearInterval(hostTimerInterval); hostTimerInterval=null; }
    const {name,info,imageUrl,isLastRound} = roundResult;
    document.getElementById('reveal-image').src = imageUrl;
    document.getElementById('reveal-name').textContent = name;
    document.getElementById('reveal-info-text').textContent = info||'';
    renderScores(players, 'round-scores');
    if (isHost) {
      document.getElementById('btn-next').textContent = isLastRound ? 'Endergebnis 🏆' : 'Nächste Runde ▶';
      document.getElementById('host-next').classList.remove('hidden');
      document.getElementById('waiting-next').classList.add('hidden');
    } else {
      document.getElementById('host-next').classList.add('hidden');
      document.getElementById('waiting-next').classList.remove('hidden');
    }
    showScreen('round-end');
    return;
  }

  if (state === 'finished' && lastRoomState !== 'finished') {
    lastRoomState = 'finished';
    if (hostTimerInterval) { clearInterval(hostTimerInterval); hostTimerInterval=null; }
    renderScores(players, 'final-scores');
    showScreen('end');
  }
}

function startRoundUI(room) {
  hasGuessedThisRound = false;
  currentPersonIndex = room.rounds[room.currentRound];
  document.getElementById('round-label').textContent = `Runde ${room.currentRound+1}/${room.totalRounds}`;
  document.getElementById('person-image').src = PERSONS[currentPersonIndex].imageUrl;
  document.getElementById('guess-input').value = '';
  document.getElementById('guess-input').disabled = false;
  document.getElementById('btn-guess').disabled = false;
  document.getElementById('guess-feedback').className = 'hidden';
  document.getElementById('correct-overlay').classList.add('hidden');
  document.getElementById('live-scores').innerHTML = '';
  document.getElementById('my-score').textContent = `${room.players[uid]?.score||0} Pkt.`;
  updateTimer(30);
  if (isHost) startHostTimer();
  showScreen('game');
}

// ── Host Timer ───────────────────────────────────────────
function startHostTimer() {
  if (hostTimerInterval) clearInterval(hostTimerInterval);
  let t = 30;
  hostTimerInterval = setInterval(async () => {
    t--;
    await db.ref(`rooms/${roomCode}/timeLeft`).set(t);
    if (t <= 0) { clearInterval(hostTimerInterval); hostTimerInterval=null; hostEndRound(); }
  }, 1000);
}

// ── Host: Validate Guesses ───────────────────────────────
async function hostProcessGuesses(room) {
  const {guesses, players, rounds, currentRound, timeLeft} = room;
  const person = PERSONS[rounds[currentRound]];
  for (const [gUid, guess] of Object.entries(guesses)) {
    if (processedGuessUids.has(gUid)) continue;
    processedGuessUids.add(gUid);
    const player = players[gUid];
    if (!player || player.hasGuessed) continue;
    if (isCorrect(guess, person)) {
      const pts = Math.max(100, Math.round(500*((timeLeft||0)/30)));
      await db.ref(`rooms/${roomCode}/players/${gUid}`).update({
        hasGuessed: true,
        score: (player.score||0)+pts,
      });
      const latestSnap = await db.ref(`rooms/${roomCode}/players`).get();
      const allGuessed = Object.values(latestSnap.val()||{}).every(p=>p.hasGuessed);
      if (allGuessed) {
        if (hostTimerInterval) { clearInterval(hostTimerInterval); hostTimerInterval=null; }
        hostEndRound();
      }
    }
  }
}

async function hostEndRound() {
  if (roundEndedFlag) return;
  roundEndedFlag = true;
  const snap = await db.ref(`rooms/${roomCode}`).get();
  const {rounds, currentRound, totalRounds} = snap.val();
  const person = PERSONS[rounds[currentRound]];
  await db.ref(`rooms/${roomCode}`).update({
    state: 'round_end',
    roundResult: {
      name: person.name, info: person.info||'',
      imageUrl: person.imageUrl,
      isLastRound: currentRound >= totalRounds-1,
    },
  });
}

// ── Host: Start Game ────────────────────────────────────
async function hostStartGame() {
  const snap = await db.ref(`rooms/${roomCode}`).get();
  const room = snap.val();
  const rounds = room.rounds.slice(0, Math.min(roundsCount, PERSONS.length));
  const resets = {};
  Object.keys(room.players||{}).forEach(pid => { resets[`players/${pid}/hasGuessed`]=false; });
  await db.ref(`rooms/${roomCode}`).update({
    ...resets,
    totalRounds: rounds.length, rounds,
    state: 'playing', currentRound: 0,
    timeLeft: 30, roundResult: null, guesses: null,
  });
}

// ── Host: Next Round ───────────────────────────────────
async function hostNextRound() {
  const snap = await db.ref(`rooms/${roomCode}`).get();
  const room = snap.val();
  if (room.roundResult?.isLastRound) {
    await db.ref(`rooms/${roomCode}/state`).set('finished');
    return;
  }
  const nextRound = room.currentRound+1;
  const resets = {};
  Object.keys(room.players||{}).forEach(pid => { resets[`players/${pid}/hasGuessed`]=false; });
  await db.ref(`rooms/${roomCode}`).update({
    ...resets,
    state: 'playing', currentRound: nextRound,
    timeLeft: 30, roundResult: null, guesses: null,
  });
}

// ── Player: Submit Guess ───────────────────────────────
async function doGuess() {
  if (hasGuessedThisRound || currentPersonIndex===null) return;
  const guess = document.getElementById('guess-input').value.trim();
  if (guess.length < 2) return;
  const person = PERSONS[currentPersonIndex];
  const fb = document.getElementById('guess-feedback');
  if (isCorrect(guess, person)) {
    hasGuessedThisRound = true;
    document.getElementById('guess-input').disabled = true;
    document.getElementById('btn-guess').disabled = true;
    document.getElementById('correct-overlay').classList.remove('hidden');
    fb.textContent = '✓ Richtig! Punkte werden vergeben…';
    fb.className = 'correct';
    await db.ref(`rooms/${roomCode}/guesses/${uid}`).set(guess);
  } else {
    fb.textContent = '✗ Falsch! Versuch es nochmal.';
    fb.className = 'wrong';
    document.getElementById('guess-input').select();
  }
}

// ── Error helpers ──────────────────────────────────────
function showJoinError(msg) {
  const el = document.getElementById('join-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearJoinError() {
  document.getElementById('join-error').classList.add('hidden');
}

// ── Boot ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Rounds selector
  const rdisplay = document.getElementById('rounds-display');
  document.getElementById('rounds-minus').onclick = () => {
    if (roundsCount>3) { roundsCount--; rdisplay.textContent=roundsCount; }
  };
  document.getElementById('rounds-plus').onclick = () => {
    if (roundsCount<Math.min(20,PERSONS.length)) { roundsCount++; rdisplay.textContent=roundsCount; }
  };

  // Create
  document.getElementById('btn-create').onclick = async () => {
    const name = document.getElementById('player-name').value.trim();
    if (!name) { showJoinError('Bitte gib einen Namen ein.'); return; }
    clearJoinError();
    await createRoom(name);
  };

  // Join
  const doJoin = async () => {
    const name = document.getElementById('player-name').value.trim();
    const code = document.getElementById('room-code').value.trim().toUpperCase();
    if (!name) { showJoinError('Bitte gib einen Namen ein.'); return; }
    if (code.length!==4) { showJoinError('4-stelligen Raumcode eingeben.'); return; }
    clearJoinError();
    await joinRoom(name, code);
  };
  document.getElementById('btn-join').onclick = doJoin;
  document.getElementById('room-code').addEventListener('keydown', e => { if(e.key==='Enter') doJoin(); });
  document.getElementById('player-name').addEventListener('keydown', e => {
    if (e.key==='Enter') {
      const code=document.getElementById('room-code').value.trim();
      if (code) doJoin(); else document.getElementById('btn-create').click();
    }
  });

  // Game actions
  document.getElementById('btn-start').onclick = hostStartGame;
  document.getElementById('btn-guess').onclick = doGuess;
  document.getElementById('guess-input').addEventListener('keydown', e => { if(e.key==='Enter') doGuess(); });
  document.getElementById('btn-next').onclick = hostNextRound;

  // Play again
  document.getElementById('btn-play-again').onclick = () => {
    if (roomRef) { roomRef.off(); roomRef=null; }
    if (hostTimerInterval) { clearInterval(hostTimerInterval); hostTimerInterval=null; }
    roomCode=''; isHost=false; lastRoomState=null; lastCurrentRound=-99;
    clearJoinError();
    showScreen('join');
  };

  // Init Firebase
  try {
    await initFirebase();
  } catch(e) {
    alert('Firebase Fehler: ' + e.message + '\n\nBitte firebase-config.js mit deinen Projektdaten befüllen.');
  }
});
