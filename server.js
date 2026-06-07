const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const persons = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'persons.json'), 'utf8'));

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalize(str) {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

function checkGuess(guess, person) {
  const g = normalize(guess);
  const fullName = normalize(person.name);
  const parts = fullName.split(' ');
  const lastName = parts[parts.length - 1];
  const aliases = (person.aliases || []).map(normalize);
  return g === fullName || g === lastName || aliases.some(a => a === g);
}

function getPlayersArray(room) {
  return [...room.players.entries()].map(([id, p]) => ({
    id,
    name: p.name,
    score: p.score,
    hasGuessed: p.hasGuessed,
    isHost: id === room.host,
  }));
}

function startNextRound(room) {
  room.currentRound++;

  if (room.currentRound >= room.rounds.length) {
    endGame(room);
    return;
  }

  for (const player of room.players.values()) {
    player.hasGuessed = false;
  }

  room.roundTimeLeft = 30;
  const person = room.rounds[room.currentRound];

  if (room.roundTimer) clearInterval(room.roundTimer);

  io.to(room.code).emit('newRound', {
    round: room.currentRound + 1,
    totalRounds: room.rounds.length,
    imageUrl: person.imageUrl,
    timeLimit: 30,
  });

  room.roundTimer = setInterval(() => {
    room.roundTimeLeft--;
    io.to(room.code).emit('timerTick', { timeLeft: room.roundTimeLeft });
    if (room.roundTimeLeft <= 0) {
      clearInterval(room.roundTimer);
      room.roundTimer = null;
      endRound(room);
    }
  }, 1000);
}

function endRound(room) {
  if (room.roundTimer) {
    clearInterval(room.roundTimer);
    room.roundTimer = null;
  }
  const person = room.rounds[room.currentRound];
  io.to(room.code).emit('roundEnded', {
    person: { name: person.name, imageUrl: person.imageUrl, info: person.info },
    players: getPlayersArray(room).sort((a, b) => b.score - a.score),
    isLastRound: room.currentRound >= room.rounds.length - 1,
  });
}

function endGame(room) {
  if (room.roundTimer) {
    clearInterval(room.roundTimer);
    room.roundTimer = null;
  }
  room.state = 'finished';
  const players = getPlayersArray(room).sort((a, b) => b.score - a.score);
  io.to(room.code).emit('gameEnded', { players });
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name }) => {
    if (!name || !name.trim()) return;
    const code = generateRoomCode();
    const room = {
      code,
      host: socket.id,
      players: new Map([[socket.id, { name: name.trim(), score: 0, hasGuessed: false }]]),
      state: 'lobby',
      rounds: [],
      currentRound: -1,
      roundTimer: null,
      roundTimeLeft: 0,
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit('roomCreated', { code, players: getPlayersArray(room) });
  });

  socket.on('joinRoom', ({ code, name }) => {
    if (!code || !name) return;
    const room = rooms.get(code.trim().toUpperCase());
    if (!room) { socket.emit('joinError', { message: 'Raum nicht gefunden. Bitte Raumcode prüfen.' }); return; }
    if (room.state !== 'lobby') { socket.emit('joinError', { message: 'Das Spiel hat bereits begonnen.' }); return; }
    if ([...room.players.values()].some(p => normalize(p.name) === normalize(name))) {
      socket.emit('joinError', { message: 'Dieser Name ist bereits vergeben.' }); return;
    }
    room.players.set(socket.id, { name: name.trim(), score: 0, hasGuessed: false });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.emit('joinedRoom', { code: room.code, players: getPlayersArray(room) });
    socket.to(room.code).emit('playerJoined', { players: getPlayersArray(room), name: name.trim() });
  });

  socket.on('startGame', ({ rounds }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.host !== socket.id || room.state !== 'lobby') return;
    const count = Math.min(Math.max(parseInt(rounds) || 10, 3), persons.length);
    room.rounds = shuffleArray(persons).slice(0, count);
    room.currentRound = -1;
    room.state = 'playing';
    io.to(room.code).emit('gameStarted', { totalRounds: room.rounds.length });
    startNextRound(room);
  });

  socket.on('submitGuess', ({ guess }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.state !== 'playing') return;
    const player = room.players.get(socket.id);
    if (!player || player.hasGuessed) return;
    if (!guess || guess.trim().length < 2) return;

    const person = room.rounds[room.currentRound];
    const correct = checkGuess(guess, person);

    if (correct) {
      player.hasGuessed = true;
      const points = Math.max(100, Math.round(500 * (room.roundTimeLeft / 30)));
      player.score += points;

      io.to(room.code).emit('playerGuessed', {
        playerId: socket.id,
        playerName: player.name,
        points,
        players: getPlayersArray(room).sort((a, b) => b.score - a.score),
      });

      const allGuessed = [...room.players.values()].every(p => p.hasGuessed);
      if (allGuessed) endRound(room);
    } else {
      socket.emit('guessResult', { correct: false });
    }
  });

  socket.on('nextRound', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.host !== socket.id) return;
    startNextRound(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const playerName = room.players.get(socket.id)?.name;
    room.players.delete(socket.id);

    if (room.players.size === 0) {
      if (room.roundTimer) clearInterval(room.roundTimer);
      rooms.delete(room.code);
      return;
    }

    if (room.host === socket.id) {
      room.host = [...room.players.keys()][0];
      io.to(room.code).emit('hostChanged', { hostId: room.host });
    }
    io.to(room.code).emit('playerLeft', { players: getPlayersArray(room), name: playerName });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Wer ist das? läuft auf http://localhost:${PORT}`));
