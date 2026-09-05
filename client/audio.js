import { gaspAcoustics } from "./acoustics.js";

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.nextHeart = 0;
  }
  start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
      const size = this.ctx.sampleRate * 2,
        buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate),
        data = buffer.getChannelData(0);
      let n = 0;
      for (let i = 0; i < size; i++) {
        n = (n + (Math.random() * 2 - 1) * 0.015) / 1.015;
        data[i] = n;
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.11;
      source.connect(gain).connect(this.master);
      source.start();
    }
    this.ctx.resume();
  }
  tone(freq, duration, volume = 0.15, type = "sine", pan = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay,
      osc = this.ctx.createOscillator(),
      gain = this.ctx.createGain(),
      p = this.ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, freq * 0.65),
      t + duration,
    );
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    p.pan.value = pan;
    osc.connect(gain).connect(p).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }
  noise(duration, volume, pan = 0, frequency = 900) {
    if (!this.ctx || this.muted) return;
    const buffer = this.ctx.createBuffer(
      1,
      Math.ceil(this.ctx.sampleRate * duration),
      this.ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const s = this.ctx.createBufferSource(),
      g = this.ctx.createGain(),
      f = this.ctx.createBiquadFilter(),
      p = this.ctx.createStereoPanner();
    s.buffer = buffer;
    g.gain.value = volume;
    f.type = "lowpass";
    f.frequency.value = frequency;
    p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(this.master);
    s.start();
  }
  event(e, listener, role) {
    const distance =
      e.x === undefined ? 0 : Math.hypot(e.x - listener.x, e.z - listener.z);
    const vol = Math.max(0, 1 - distance / 18);
    const pan =
      e.x === undefined
        ? 0
        : Math.max(
            -1,
            Math.min(
              1,
              ((e.x - listener.x) * Math.cos(listener.yaw) -
                (e.z - listener.z) * Math.sin(listener.yaw)) /
                10,
            ),
          );
    if (e.type === "step" && vol > 0) {
      this.noise(0.07, vol * (e.role === "detective" ? 0.21 : 0.15), pan, 1200);
      this.tone(
        e.role === "detective" ? 85 : 125,
        0.055,
        vol * 0.12,
        "sine",
        pan,
      );
    }
    if (e.type === "shot") {
      this.noise(0.28, 0.9, pan, 7000);
      this.tone(72, 0.3, 0.5);
      this.noise(0.07, 0.25, -pan, 2500);
    }
    if (e.type === "gasp") {
      const { gain, frequency } = gaspAcoustics(e, listener);
      if (gain > 0) this.noise(0.7, gain * 0.25, pan, frequency);
    }
    if (e.type === "swipe") this.noise(0.18, 0.3, 0, 3000);
    if (e.type === "mark") this.tone(500, 0.07, 0.03);
    if (e.type === "mark-alert" && role === "detective") {
      this.tone(880, 0.13, 0.22);
      this.tone(660, 0.2, 0.18, "sine", 0, 0.16);
    }
    if (e.type === "shatter") this.noise(0.4, vol * 0.5, pan, 4800);
    if (e.type === "phase" && e.phase === "SUNSET") {
      for (let i = 0; i < 3; i++)
        this.tone(420 - i * 65, 1.2, 0.3, "sine", 0, i * 0.45);
      setTimeout(() => this.noise(0.12, 0.3, 0, 4000), 900);
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(
          "The gallery is now closed. Please proceed to the exit.",
        );
        u.lang = "en-US";
        u.rate = 0.8;
        u.pitch = 0.65;
        u.volume = 0.35;
        window.speechSynthesis.speak(u);
      }
    }
  }
  update(tension, time, night) {
    if (time < this.nextHeart) return;
    this.nextHeart = time + (night ? 0.8 : 1.45 - tension * 0.85);
    if (tension > 0.05 || night) {
      this.tone(53, 0.12, 0.1 + tension * 0.23);
      this.tone(46, 0.16, 0.07 + tension * 0.17, "sine", 0, 0.18);
    }
  }
}
