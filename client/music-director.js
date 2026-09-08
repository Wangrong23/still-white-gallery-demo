import { AUDIO_MANIFEST } from './audio-manifest.js';

export function automate(param, value, ctx, seconds = .3) {
  if (param._target === value) return;
  param._target = value;
  param.cancelScheduledValues(ctx.currentTime);
  param.setValueAtTime(param.value, ctx.currentTime);
  param.linearRampToValueAtTime(value, ctx.currentTime + seconds);
}

export class MusicDirector {
  constructor(sound, output, manifest = AUDIO_MANIFEST) {
    this.sound = sound;
    this.ctx = sound.ctx;
    this.output = output;
    this.layers = {};
    this.nextBeat = 0;
    this.beat = 0;
    this.loaded = {};
    for (const name of ['day', 'night', 'tension']) this.layer(name);
    this.loop('day', this.fallbackJazz());
    this.loop('night', this.drone(49));
    this.loop('tension', this.drone(55));
    for (const [name, url] of Object.entries(manifest)) {
      fetch(url).then(r => { if (!r.ok) throw Error(r.status); return r.arrayBuffer(); })
        .then(data => this.ctx.decodeAudioData(data)).then(buffer => {
          // Replace at zero crossing of the layer envelope, never start a second bed.
          this.layers[name].pending = buffer;
          this.loaded[name] = true;
        }).catch(() => { this.loaded[name] = false; });
    }
  }
  dispose() {
    for (const layer of Object.values(this.layers)) {
      layer.source.stop(); layer.source.disconnect(); layer.filter.disconnect(); layer.gain.disconnect();
    }
  }
  layer(name) {
    const gain = this.ctx.createGain(), filter = this.ctx.createBiquadFilter();
    gain.gain.value = 0;
    filter.type = 'lowpass'; filter.frequency.value = 4000;
    filter.connect(gain).connect(this.output);
    this.layers[name] = { gain, filter };
  }
  loop(name, buffer) {
    const layer = this.layers[name];
    layer.source?.stop(); layer.source?.disconnect();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer; source.loop = true;
    source.connect(layer.filter); source.start(); layer.source = source;
  }
  drone(frequency) {
    const rate = this.ctx.sampleRate, buffer = this.ctx.createBuffer(1, rate * 4, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      data[i] = .22 * Math.sin(2 * Math.PI * frequency * t)
        + .07 * Math.sin(2 * Math.PI * (frequency * 1.5 + .25) * t);
    }
    return buffer;
  }
  fallbackJazz() {
    const rate = this.ctx.sampleRate, buffer = this.ctx.createBuffer(1, rate * 32, rate);
    const data = buffer.getChannelData(0);
    // Sparse 60 BPM electric-piano/bass placeholder; long rests, no percussion loop.
    for (const [start, midi] of [[0,38],[2,57],[3,64],[8,41],[11,60],[17,36],[20,55],[23,62],[27,43]]) {
      const f = 440 * 2 ** ((midi - 69) / 12);
      for (let i = 0; i < rate * 4; i++) {
        const t = i / rate;
        data[start * rate + i] += .17 * Math.min(1, t * 120) * Math.exp(-t * 1.5)
          * (Math.sin(2 * Math.PI * f * t) + .12 * Math.sin(2 * Math.PI * f * 3 * t));
      }
    }
    return buffer;
  }
  update(v, elapsed, active) {
    const { ctx, layers } = this;
    for (const [name, layer] of Object.entries(layers)) {
      if (layer.pending && !layer.replaceAt) {
        layer.replaceAt = ctx.currentTime + .16;
        automate(layer.gain.gain, 0, ctx, .15);
      }
      if (layer.pending && ctx.currentTime >= layer.replaceAt) {
        this.loop(name, layer.pending); layer.pending = null;
        layer.replaceAt = 0;
      }
    }
    const day = active && v.phase === 'DAY', night = active && v.phase === 'NIGHT';
    // Stereo mix: reduce its gain/bandwidth, never pretend to isolate instruments.
    const space = .48 + .52 * (.5 + .5 * Math.sin(elapsed * Math.PI / 21)) ** 2;
    automate(layers.day.gain.gain, day && !layers.day.replaceAt ? .21 * space * (1 - .98 * v.late) : 0, ctx, day ? 1.5 : .08);
    automate(layers.day.filter.frequency, (350 + 3650 * (1 - v.late) ** 2) * (v.inspecting ? .75 : 1), ctx, .5);
    automate(layers.tension.gain.gain, day ? .075 * v.suspicion + .12 * v.late : 0, ctx, day ? .8 : .08);
    automate(layers.night.gain.gain, night && !layers.night.replaceAt ? (.12 + v.nightIntensity * .07) * v.drone : 0, ctx, night ? .5 : .08);
    automate(layers.night.filter.frequency, 1100, ctx);
    if (!night) { this.nextBeat = ctx.currentTime; this.beat = 0; return; }
    if (ctx.currentTime >= this.nextBeat) {
      this.nextBeat = ctx.currentTime + 60 / 96;
      this.sound.tone(49, .24, (.10 + .06 * v.nightIntensity) * v.bass, 'sine', 0, 0, this.output);
      if (this.beat++ % 2 === 0 && v.percussion > 0)
        this.sound.tone(220, .045, .018 * v.percussion, 'triangle', -.15, 0, this.output);
    }
  }
}
