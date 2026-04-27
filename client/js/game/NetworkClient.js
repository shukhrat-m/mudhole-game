export default class NetworkClient {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.playerId = null;
    this.playerTeam = null;
    this.isHost = false;
    this.playerName = '';
  }

  connect(url, name) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.send({ type: 'join', name });
      };

      this.ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }

        if (msg.type === 'joined') {
          this.playerId  = msg.id;
          this.playerTeam = msg.team;
          this.isHost    = msg.isHost;
          resolve(msg);
        }

        if (msg.type === 'error') reject(new Error(msg.message));

        const h = this.handlers[msg.type];
        if (h) h(msg);
      };

      this.ws.onerror = () => reject(new Error('Connection error'));
      this.ws.onclose = () => {
        const h = this.handlers['disconnect'];
        if (h) h();
      };
    });
  }

  on(type, handler) {
    this.handlers[type] = handler;
  }

  off(type) {
    delete this.handlers[type];
  }

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
