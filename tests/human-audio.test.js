import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SFX_MANIFEST } from '../client/audio-manifest.js';
import { Sound } from '../client/audio.js';
import { AudioDirector } from '../client/audio-director.js';
import { gaspAcoustics } from '../client/acoustics.js';

test('imported effect edits are mono PCM, bounded in length, faded and leave 6dB headroom',()=>{
  for(const path of Object.values(SFX_MANIFEST)) {
    const wav=readFileSync(new URL(`..${path}`,import.meta.url));
    assert.equal(wav.toString('ascii',0,4),'RIFF');
    assert.equal(wav.readUInt16LE(20),1);assert.equal(wav.readUInt16LE(22),1);
    assert.equal(wav.readUInt32LE(24),44100);assert.equal(wav.readUInt16LE(34),16);
    const duration=(wav.length-44)/88200;
    assert.ok(duration>=.5 && duration<=12);
    let peak=0;
    for(let i=44;i<wav.length;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));
    assert.ok(peak>16000 && peak<16500);
    assert.ok(Math.abs(wav.readInt16LE(44))<100);
    assert.ok(Math.abs(wav.readInt16LE(wav.length-2))<100);
  }
});
test('gasp sample uses the existing world attenuation/pan/filter and only falls back when absent',()=>{
  const a=new Sound(), calls=[];
  a.sample=(...args)=>{calls.push(args);return {};};
  a.noise=()=>{throw Error('unexpected synthesized gasp');};
  const event={type:'gasp',x:2,y:1.63,z:0}, listener={x:0,z:0,yaw:0};
  const acoustic=gaspAcoustics(event,listener);
  a.event(event,listener,'detective');
  assert.equal(calls[0][0],'gasp');assert.equal(calls[0][1],acoustic.gain*.30);
  assert.equal(calls[0][2],acoustic.pan);assert.equal(calls[0][4],acoustic.frequency);
  a.event({...event,x:30},listener,'detective');assert.equal(calls.length,1);
  let fallback=0;a.sample=()=>false;a.noise=()=>fallback++;
  a.event(event,listener,'detective');assert.equal(fallback,1);
});
test('recorded exhaustion stops local breathing, delays the next breath, and deduplicates',()=>{
  const a=new AudioDirector();a.ctx={currentTime:5,state:'running'};
  let fades=0,gasps=0;a.selfBreath={fadeOut(){fades++;}};
  a.sample=()=>{gasps++;return {};};
  const event={id:1,type:'gasp',x:0,z:0};
  a.event(event,{x:0,z:0},'killer');a.event(event,{x:0,z:0},'killer');
  assert.equal(fades,1);assert.equal(gasps,1);assert.equal(a.nextBreath,6.2);
  assert.equal(a.selfBreath,null);
});
