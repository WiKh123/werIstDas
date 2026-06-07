const socket = io();

let mySocketId = null;
let isHost = false;
let currentScore = 0;
let hasGuessedThisRound = false;
let roundTimeLimit = 30;
let roundsCount = 10;

// ── Utility ──────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function avatarLetter(name) {
  return esc(name.trim()[0].toUpperCase());
}

// ── Render helpers ────────────────────────────────────

function renderLobbyPlayers(players) {
  const container = document.getElementById('player-list');
  container.innerHTML = players.map(p => `
    <div class="player-item">
      <div class="player-avatar">${avatarLetter(p.name)}</div>
      <span class="player-name-text">${esc(p.name)}</span>
      ${p.isHost ? '<span class="host-badge">Host</span>' : ''}
    </div>
  `).join('');
}

const MEDALS = ['🥇', '🥈', '🥉'];

function renderScores(players, containerId, showGuessed = false) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = players.map((p, i) => {
    const medal = MEDALS[i] || `${i + 1}.`;
    const guessedClass = showGuessed && p.hasGuessed ? ' has-guessed' : '';
    const hostIcon = p.isHost ? ' 👑' : '';
    return `
      <div class="score-item${guessedClass}">
        <span class="score-rank">${medal}</span>
        <span class="score-name">${esc(p.name)}${hostIcon}</span>
        <span class="score-points">${p.score} Pkt.</span>
      </div>
    `;
  }).join('');
}

// ── Timer ─────────────────────────────────────────────

function updateTimer(timeLeft, total) {
  const pct = Math.max(0, (timeLeft / total) * 100);
  const arc = document.getElementById('timer-arc');
  const text = document.getElementById('timer-text');
  if (arc) {
    arc.setAttribute('stroke-dasharray', `${pct},100`);
    arc.style.stroke = timeLeft <= 10 ? '#ff5c5c' : 'var(--accent)';
  }
  if (text) text.textContent = timeLeft;
}

// ── Rounds selector ───────────────────────────────────

document.getElementById('rounds-minus').addEventListener('click', () => {
  if (roundsCount > 3) {
    roundsCount--;
    document.getElementById('rounds-display').textContent = roundsCount;
  }
});
document.getElementById('rounds-plus').addEventListener('click', () => {
  if (roundsCount < 20) {
    roundsCount++;
    document.getElementById('rounds-display').textContent = roundsCount;
  }
});

// ── Join screen ───────────────────────────────────────

function getPlayerName() {
  return document.getElementById('player-name').value.trim();
}

function showJoinError(msg) {
  const el = document.getElementById('join-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearJoinError() {
  document.getElementById('join-error').classList.add('hidden');
}

document.getElementById('btn-create').addEventListener('click', () => {
  const name = getPlayerName();
  if (!name) { showJoinError('Bitte gib einen Namen ein.'); return; }
  clearJoinError();
  socket.emit('createRoom', { name });
});

document.getElementById('btn-join').addEventListener('click', doJoin);

document.getElementById('player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const code = document.getElementById('room-code').value.trim();
    if (code) doJoin();
    else document.getElementById('btn-create').click();
  }
});

document.getElementById('room-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') doJoin();
});

function doJoin() {
  const name = getPlayerName();
  const code = document.getElementById('room-code').value.trim().toUpperCase();
  if (!name) { showJoinError('Bitte gib einen Namen ein.'); return; }
  if (!code || code.length !== 4) { showJoinError('Bitte gib einen 4-stelligen Raumcode ein.'); return; }
  clearJoinError();
  socket.emit('joinRoom', { name, code });
}

// ── Lobby ─────────────────────────────────────────────

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('startGame', { rounds: roundsCount });
});

// ── Game ──────────────────────────────────────────────

document.getElementById('btn-guess').addEventListener('click', doGuess);
document.getElementById('guess-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doGuess();
});

function doGuess() {
  if (hasGuessedThisRound) return;
  const guess = document.getElementById('guess-input').value.trim();
  if (guess.length < 2) return;
  socket.emit('submitGuess', { guess });
}

// ── Round end / End ───────────────────────────────────

document.getElementById('btn-next').addEventListener('click', () => {
  socket.emit('nextRound');
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  isHost = false;
  currentScore = 0;
  hasGuessedThisRound = false;
  document.getElementById('join-error').classList.add('hidden');
  showScreen('join');
});

// ── Socket events ─────────────────────────────────────

socket.on('connect', () => {
  mySocketId = socket.id;
});

