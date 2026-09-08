import { gaspAcoustics, spatialAcoustics } from "./acoustics.js";
import { SFX_MANIFEST } from './audio-manifest.js';

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.nextHeart = 0;
    this.samples = new Map();
    this.settings = { volume: 1, ambience: 1, voice: true };
    this.closingTimer = null;
    this.activeSources = new Set();
    this.variantIndex = new Map();
    this.announcementSource = null;
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
    try { this.announcementSource?.stop(); } catch { /* Already ended. */ }
    this.announcementSource = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }
  stop() {
    this.cancelAnnouncement();
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* Already ended. */ }
    }
    this.activeSources.clear();
    if (this.roomReverb) this.roomReverb.buffer = null;
    this.ctx?.suspend();
    this.nextHeart = 0;
  }
  track(source) {
    this.activeSources.add(source);
    source.addEventListener("ended", () => this.activeSources.delete(source), { once: true });
  }
  start() {
    if (!this.ctx) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return;
      this.ctx = new Context();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3 * this.settings.volume;
      this.master.connect(this.ctx.destination);
      this.roomReverb = this.ctx.createConvolver();
      this.roomReverb.normalize = false;
      this.roomReverb.connect(this.master);
      const samplePaths = { ...Object.fromEntries(
        ["heel", "heel-2", "heel-3", "revolver", "plaster", "plaster-2", "bell", "hall-ir", "closing-en"]
          .map(name => [name, `/client/assets/${name}.wav`])), ...SFX_MANIFEST };
      for (const [name, path] of Object.entries(samplePaths)) {
        fetch(path)
          .then((r) => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); })
          .then((data) => this.ctx.decodeAudioData(data))
          .then((buffer) => {
            if (name === "hall-ir") { this.roomImpulse = buffer; this.roomReverb.buffer = buffer; }
            else this.samples.set(name, buffer);
          })
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
    if (this.roomImpulse && !this.roomReverb.buffer) this.roomReverb.buffer = this.roomImpulse;
    this.ctx.resume().catch(() => { /* A later user gesture retries. */ });
  }
  variant(base, count) {
    const index = this.variantIndex.get(base) || 0;
    this.variantIndex.set(base, (index + 1) % count);
    const name = index ? `${base}-${index + 1}` : base;
    return this.samples.has(name) ? name : base;
  }
  sample(name, volume, pan = 0, rate = 1, frequency = 20000, options = {}) {
    if (!this.ctx || this.muted) return false;
    const buffer = this.samples.get(name);
    if (!buffer) return false;
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain(), p = this.ctx.createStereoPanner();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const start = this.ctx.currentTime, duration = buffer.duration / rate;
    const attack = Math.min(options.fadeIn ?? .004, duration / 2);
    const release = Math.min(options.fadeOut ?? .02, duration / 2);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.setValueAtTime(volume, start + duration - release);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    p.pan.value = pan;
    const voice = name.startsWith("closing-");
    let highpass, speaker;
    if (voice) {
      highpass = this.ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 340;
      speaker = this.ctx.createWaveShaper();
      this.speakerCurve ||= Float32Array.from({ length: 256 }, (_, i) => Math.tanh((i / 127.5 - 1) * 1.8) / Math.tanh(1.8));
      speaker.curve = this.speakerCurve;
      source.connect(highpass).connect(speaker).connect(filter);
      this.announcementSource = source;
    } else source.connect(filter);
    filter.connect(gain).connect(p).connect(this.sfx || this.master);
    // Reflections follow the same distance/occlusion gain as the direct sound.
    const reflection = this.ctx.createGain();
    reflection.gain.value = options.reverb ?? (name.startsWith("heel") ? .055 : voice ? .12 : .16);
    if (this.roomReverb?.buffer) p.connect(reflection).connect(this.roomReverb);
    source.onended = () => {
      source.disconnect(); filter.disconnect(); gain.disconnect(); p.disconnect(); reflection.disconnect();
      highpass?.disconnect(); speaker?.disconnect();
      if (this.announcementSource === source) this.announcementSource = null;
    };
    this.track(source);
    source.start(start);
    // Local breath can be stopped on holding without a discontinuity/click.
    source.fadeOut = (seconds = .035) => {
      const now = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + seconds);
      source.stop(now + seconds);
    };
    return source;
  }
  tone(freq, duration, volume = 0.15, type = "sine", pan = 0, delay = 0, output = this.sfx || this.master) {
    if (!this.ctx || this.muted || volume <= 0) return;
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
    osc.connect(gain).connect(p).connect(output);
    osc.start(t);
    this.track(osc);
    osc.stop(t + duration + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); p.disconnect(); };
  }
  noise(duration, volume, pan = 0, frequency = 900) {
    if (!this.ctx || this.muted) return;
    this.noiseBuffers ||= new Map();
    const key = duration;
    let buffer = this.noiseBuffers.get(key);
    if (!buffer) {
      buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * duration), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      this.noiseBuffers.set(key, buffer);
    }
    const s = this.ctx.createBufferSource(),
      g = this.ctx.createGain(),
      f = this.ctx.createBiquadFilter(),
      p = this.ctx.createStereoPanner();
    s.buffer = buffer;
    g.gain.value = volume;
    f.type = "lowpass";
    f.frequency.value = frequency;
    p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(this.sfx || this.master);
    s.start();
    this.track(s);
    s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); p.disconnect(); };
    return s;
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
      if (this.sample(this.variant("heel", 3), step.gain * (e.role === "detective" ? .28 : .19), step.pan,
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
      if (gasp.gain > 0 && !this.sample('gasp', gasp.gain * .30, gasp.pan, 1, gasp.frequency, { reverb: .055 }))
        this.noise(0.7, gasp.gain * 0.25, gasp.pan, gasp.frequency);
    }
    if (e.type === "swipe") this.noise(0.18, 0.3, 0, 3000);
    if (e.type === "shatter" && !this.sample(this.variant("plaster", 2), vol * .5, pan)) this.noise(0.4, vol * 0.5, pan, 4800);
  }

  announce() {
    if (this.muted || !this.settings.voice) return;
    if (this.sample("closing-en", .5, 0, 1, 2600)) return;
  }

}
