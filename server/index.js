const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cfg = require('./config');
const GameRoom = require('./GameRoom');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '../client')));

// Single room (one match at a time)
const room = new GameRoom();

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    room.handleMessage(ws, msg);
  });

  ws.on('close', () => room.removePlayer(ws));
  ws.on('error', () => room.removePlayer(ws));
});

// Serve public URL to lobby (set PUBLIC_URL env var on VPS)
app.get('/tunnel-url', (req, res) => res.json({ url: cfg.PUBLIC_URL }));

server.listen(cfg.PORT, () => {
  console.log(`\n🪱  MUDHOLE server running`);
  console.log(`   Local:  http://localhost:${cfg.PORT}`);
  if (cfg.PUBLIC_URL) {
    console.log(`   Public: ${cfg.PUBLIC_URL}`);
  }
});
