export class Connection {
  constructor(onState, onMessage) {
    this.onState = onState;
    this.onMessage = onMessage;
    this.ws = null;
    this.role = null;
    this.room = null;
  }
  connect(mode, role, code) {
    this.close();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
      );
      this.ws = ws;
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("连接超时，请确认服务器正在运行。"));
      }, 8000);
      ws.onopen = () => ws.send(JSON.stringify({ type: mode, role, code }));
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === "room") {
          clearTimeout(timer);
          this.role = m.role;
          this.room = m.code;
          resolve(m);
        }
        if (m.type === "state") this.onState(m.state);
        else this.onMessage(m);
        if (m.type === "error") {
          clearTimeout(timer);
          reject(new Error(m.message));
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("无法连接双人服务器。请刷新后重试。"));
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (this.ws === ws) this.onMessage({ type: "disconnected" });
      };
    });
  }
  send(type, data = {}) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ type, ...data }));
  }
  close() {
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onclose = null;
      ws.close();
    }
    this.role = null;
    this.room = null;
  }
}
