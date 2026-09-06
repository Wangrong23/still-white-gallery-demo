import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket, WebSocketServer } from 'ws';
import { createApp } from '../server/index.js';
import { Connection } from '../client/network.js';
import { MovementPrediction } from '../client/prediction.js';
import { Game } from '../shared/game.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i=0;i<160;i++) { if(check()) return; await sleep(25); }
  assert.fail('Timed out waiting for delayed network state');
}

test('prediction preserves authority, blocks walls, and resets at phase changes', () => {
  const g = new Game(); g.phase('DAY');
  Object.assign(g.state.players.detective,{x:0,z:-19});
  const original=JSON.stringify(g.state), p=new MovementPrediction();p.reconcile(g.state,'detective');
  for(let i=0;i<30;i++)p.advance({forward:1,yaw:0});
  assert.equal(JSON.stringify(g.state),original);
  assert.ok(p.sim.state.players.detective.z >= -19.45);
  assert.equal(p.pending.length,15);
  g.phase('NIGHT');p.reconcile(g.state,'detective');assert.equal(p.pending.length,0);
});

for (const delay of [50, 100, 175]) test(`two clients at ~${delay*2}ms RTT predict before ACK and converge`, async () => {
  const app=createApp({port:0,host:'127.0.0.1'}), addr=await app.start();
  const proxy=new WebSocketServer({port:0,host:'127.0.0.1'});
  await new Promise(resolve=>proxy.on('listening',resolve));
  const timers=new Set(), sockets=new Set();
  // Ordered one-way delay with +/-10ms jitter; timers delay bytes, not timestamps.
  proxy.on('connection',down=>{
    const up=new WebSocket(`ws://127.0.0.1:${addr.port}/ws`);sockets.add(down);sockets.add(up);
    const relay=(from,to)=>{let due=0,count=0;from.on('message',data=>{
      due=Math.max(due+1,Date.now()+delay-10+(count++%3)*10);
      const timer=setTimeout(()=>{timers.delete(timer);if(to.readyState===1)to.send(data.toString());},due-Date.now());timers.add(timer);
    });};
    relay(down,up);relay(up,down);
    down.on('close',()=>up.close());up.on('error',()=>{});
  });
  const p=new MovementPrediction();let latest, other, started=false, controls={forward:1,yaw:0}, loop;
  const options={Socket:WebSocket,url:`ws://127.0.0.1:${proxy.address().port}/ws`,storage:{getItem:()=>null,setItem(){},removeItem(){}}};
  const a=new Connection(s=>{latest=s;p.reconcile(s,'detective');},m=>{if(m.type==='start')started=true;},undefined,options);
  const b=new Connection(s=>{other=s;},()=>{},undefined,options);
  try {
    const room=await a.connect('host','detective');await b.connect('join','killer',room.code);
    await until(()=>started);
    const authority=app.rooms.get(room.code).game;authority.phase('DAY');
    Object.assign(authority.state.players.detective,{x:0,z:0});
    await until(()=>latest?.phase==='DAY' && latest.players.detective.z===0);
    const seq=p.advance(controls);a.send('input',{input:controls,seq});
    assert.ok(p.sim.state.players.detective.z<-.08);
    assert.equal(authority.state.players.detective.z,0);
    loop=setInterval(()=>{const seq=p.advance(controls);a.send('input',{input:controls,seq});},1000/30);
    await until(()=>latest.players.detective.inputAck>=seq && other?.players.detective.z<-.2);
    await sleep(450);controls={yaw:0};
    await sleep(700);
    assert.ok(Math.abs(p.sim.state.players.detective.z-authority.state.players.detective.z)<.12);
    assert.ok(Math.abs(other.players.detective.z-authority.state.players.detective.z)<.12);
  } finally {
    clearInterval(loop);a.close();b.close();for(const t of timers)clearTimeout(t);
    for(const ws of sockets)ws.terminate();await new Promise(resolve=>proxy.close(resolve));await app.close();
  }
});

