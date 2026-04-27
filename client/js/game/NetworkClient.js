export default class NetworkClient {
  constructor() {
    this.ws         = null;
    this.handlers   = {};
    this.playerId   = null;
    this.playerTeam = null;
    this.isHost     = false;
  }

  // Opens a WS, sends initMsg, resolves on 'joined'
  _connectAndJoin(url, initMsg) {
    return new Promise((resolve, reject) => {
      this.disconnect();
      this.ws = new WebSocket(url);
      let settled = false;

      const settle = (fn) => {
        if (settled) return;
        settled = true;
        fn();
      };

      this.ws.onopen = () => this.send(initMsg);

      this.ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }

        if (msg.type === 'joined') {
          settle(() => {
            this.playerId   = msg.id;
            this.playerTeam = msg.team;
            this.isHost     = msg.isHost;
            resolve(msg);
          });
        } else if (msg.type === 'error') {
          settle(() => reject(new Error(msg.message)));
        }

        const h = this.handlers[msg.type];
        if (h) h(msg);
      };

      this.ws.onerror = () => settle(() => reject(new Error('Connection error')));
      this.ws.onclose = () => {
        settle(() => reject(new Error('Disconnected')));
        const h = this.handlers['disconnect'];
        if (h) h();
      };
    });
  }

  createRoom(url, playerName, roomName) {
    return this._connectAndJoin(url, { type: 'create_room', name: playerName, roomName });
  }

  joinRoom(url, playerName, roomId) {
    return this._connectAndJoin(url, { type: 'join_room', name: playerName, roomId });
  }

  on(type, handler) { this.handlers[type] = handler; }
  off(type)         { delete this.handlers[type]; }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect() {
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.playerId = null;
    this.handlers = {};
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
