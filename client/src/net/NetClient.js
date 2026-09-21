const RECONNECT_DELAY = 1500;

function resolveServerUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('server')) return params.get('server');
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  // Local dev runs the client (vite) and server on separate ports; a real deploy
  // serves both from the same origin, so the WS connection just reuses window.location.host.
  return isLocalDev ? `${proto}://${window.location.hostname}:4176` : `${proto}://${window.location.host}`;
}

export class NetClient {
  constructor() {
    this.ws = null;
    this.id = null;
    this.world = null;
    this.walls = null;
    this.tickRate = 30;
    this.connected = false;
    this.name = 'Marine';
    this.cls = 'marine';
    this.levelId = 1;

    this.onWelcome = null;
    this.onState = null;
    this.onDisconnect = null;
    this.onGameOver = null;
    this.onVictory = null;

    this.intentionalDisconnect = false;
    this._seq = 0;
  }

  // If the socket is already open (e.g. rejoining after a team wipe), reuse it —
  // the server keeps the same player id and just re-marks them as joined.
  connect(name, cls, levelId) {
    this.name = name || this.name;
    this.cls = cls || this.cls;
    this.levelId = levelId || this.levelId;
    this.intentionalDisconnect = false;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendJoin();
      return;
    }

    const url = resolveServerUrl();
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      this.sendJoin();
    };

    this.ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        this.id = msg.id;
        this.world = msg.world;
        this.walls = msg.walls;
        this.tickRate = msg.tickRate;
        if (this.onWelcome) this.onWelcome(msg);
      } else if (msg.t === 'state') {
        if (this.onState) this.onState(msg);
      } else if (msg.t === 'gameOver') {
        if (this.onGameOver) this.onGameOver();
      } else if (msg.t === 'victory') {
        if (this.onVictory) this.onVictory();
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      if (this.onDisconnect) this.onDisconnect();
      if (!this.intentionalDisconnect) {
        setTimeout(() => this.connect(this.name, this.cls, this.levelId), RECONNECT_DELAY);
      }
    };

    this.ws.onerror = () => {
      this.ws.close();
    };
  }

  disconnect() {
    if (this.ws) {
      this.intentionalDisconnect = true;
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  sendJoin() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ t: 'join', name: this.name, cls: this.cls, levelId: this.levelId }));
  }

  sendInput(moveX, moveZ, angle, firing, hacking) {
    if (!this.connected || this.ws.readyState !== 1) return null;
    const seq = ++this._seq;
    this.ws.send(JSON.stringify({ t: 'input', seq, moveX, moveZ, angle, firing, hacking }));
    return seq;
  }

  sendAbility() {
    if (!this.connected || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ t: 'ability' }));
  }

  sendGrenade() {
    if (!this.connected || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify({ t: 'grenade' }));
  }
}

export const net = new NetClient();
