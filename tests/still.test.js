import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../shared/game.js";
import { CONFIG as C } from "../shared/config.js";
import { playerBodyParts } from "../shared/body.js";
import { distance } from "../shared/math.js";
const day = () => { const g = new Game(); g.phase('DAY'); return g; };
const advance = (g, seconds) => { for(let i=0;i<Math.round(seconds/.05);i++) g.tick(.05); };

test('idle settles automatically, movement wakes immediately, and night stays mobile', () => {
  const g=day(),p=g.state.players.killer;
  g.input('killer',{});advance(g,.5);assert.equal(p.still,false);
  advance(g,.15);assert.equal(p.still,true);assert.equal(p.holding,false);
  g.input('killer',{forward:1});assert.equal(p.still,false);
  advance(g,.1);assert.ok(p.moving);
  g.phase('NIGHT');g.input('killer',{});advance(g,1);assert.equal(p.still,false);
});

test('F attaches to ordinary wall faces without crossing walls and exits safely', () => {
  for (const [x,z] of [[0,-19],[-23,3],[23,3],[0,-12.3]]) {
    const g=day(),p=g.state.players.killer;Object.assign(p,{x,z});
    const target=g.nearestSpot();assert.equal(target.pose,'wall');
    g.action('killer','pose');advance(g,.35);
    assert.equal(p.pose,'wall');assert.ok(g.canStandAt(p.x,p.z));
    assert.ok(distance(p,target)<.001);g.leaveStill();assert.ok(g.canStandAt(p.x,p.z));
  }
});

test('E freezes arbitrary floor positions exactly, even beside an exhibit', () => {
  for (const [x,z] of [[0,-2],[4,0],[-13,5],[0,-3.5]]) {
    const g=day(), p=g.state.players.killer;
    Object.assign(p,{x,z,yaw:.8}); g.input('killer',{yaw:.8});
    g.action('killer','still');
    assert.equal(p.still,true); assert.equal(p.spotId,null); assert.equal(p.pose,'stand');
    g.input('killer',{yaw:2,pitch:.5,breath:true}); advance(g,.2);
    assert.equal(p.x,x);assert.equal(p.z,z);assert.equal(p.yaw,.8);assert.equal(p.holding,true);
    g.action('killer','still'); assert.equal(p.still,false); assert.equal(p.holding,false);
    assert.equal(p.x,x); assert.equal(p.z,z);
  }
});

test('movement wakes STILL, while an already held movement key must be released first', () => {
  const g=day(), p=g.state.players.killer;
  g.input('killer',{forward:1,yaw:0}); g.action('killer','still');
  advance(g,.2); assert.equal(p.still,true); assert.equal(p.z,-2);
  g.input('killer',{}); g.tick(.05); assert.equal(p.still,true);
  g.input('killer',{forward:1}); g.tick(.05); assert.equal(p.still,false); assert.ok(p.z < -2);
  g.action('killer','still');g.input('killer',{forward:1,strafe:1});g.tick(.05);
  assert.equal(p.still,false);
});

test('F blends a selected pose and its hit geometry, then exits to the approach side', () => {
  const g=day(),p=g.state.players.killer;
  Object.assign(p,{x:-4,z:6.5});g.action('killer','pose');
  assert.equal(p.spotId,2);assert.equal(p.z,6.5);assert.equal(p.poseMix,0);
  const start=playerBodyParts(p);
  advance(g,.15);
  assert.ok(p.z < 6.5 && p.z > 5);assert.ok(p.y>0 && p.y<.68);
  assert.ok(p.poseMix>0 && p.poseMix<1);
  const midpoint=playerBodyParts(p);assert.notEqual(midpoint[1].y,start[1].y);
  assert.ok(Number.isFinite(g.hitPlayer('killer',{x:p.x,y:p.y+midpoint[0].y,z:p.z+3},{x:0,y:0,z:-1})));
  advance(g,.2);assert.equal(p.z,5);assert.equal(p.y,.68);assert.equal(p.stillTransition,null);
  g.input('killer',{strafe:1});g.tick(.05);assert.equal(p.still,false);
  assert.equal(p.z,6.5);assert.ok(g.canStandAt(p.x,p.z));
});

test('pose preview and action reject walls, occupied destinations and invalid floors', () => {
  const g=day(),p=g.state.players.killer;
  Object.assign(p,{x:9.7,z:15}); // Opposite side of the wall from spot 11.
  assert.equal(g.nearestSpot().pose,'wall');
  g.action('killer','pose');advance(g,.35);assert.ok(p.x > 9);g.leaveStill();
  Object.assign(p,{x:0,z:-3.5});Object.assign(g.state.players.detective,{x:0,z:-5});
  assert.equal(g.nearestSpot(),undefined);g.action('killer','pose');assert.equal(p.still,false);
  Object.assign(p,{x:24,z:0});g.action('killer','still');assert.equal(p.still,false);
});

test('occupied return positions and interrupted transitions never leave a player inside solids', () => {
  const g=day(),p=g.state.players.killer;
  Object.assign(p,{x:0,z:-3.5});g.action('killer','pose');advance(g,.1);
  Object.assign(g.state.players.detective,{x:0,z:-3.5});
  g.action('killer','still');assert.equal(p.still,false);assert.ok(g.canStandAt(p.x,p.z));
  assert.ok(distance(p,g.state.players.detective)>=.51);
  const h=day(),k=h.state.players.killer;
  Object.assign(k,{x:-13,z:2.5});h.action('killer','pose');
  Object.assign(h.state.players.detective,{x:-13,z:1});advance(h,.35);
  assert.equal(k.still,false);assert.ok(h.canStandAt(k.x,k.z));
});

test('free STILL does not trip a motion watch until the actor moves', () => {
  const g=day(),p=g.state.players.killer;
  Object.assign(p,{x:0,z:-3.5});Object.assign(g.state.players.detective,{x:0,z:-2});
  g.action('detective','mark');g.action('killer','still');advance(g,.2);
  assert.equal(g.state.markData[0].triggeredAt,null);
  g.input('killer',{strafe:1});g.tick(.05);
  assert.notEqual(g.state.markData[0].triggeredAt,null);
});

test('free and exhibit STILL remain phase- and role-limited and reset cleanly', () => {
  const g=day();g.action('detective','pose');g.action('detective','still');
  assert.equal(g.state.players.detective.still,false);
  g.action('killer','still');g.phase('NIGHT');assert.equal(g.state.players.killer.still,false);
  for(const phase of ['SUNSET','NIGHT','GAME_OVER']) {
    const h=day();h.phase(phase);h.action('killer','still');h.action('killer','pose');
    assert.equal(h.state.players.killer.still,false);
  }
  g.reset();assert.equal(g.state.players.killer.stillTransition,null);
  assert.equal(g.state.players.killer.stillExit,null);assert.equal(g.state.players.killer.poseMix,1);
});