socket.on('roomCreated', ({ code, players }) => {
  isHost = true;
  document.getElementById('lobby-code').textContent = code;
  renderLobbyPlayers(players);
  document.getElementById('host-controls').classList.remove('hidden');
  document.getElementById('waiting-msg').classList.add('hidden');
  showScreen('lobby');
});

socket.on('joinedRoom', ({ code, players }) => {
  isHost = false;
  document.getElementById('lobby-code').textContent = code;
  renderLobbyPlayers(players);
  document.getElementById('host-controls').classList.add('hidden');
  document.getElementById('waiting-msg').classList.remove('hidden');
  showScreen('lobby');
});

socket.on('playerJoined', ({ players, name }) => {
  renderLobbyPlayers(players);
});

socket.on('playerLeft', ({ players, name }) => {
  renderLobbyPlayers(players);
});

socket.on('hostChanged', ({ hostId }) => {
  isHost = socket.id === hostId;
  if (isHost) {
    document.getElementById('host-controls')?.classList.remove('hidden');
    document.getElementById('waiting-msg')?.classList.add('hidden');
    document.getElementById('host-next')?.classList.remove('hidden');
    document.getElementById('waiting-next')?.classList.add('hidden');
  }
});

socket.on('gameStarted', ({ totalRounds }) => {
  currentScore = 0;
  document.getElementById('my-score').textContent = '0 Pkt.';
});

socket.on('newRound', ({ round, totalRounds, imageUrl, timeLimit }) => {
  roundTimeLimit = timeLimit;
  hasGuessedThisRound = false;

  document.getElementById('round-label').textContent = `Runde ${round}/${totalRounds}`;
  document.getElementById('person-image').src = imageUrl;
  document.getElementById('guess-input').value = '';
  document.getElementById('guess-input').disabled = false;
  document.getElementById('btn-guess').disabled = false;
  document.getElementById('guess-feedback').classList.add('hidden');
  document.getElementById('correct-overlay').classList.add('hidden');
  document.getElementById('live-scores').innerHTML = '';

  updateTimer(timeLimit, timeLimit);
  showScreen('game');
});

socket.on('timerTick', ({ timeLeft }) => {
  updateTimer(timeLeft, roundTimeLimit);
});

socket.on('guessResult', ({ correct }) => {
  const fb = document.getElementById('guess-feedback');
  fb.classList.remove('hidden', 'correct', 'wrong');
  if (correct) {
    // Handled by playerGuessed
  } else {
    fb.textContent = '✗ Falsch! Versuch es nochmal.';
    fb.classList.add('wrong');
    document.getElementById('guess-input').select();
  }
});

socket.on('playerGuessed', ({ playerId, playerName, points, players }) => {
  renderScores(players, 'live-scores', true);

  if (playerId === mySocketId) {
    hasGuessedThisRound = true;
    currentScore = players.find(p => p.id === mySocketId)?.score ?? currentScore;
    document.getElementById('my-score').textContent = `${currentScore} Pkt.`;

    const fb = document.getElementById('guess-feedback');
    fb.textContent = `✓ Richtig! +${points} Punkte`;
    fb.classList.remove('hidden', 'wrong');
    fb.classList.add('correct');

    document.getElementById('correct-overlay').classList.remove('hidden');
    document.getElementById('guess-input').disabled = true;
    document.getElementById('btn-guess').disabled = true;
  }
});

socket.on('roundEnded', ({ person, players, isLastRound }) => {
  document.getElementById('reveal-image').src = person.imageUrl;
  document.getElementById('reveal-name').textContent = person.name;
  document.getElementById('reveal-info-text').textContent = person.info || '';
  renderScores(players, 'round-scores');

  const hostNext = document.getElementById('host-next');
  const waitNext = document.getElementById('waiting-next');
  const btnNext = document.getElementById('btn-next');

  if (isHost) {
    btnNext.textContent = isLastRound ? 'Endergebnis anzeigen 🏆' : 'Nächste Runde ▶';
    hostNext.classList.remove('hidden');
    waitNext.classList.add('hidden');
  } else {
    hostNext.classList.add('hidden');
    waitNext.classList.remove('hidden');
  }

  showScreen('round-end');
});

socket.on('gameEnded', ({ players }) => {
  renderScores(players, 'final-scores');
  showScreen('end');
});

socket.on('joinError', ({ message }) => {
  showJoinError(message);
});

socket.on('disconnect', () => {
  showJoinError('Verbindung zum Server verloren. Bitte Seite neu laden.');
  showScreen('join');
});
