// Reproducible edits of the verified CC0 HQ previews. Requires ffmpeg on PATH.
// node scripts/prepare-human-audio.js [directory containing gasp/breathing/heartbeat/siren.mp3]
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const source = resolve(process.argv[2] || 'artifacts/audio-source');
const clips = [
  ['gasp', .10, .62, 85, 8500, .008, .05, 'breath/gasp_male'],
  ['breathing', 2.75, 3.75, 100, 6500, .025, .12, 'breath/breath_male'],
  ['breathing', 4.05, 5.25, 100, 6500, .025, .12, 'breath/breath_male_2'],
  ['heartbeat', 2.50, 3.20, 28, 280, .012, .09, 'breath/heartbeat'],
  ['siren', 2, 14, 160, 2600, .04, .10, 'world/distant_siren'],
];
for (const [name, start, end, high, low, attack, release, output] of clips) {
  const duration = end - start;
  const filters = `atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,highpass=f=${high},lowpass=f=${low},afade=t=in:d=${attack},afade=t=out:st=${duration-release}:d=${release}`;
  const result = spawnSync('ffmpeg', ['-v','error','-i',resolve(source,`${name}.mp3`),
    '-af',filters,'-ac','1','-ar','44100','-f','f32le','pipe:1'], {maxBuffer:8*1024*1024});
  if (result.status !== 0) throw Error(result.stderr?.toString() || result.error);
  const pcm = result.stdout, frames = pcm.length / 4;
  let peak = 0;
  for(let i=0;i<frames;i++) peak=Math.max(peak,Math.abs(pcm.readFloatLE(i*4)));
  if (!Number.isFinite(peak) || peak < 1e-6) throw Error(`Invalid or silent ${name}`);
  // Peak -6 dBFS; the game's group/voice gains provide the final quiet mix.
  const scale = 10 ** (-6/20) / peak;
  const wav = Buffer.alloc(44 + frames*2);
  wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
  wav.write('data',36);wav.writeUInt32LE(frames*2,40);
  for(let i=0;i<frames;i++) wav.writeInt16LE(Math.round(pcm.readFloatLE(i*4)*scale*32767),44+i*2);
  const target=resolve('client/assets/audio/sfx',`${output}.wav`);
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,wav);
  console.log(`${output}: ${(frames/44100).toFixed(3)}s, peak -6 dBFS`);
}
