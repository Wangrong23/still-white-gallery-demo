import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioModel } from '../client/audio-model.js';
import { AudioDirector } from '../client/audio-director.js';
import { Game } from '../shared/game.js';
import { lateDayAt } from '../shared/sun.js';

const input = { phase: 'DAY', dayTime: 0, nightTime: 0, role: 'detective', inspecting: false,
  aiming: false, moving: true, holding: false, breath: 15 };
test('suspicion attacks and releases smoothly; idle observation stays restrained', () => {
  const model = new AudioModel();
  assert.ok(model.update({...input, inspecting:true}, .05).suspicion < .06);
  for (let i=0;i<80;i++) model.update({...input, inspecting:true}, .05);
  const peak=model.suspicion;
  assert.ok(peak>.6 && peak<.7);
  model.update(input,.05); assert.ok(model.suspicion>peak*.98);
  for (let i=0;i<600;i++) model.update({...input,moving:false},.05);
  assert.ok(model.suspicion <= .121);
});
test('detective music is identical for concealed killer and decoy, regardless of hidden coordinates/breath/target', () => {
  const a = new AudioDirector(), b = new AudioDirector();
  const g = new Game(); g.phase('DAY');
  const s = structuredClone(g.state);
  g.state.players.detective.inspectTarget = 'killer'; s.players.detective.inspectTarget = 'statue:3';
  Object.assign(g.state.players.killer,{x:1,z:1,holding:true,breath:1});
  Object.assign(s.players.killer,{x:21,z:-18,holding:false,breath:15});
  for(let i=0;i<72;i++) {
    // Even normal-breath inspection's differing progress rate must not alter music.
    g.state.players.detective.inspectProgress = .9;
    s.players.detective.inspectProgress = .2;
    a.updateState(g.state,'detective',{aim:true},.05);
    b.updateState(s,'detective',{aim:true},.05);
    assert.deepEqual(a.debugState,b.debugState);
  }
  g.phase('NIGHT'); s.phase='NIGHT';
  a.updateState(g.state,'detective',{},.05); b.updateState(s,'detective',{},.05);
  assert.deepEqual(a.debugState,b.debugState);
});
test('breath danger belongs only to killer; sunset and end-game cannot sustain normal music', () => {
  const m = new AudioModel();
  assert.equal(m.update({...input,holding:true,breath:0},.05).breathDanger,0);
  assert.equal(m.update({...input,role:'killer',holding:true,breath:3},.05).breathDanger,.8);
  assert.equal(m.update({...input,role:'killer',holding:false,breath:0},.05).breathDanger,0);
  for(const phase of ['PREPARATION','SUNSET','GAME_OVER']) assert.equal(m.update({...input,phase},.05).nightIntensity,0);
});
test('late day is shared with lighting and final night ten seconds remove layers in order', () => {
  assert.equal(lateDayAt(240),0); assert.equal(lateDayAt(300),1);
  const m = new AudioModel();
  const at = n => m.update({...input,phase:'NIGHT',nightTime:n},.05);
  assert.equal(at(35).percussion,1); assert.equal(at(38).percussion,0);
  assert.equal(at(40).drone,1); assert.equal(at(42).bass,0); assert.equal(at(42).drone,0);
});
test('snapshot one shots deduplicate and inaudible footsteps never drive music', () => {
  const a = new AudioDirector(); a.ctx={state:'running',currentTime:0};
  a.muted=true; // Avoid actual sound graph in this boundary test.
  a.event({id:1,type:'shot'},{x:0,z:0},'detective');
  a.model.heard=0; a.event({id:1,type:'shot'},{x:0,z:0},'detective');
  assert.equal(a.model.heard,0);
  a.event({id:2,type:'step',role:'killer',x:30,z:30},{x:0,z:0},'detective');
  assert.equal(a.model.heard,0);
  a.event({id:3,type:'step',role:'killer',x:1,z:0},{x:0,z:0},'detective');
  assert.ok(a.model.heard>0);
  a.model.heard=0; a.levels.sfx=0;
  a.event({id:4,type:'step',role:'killer',x:1,z:0},{x:0,z:0},'detective');
  assert.equal(a.model.heard,0);
});
test('full round, missing AudioContext and duplicate 20Hz snapshots are safe for both roles', () => {
  const game = new Game(), clients = [new AudioDirector(),new AudioDirector()];
  game.state.players.detective.z=3;
  const phases=new Set();
  while(game.state.phase!=='GAME_OVER') {
    game.tick(.05); const snapshot=structuredClone(game.state); phases.add(snapshot.phase);
    clients.forEach((a,i)=>{
      const role=i?'killer':'detective';
      a.updateState(snapshot,role,{},.05);
      for(let repeat=0;repeat<2;repeat++) for(const e of snapshot.events) a.event(e,snapshot.players[role],role);
    });
  }
  assert.deepEqual([...phases],['PREPARATION','DAY','SUNSET','NIGHT','GAME_OVER']);
  assert.equal(game.state.result,'SURVIVED');
  assert.equal(clients[0].eventId,clients[1].eventId);
});
