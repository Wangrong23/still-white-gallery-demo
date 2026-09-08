import { Sound } from './audio.js';
import { AudioModel } from './audio-model.js';
import { MusicDirector, automate } from './music-director.js';
import { AUDIO_LEVELS } from './audio-manifest.js';
import { spatialAcoustics, gaspAcoustics } from './acoustics.js';
import { CONFIG as C } from '../shared/config.js';

export class AudioDirector extends Sound {
  constructor() {
    super();
    this.levels = { ...AUDIO_LEVELS };
    this.model = new AudioModel();
    this.reset();
  }
  reset(eventId = 0, phase = null) {
    this.cancelAnnouncement();
    for (const source of this.activeSources) { try { source.stop(); } catch {} }
    this.activeSources.clear();
    this.model.reset();
    this.eventId = eventId; this.phase = phase; this.cues = new Set();
    this.lastElapsed = -1; this.lastRole = null;
    this.shotUntil = 0; this.vacuumUntil = 0; this.penaltyAt = 0;
    this.nextHeart = 0; this.nextBreath = 0; this.supportPlayed = false;
    if (this.musicGate) automate(this.musicGate.gain, 0, this.ctx, .08);
  }
  // Called only by explicit PLAY/HOST/JOIN/resume/canvas gestures.
  ensureAudioStarted() {
    if (globalThis.navigator?.userActivation && !navigator.userActivation.isActive) return;
    super.start();
    if (!this.ctx || this.music) return;
    const ctx = this.ctx;
    this.master.disconnect();
    this.peakMeter = ctx.createAnalyser(); this.peakMeter.fftSize = 1024;
    this.peakData = new Float32Array(1024); this.peak = 0;
    this.limiter = ctx.createDynamicsCompressor();
    Object.assign(this.limiter.threshold, { value: -3 });
    this.limiter.knee.value = 3; this.limiter.ratio.value = 4;
    this.limiter.attack.value = .003; this.limiter.release.value = .2;
    this.master.connect(this.peakMeter).connect(this.limiter).connect(ctx.destination);
    this.buses = {};
    for (const name of ['music', 'ambience', 'sfx', 'ui']) {
      const gain = ctx.createGain(); gain.gain.value = this.levels[name];
      gain.connect(this.master); this.buses[name] = gain;
    }
    this.sfx = this.buses.sfx;
    this.roomReverb.disconnect(); this.roomReverb.connect(this.sfx);
    this.ambience.disconnect();
    this.airFilter = ctx.createBiquadFilter(); this.airFilter.frequency.value = 4000;
    this.ambience.connect(this.airFilter).connect(this.buses.ambience);
    this.musicGate = ctx.createGain(); this.musicGate.gain.value = 0;
    this.musicDuck = ctx.createGain();
    this.musicGate.connect(this.musicDuck).connect(this.buses.music);
    this.music = new MusicDirector(this, this.musicGate);
    this.tinnitus = ctx.createOscillator(); this.earGain = ctx.createGain();
    this.tinnitus.frequency.value = 3100; this.earGain.gain.value = 0;
    this.tinnitus.connect(this.earGain).connect(this.sfx); this.tinnitus.start();
  }
  start() { this.ensureAudioStarted(); }
  stop() { this.reset(); super.stop(); }
  configure(settings) {
    super.configure(settings);
    if (this.ambience) this.ambience.gain._target = undefined;
    if (this.ctx) automate(this.master.gain, .3 * settings.volume * this.levels.master, this.ctx);
  }
  mute(group) {
    if (!(group in this.levels)) return;
    this.levels[group] = this.levels[group] ? 0 : AUDIO_LEVELS[group];
    if (group === 'master') this.configure(this.settings);
    else if (this.buses) automate(this.buses[group].gain, this.levels[group], this.ctx, .03);
  }
  event(e, listener, role) {
    if (e.id != null) {
      if (e.id <= this.eventId) return;
      this.eventId = e.id;
    }
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (e.type === 'shot') { this.shotUntil = now + .4; this.model.hear(.8); }
    if (e.type === 'penalty') { this.vacuumUntil = now + .48; this.penaltyAt = now + .48; }
    if (e.type === 'gasp' && role === 'killer') {
      this.stopLocalBreath();
      this.nextBreath = now + 1.2;
    }
    if (e.type === 'step' && e.role !== role || e.type === 'gasp') {
      const acoustic = e.type === 'gasp' ? gaspAcoustics(e, listener) : spatialAcoustics(e, listener);
      // Same distance/occlusion as the SFX, and muted SFX cannot be a music radar.
      if (this.levels.sfx && this.settings.volume && acoustic.gain > .08)
        this.model.hear(acoustic.gain * .65);
    }
    if (e.type === 'swipe') this.model.hear(.35);
    // Phase one-shots use authoritative state below, not repeated snapshot events.
    if (e.type !== 'phase') super.event(e, listener, role);
  }
  once(key, fn) { if (!this.cues.has(key)) { this.cues.add(key); fn(); } }
  stopLocalBreath() {
    try { if (this.selfBreath?.fadeOut) this.selfBreath.fadeOut(); else this.selfBreath?.stop(); } catch {}
    this.selfBreath = null;
  }
  support() {
    if (this.supportPlayed || !this.ctx) return;
    this.supportPlayed = true;
    if (this.sample('siren', .10, -.15, 1, 1400, { fadeIn: 4, fadeOut: 3, reverb: 0 })) return;
    const ctx = this.ctx, source = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    filter.frequency.value = 700; gain.gain.value = 0;
    const t = ctx.currentTime;
    for (let i = 0; i <= 12; i++) source.frequency.linearRampToValueAtTime(i % 2 ? 590 : 410, t + i * .7);
    gain.gain.linearRampToValueAtTime(.055, t + 4);
    gain.gain.linearRampToValueAtTime(0, t + 9);
    source.connect(filter).connect(gain).connect(this.sfx); source.start(); source.stop(t + 9);
    this.track(source); source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  updateState(state, role, controls, dt, active = true) {
    if (state.elapsed < this.lastElapsed) this.reset();
    this.lastElapsed = state.elapsed;
    if (this.lastRole !== role) { this.model.reset(); this.lastRole = role; }
    const p = state.players[role];
    const v = this.model.update({ phase: state.phase, dayTime: state.dayTime, nightTime: state.nightTime,
      role, inspecting: role === 'detective' && p.inspectProgress > 0, aiming: controls.aim,
      moving: p.moving, holding: p.holding, breath: p.breath }, active ? dt : 0);
    this.debugState = v;
    if (!this.music || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.phase !== state.phase) {
      const previous = this.phase;
      this.phase = state.phase; this.cues.clear(); this.cancelAnnouncement();
      if (state.phase === 'DAY' && previous === 'PREPARATION') {
        this.noise(.045, .09, 0, 1900); this.tone(110, .4, .04);
      }
      if (state.phase === 'GAME_OVER') {
        if (state.result === 'SURVIVED') this.support();
        if (state.result === 'FOUND YOU') {
          this.noise(.16, .2, 0, 750); this.tone(38, 1.2, .09);
        }
      }
    }
    const normal = ['DAY', 'NIGHT'].includes(state.phase) && active;
    if (v.holding || !normal) this.stopLocalBreath();
    automate(this.musicGate.gain, normal ? 1 : 0, this.ctx, normal ? .35 : .1);
    automate(this.musicDuck.gain, now < this.vacuumUntil ? 0 : now < this.shotUntil ? .28 : v.inspecting ? .71 : 1,
      this.ctx, now < this.vacuumUntil || now < this.shotUntil ? .035 : .4);
    const air = !active ? 0 : state.phase === 'SUNSET' ? .09 * Math.max(0, 1 - state.phaseTime / C.sunsetDuration)
      : state.phase === 'GAME_OVER' ? .07 : now < this.vacuumUntil ? .025 : 1 - .28 * v.breathDanger - .22 * Number(v.inspecting);
    automate(this.ambience.gain, .11 * this.settings.ambience * air, this.ctx, .1);
    automate(this.airFilter.frequency, v.holding ? 650 : v.inspecting ? 1300 : 4000, this.ctx, .4);
    automate(this.earGain.gain, active && normal && v.holding ? .009 * Math.max(0, (v.breathDanger - .8) / .2) : 0, this.ctx, .15);
    this.music.update(v, state.elapsed, active);
    if (!active) return;
    if (state.phase === 'PREPARATION') {
      const remaining = Math.ceil(C.preparationDuration - state.phaseTime);
      if (remaining <= 3 && remaining > 0) this.once(`prep${remaining}`, () => this.tone(310, .65, .025));
    }
    if (state.phase === 'SUNSET') {
      for (const [time, key] of [[.45, 'bell'], [.8, 'light1'], [1.2, 'light2'], [1.6, 'light3']]) {
        if (state.phaseTime >= time) this.once(key, () => {
          // No catch-up burst when joining/reconnecting late in the transition.
          if (state.phaseTime - time > .2) return;
          if (key === 'bell') { if (!this.sample('bell', .085)) this.tone(420, .7, .05); }
          else this.noise(.045, .045, key === 'light1' ? -.5 : .5, 1600);
        });
      }
    }
    if (this.penaltyAt && now >= this.penaltyAt) {
      this.penaltyAt = 0; this.tone(135, .13, .035); this.tone(82, .22, .03, 'triangle', 0, .12);
    }
    if (normal && v.holding && v.breathDanger > .08 && now >= this.nextHeart) {
      this.nextHeart = now + 1.25 - .55 * v.breathDanger;
      if (!this.sample('heartbeat', .03 + .38 * v.breathDanger ** 3, 0, 1, 240, { reverb: 0 })) {
        const level = .015 + .19 * v.breathDanger ** 3;
        this.tone(53, .12, level); this.tone(46, .15, level * .65, 'sine', 0, .18);
      }
    }
    if (normal && !v.holding && now >= this.nextBreath && (role === 'killer' || v.inspecting || v.moving)) {
      this.nextBreath = now + (v.moving ? 1.65 : 3.4);
      this.selfBreath = this.sample(this.variant('breath', 2), v.inspecting ? .055 : v.moving ? .07 : .025,
        0, 1, 2800, { reverb: 0 }) || this.noise(.65, v.inspecting ? .018 : v.moving ? .025 : .01, 0, 650);
    }
  }
  debugText() {
    const v = this.debugState;
    if (this.peakMeter) {
      this.peakMeter.getFloatTimeDomainData(this.peakData);
      for (const n of this.peakData) this.peak = Math.max(this.peak, Math.abs(n));
    }
    return v ? `\nAUDIO ${v.phase} / ${this.ctx?.state || 'awaiting gesture'}\nDAY PROGRESS ${v.dayProgress.toFixed(2)}  LATE ${v.late.toFixed(2)}\nSUSPICION ${v.suspicion.toFixed(2)}  BREATH DANGER ${v.breathDanger.toFixed(2)}\nNIGHT INTENSITY ${v.nightIntensity.toFixed(2)}\n${Object.entries(this.levels).map(([k, n]) => `${k.toUpperCase()} ${n.toFixed(2)}`).join('  ')}\nMUSIC GATE ${(this.musicGate?.gain.value || 0).toFixed(3)}  PEAK ${(this.peak || 0).toFixed(3)}\nASSETS ${JSON.stringify(this.music?.loaded || {})}  VOICES ${this.activeSources.size}` : '';
  }
}
