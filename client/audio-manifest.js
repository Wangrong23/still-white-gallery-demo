// Decoded once per AudioContext. Null paths use the procedural voice, without 404s.
export const AUDIO_LEVELS = Object.freeze({ master: 1, music: .55, ambience: .7, sfx: .9, ui: .7 });
export const AUDIO_MANIFEST = Object.freeze({
  day: '/client/assets/audio/music/day/day_noir_moil.mp3',
  night: '/client/assets/audio/music/night/night_ambient_horror.ogg',
});
export const SFX_MANIFEST = Object.freeze({
  gasp: '/client/assets/audio/sfx/breath/gasp_male.wav',
  breath: '/client/assets/audio/sfx/breath/breath_male.wav',
  'breath-2': '/client/assets/audio/sfx/breath/breath_male_2.wav',
  heartbeat: '/client/assets/audio/sfx/breath/heartbeat.wav',
  siren: '/client/assets/audio/sfx/world/distant_siren.wav',
});
