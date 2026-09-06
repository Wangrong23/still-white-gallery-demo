export class Connection {
  constructor(onState, onMessage, translate = (key, message) => message || key, options = {}) {
    this.onState = onState;
    this.onMessage = onMessage;
    this.translate = translate;
    this.Socket = options.Socket || globalThis.WebSocket;
    this.url = options.url;
    try { this.storage = options.storage ?? globalThis.sessionStorage; } catch {}
    this.ws = null;
    this.role = null;
    this.room = null;
    this.session = null;
    this.reconnecting = false;
    this.retryTimer = null;
    this.generation = 0;
  }
  remember(session) {
    this.session = session;
    try {
      if (session) this.storage?.setItem('still.session.v1', JSON.stringify(session));
      else this.storage?.removeItem('still.session.v1');
    } catch { /* Live reconnection works even if reload recovery cannot be saved. */ }
  }
  resumeSaved() {
    let saved;
    try { saved = JSON.parse(this.storage?.getItem('still.session.v1') || 'null'); } catch {}
    if (!saved || !/^[A-F0-9]{6}$/.test(saved.code) || !/^[a-f0-9]{48}$/.test(saved.token)
      || !['detective', 'killer'].includes(saved.role)) { this.remember(null); return false; }
    this.session = saved;
    this.role = saved.role;
    this.room = saved.code;
    this.recover();
    return true;
  }
  connect(mode, role, code) {
    this.close();
    return this.open({ type: mode, role, code });
  }
  open(request) {
    return new Promise((resolve, reject) => {
      const ws = new this.Socket(this.url || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
      this.ws = ws;
      let settled = false;
      const fail = (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } };
      const timer = setTimeout(() => {
        fail(new Error(this.translate('timeout')));
        ws.close();
      }, this.reconnecting ? Math.max(1, Math.min(8000, this.deadline - Date.now())) : 8000);
      ws.onopen = () => {
        if (this.ws !== ws) return ws.close();
        ws.send(JSON.stringify(request));
      };
      ws.onmessage = (e) => {
        if (this.ws !== ws) return;
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'room') {
          settled = true;
          clearTimeout(timer);
          this.role = m.role;
          this.room = m.code;
          this.remember({ code: m.code, role: m.role, token: m.token, reconnectGraceMs: m.reconnectGraceMs });
          this.reconnecting = false;
          if (m.resumed) {
            this.onState(m.state);
            this.onMessage({ type: 'restored', started: m.started, active: m.active });
          }
          resolve(m);
        }
        if (m.type === 'peer-left') this.remember(null);
        if (m.type === 'state') this.onState(m.state);
        else this.onMessage(m);
        if (m.type === 'error' && !settled) {
          const error = new Error(this.translate('server', m.message));
          error.fatal = m.code === 'resume-expired';
          fail(error);
          ws.close();
        }
      };
      ws.onerror = () => fail(new Error(this.translate('connectFailed')));
      ws.onclose = (e) => {
        clearTimeout(timer);
        fail(new Error(this.translate('connectFailed')));
        if (this.ws !== ws) return;
        this.ws = null;
        if (e.reason === 'Session restored elsewhere') {
          this.remember(null);
          this.onMessage({ type: 'disconnected' });
        } else if (this.session && !this.reconnecting) this.recover();
      };
    });
  }
  recover() {
    if (!this.session || this.reconnecting) return;
    this.reconnecting = true;
    this.deadline = Date.now() + Math.min(30000, this.session.reconnectGraceMs || 30000);
    const generation = ++this.generation;
    let attempt = 0;
    const retry = async () => {
      if (generation !== this.generation || !this.session) return;
      this.onMessage({ type: 'reconnecting' });
      try {
        await this.open({ type: 'resume', code: this.session.code, role: this.session.role, token: this.session.token });
      } catch (error) {
        if (generation !== this.generation) return;
        const failed = this.ws;
        this.ws = null;
        failed?.close();
        if (error.fatal || Date.now() >= this.deadline) {
          this.reconnecting = false;
          this.remember(null);
          this.onMessage({ type: 'disconnected' });
          return;
        }
        const delay = Math.min(3000, 500 * 2 ** attempt++, Math.max(1, this.deadline - Date.now()));
        this.retryTimer = setTimeout(retry, delay);
      }
    };
    retry();
  }
  send(type, data = {}) {
    if (!this.reconnecting && this.ws?.readyState === 1)
      this.ws.send(JSON.stringify({ type, ...data }));
  }
  close() {
    ++this.generation;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.reconnecting = false;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'leave' }));
      ws.close();
    }
    this.remember(null);
    this.role = null;
    this.room = null;
  }
}
