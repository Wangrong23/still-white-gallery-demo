import { gaspAcoustics, spatialAcoustics } from "./acoustics.js";

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.nextHeart = 0;
    this.samples = new Map();
    this.settings = { volume: 1, ambience: 1, voice: true };
    this.closingTimer = null;
    this.activeSources = new Set();
  }
  configure(settings) {
    this.settings = settings;
    this.muted = settings.volume === 0;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(.3 * settings.volume, this.ctx.currentTime, .03);
      this.ambience.gain.setTargetAtTime(.11 * settings.ambience, this.ctx.currentTime, .03);
    }
    // TTS is outside the Web Audio graph; cancel speech when its settings change.
    this.cancelAnnouncement();
  }
  cancelAnnouncement() {
    clearTimeout(this.closingTimer);
    this.closingTimer = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }
  stop() {
    this.cancelAnnouncement();
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* Already ended. */ }
    }
    this.activeSources.clear();
    this.ctx?.suspend();
    this.nextHeart = 0;
  }
  track(source) {
    this.activeSources.add(source);
    source.addEventListener("ended", () => this.activeSources.delete(source), { once: true });
  }
  start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3 * this.settings.volume;
      this.master.connect(this.ctx.destination);
      for (const name of ["heel", "revolver", "plaster", "bell"]) {
        fetch(`/client/assets/${name}.wav`)
          .then((r) => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); })
          .then((data) => this.ctx.decodeAudioData(data))
          .then((buffer) => this.samples.set(name, buffer))
          .catch(() => { /* Procedural fallback remains available offline. */ });
      }
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
      this.ambience = gain;
      gain.gain.value = 0.11 * this.settings.ambience;
      source.connect(gain).connect(this.master);
      source.start();
    }
    this.ctx.resume();
  }
  sample(name, volume, pan = 0, rate = 1, frequency = 20000) {
    if (!this.ctx || this.muted) return false;
    const buffer = this.samples.get(name);
    if (!buffer) return false;
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain(), p = this.ctx.createStereoPanner();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    p.pan.value = pan;
    source.connect(filter).connect(gain).connect(p).connect(this.master);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); p.disconnect(); };
    this.track(source);
    source.start();
    return true;
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
    this.track(osc);
    osc.stop(t + duration + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); p.disconnect(); };
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
    this.track(s);
    s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); p.disconnect(); };
  }
  event(e, listener, role) {
    if (this.muted) return;
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
      const step = spatialAcoustics(e, listener);
      if (!step.gain) return;
      if (this.sample("heel", step.gain * (e.role === "detective" ? .28 : .19), step.pan,
        .94 + Math.random() * .12, step.frequency)) return;
      this.noise(0.07, step.gain * (e.role === "detective" ? 0.21 : 0.15), step.pan, step.frequency);
      this.tone(
        e.role === "detective" ? 85 : 125,
        0.055,
        step.gain * 0.12,
        "sine",
        step.pan,
      );
    }
    if (e.type === "shot") {
      if (this.sample("revolver", .85, pan)) return;
      this.noise(0.28, 0.9, pan, 7000);
      this.tone(72, 0.3, 0.5);
      this.noise(0.07, 0.25, -pan, 2500);
    }
    if (e.type === "gasp") {
      const gasp = gaspAcoustics(e, listener);
      if (gasp.gain > 0) this.noise(0.7, gasp.gain * 0.25, gasp.pan, gasp.frequency);
    }
    if (e.type === "swipe") this.noise(0.18, 0.3, 0, 3000);
    if (e.type === "mark") this.tone(500, 0.07, 0.03);
    if (e.type === "mark-alert" && role === "detective") {
      this.tone(880, 0.13, 0.22);
      this.tone(660, 0.2, 0.18, "sine", 0, 0.16);
    }
    if (e.type === "shatter" && !this.sample("plaster", vol * .5, pan)) this.noise(0.4, vol * 0.5, pan, 4800);
    if (e.type === "phase" && e.phase === "SUNSET") {
      if (!this.sample("bell", .4)) for (let i = 0; i < 3; i++)
        this.tone(420 - i * 65, 1.2, 0.3, "sine", 0, i * 0.45);
      this.cancelAnnouncement();
      this.closingTimer = setTimeout(() => { this.closingTimer = null; this.noise(0.12, 0.3, 0, 4000); }, 900);
      if (this.settings.voice && "speechSynthesis" in window) {
        const chinese = localStorage.getItem("still.language") !== "en";
        const u = new SpeechSynthesisUtterance(
          chinese ? "展馆即将闭馆。请前往出口。" : "The gallery is now closed. Please proceed to the exit.",
        );
        u.lang = chinese ? "zh-CN" : "en-US";
        u.rate = 0.8;
        u.pitch = 0.65;
        u.volume = 0.35 * this.settings.volume;
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
