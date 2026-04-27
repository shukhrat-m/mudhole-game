const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const path    = require('path');
const cfg     = require('./config');
const GameRoom = require('./GameRoom');

function uid() { return Math.random().toString(36).slice(2, 9); }

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '../client')));

const rooms = new Map(); // id → GameRoom

function cleanupRooms() {
  rooms.forEach((room, id) => {
    if (room.players.size === 0) rooms.delete(id);
  });
}

// List open lobby rooms
app.get('/rooms', (req, res) => {
  cleanupRooms();
  const list = [...rooms.values()]
    .filter(r => r.state === 'lobby')
    .map(r => ({
      id:         r.id,
      name:       r.name,
      players:    r.players.size,
      maxPlayers: cfg.MAX_PLAYERS,
    }));
  res.json(list);
});

app.get('/tunnel-url', (req, res) => res.json({ url: cfg.PUBLIC_URL }));

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'create_room') {
      cleanupRooms();
      const id   = uid();
      const room = new GameRoom(id, (msg.roomName || 'Game').slice(0, 30));
      rooms.set(id, room);
      ws._room = room;
      room.handleMessage(ws, { type: 'join', name: msg.name });
      return;
    }

    if (msg.type === 'join_room') {
      const room = rooms.get(msg.roomId);
      if (!room || room.state !== 'lobby') {
        if (ws.readyState === 1)
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found or already started' }));
        return;
      }
      ws._room = room;
      room.handleMessage(ws, { type: 'join', name: msg.name });
      return;
    }

    if (ws._room) ws._room.handleMessage(ws, msg);
  });

  ws.on('close', () => { if (ws._room) ws._room.removePlayer(ws); });
  ws.on('error', () => { if (ws._room) ws._room.removePlayer(ws); });
});

server.listen(cfg.PORT, () => {
  console.log(`\n  MUDHOLE server running`);
  console.log(`   Local:  http://localhost:${cfg.PORT}`);
  if (cfg.PUBLIC_URL) console.log(`   Public: ${cfg.PUBLIC_URL}`);
});
