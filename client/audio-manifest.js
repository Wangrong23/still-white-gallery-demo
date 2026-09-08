// Decoded once per AudioContext. Null paths use the procedural voice, without 404s.
export const AUDIO_LEVELS = Object.freeze({ master: 1, music: .55, ambience: .7, sfx: .9, ui: .7 });
export const AUDIO_MANIFEST = Object.freeze({
  day: '/client/assets/audio/music/day/day_noir_moil.mp3',
  night: '/client/assets/audio/music/night/night_ambient_horror.ogg',
});
