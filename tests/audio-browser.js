import { AudioDirector } from '../client/audio-director.js';
import { Game } from '../shared/game.js';
import { MusicDirector } from '../client/music-director.js';
const report=document.querySelector('#report'), button=document.querySelector('#run');
const lines=[];
const log=text=>{lines.push(text);report.textContent=lines.join('\n');};
const check=(condition,text)=>{if(!condition)throw Error(text);log('PASS '+text);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
window.addEventListener('error',e=>log('ERROR '+e.message));
window.addEventListener('unhandledrejection',e=>log('ERROR '+e.reason));
button.onclick=async()=>{
  button.disabled=true; lines.length=0;
  const clients=[new AudioDirector(),new AudioDirector()];
  clients.forEach(a=>a.ensureAudioStarted()); // Inside the real click activation.
  try {
    await Promise.all(clients.map(a=>a.ctx.resume()));
    check(clients.every(a=>a.ctx.state==='running') && clients[0].ctx!==clients[1].ctx,'independent contexts start after click');
    for(let n=0;n<200 && !clients.every(a=>a.music.loaded.day && a.music.loaded.night);n++)await sleep(50);
    check(clients.every(a=>a.music.loaded.day && a.music.loaded.night),'MP3 / OGG decode successfully');
    const fallback = new MusicDirector(clients[0], clients[0].musicGate, {day:'data:audio/wav;base64,AA==',night:'data:audio/wav;base64,AA=='});
    await sleep(200);
    check(fallback.loaded.day===false && fallback.loaded.night===false && fallback.layers.day.source.buffer.length>0,'invalid/missing audio retains procedural buffers');
    fallback.dispose();
    const game=new Game(); game.state.players.detective.z=3;
    const phases=new Set(); let previous='', worstPeak=0, maxSources=0, sunsetChecks=0;
    const accepted=[0,0];
    // Inject real wrong-shot sequence once, then reset for the complete default round.
    game.phase('DAY');game.state.players.detective.pitch=1.1;game.action('detective','shoot');
    check(game.state.dayTime===25,'wrong shot consumes exactly 25 game seconds');
    for(let n=0;n<14;n++) {
      clients.forEach((a,i)=>{
        const role=i?'killer':'detective';a.updateState(game.state,role,{},.05);
        for(const e of game.state.events)a.event(e,game.state.players[role],role);
        a.debugText(); worstPeak=Math.max(worstPeak,a.peak);
      });
      if(n===1)check(clients.every(a=>a.musicDuck.gain._target===0),'penalty creates music vacuum after shot');
      await sleep(50);
    }
    clients.forEach((a,i)=>accepted[i]=a.eventId);
    for(let n=0;n<20;n++)clients.forEach((a,i)=>{
      for(const e of game.state.events)a.event(e,game.state.players[i?'killer':'detective'],i?'killer':'detective');
    });
    check(clients.every((a,i)=>a.eventId===accepted[i] && a.penaltyAt===0),'duplicate snapshots do not retrigger penalty');
    game.reset();game.state.players.detective.z=3;clients.forEach(a=>a.reset());
    while(game.state.phase!=='GAME_OVER') {
      const count=game.state.phase==='DAY'?10:1;
      for(let tick=0;tick<count;tick++)game.tick(.05);
      const state=structuredClone(game.state);phases.add(state.phase);
      clients.forEach((a,i)=>{
        const role=i?'killer':'detective';
        a.updateState(state,role,{},.05*count);
        for(let duplicate=0;duplicate<2;duplicate++)for(const e of state.events)a.event(e,state.players[role],role);
        a.debugText();worstPeak=Math.max(worstPeak,a.peak);maxSources=Math.max(maxSources,a.activeSources.size);
      });
      if(state.phase!==previous){log('PHASE '+state.phase+' @ '+state.elapsed.toFixed(2)+' game seconds');previous=state.phase;}
      if(state.phase==='SUNSET' && state.phaseTime>.2) {
        if(!clients.every(a=>a.musicGate.gain.value===0))throw Error('SUNSET music leaked after 100ms');
        sunsetChecks++;
      }
      if(state.phase==='NIGHT' && state.nightTime>42 && !clients.every(a=>a.music.layers.night.gain.gain._target===0))throw Error('night drain failed');
      await sleep(50);
    }
    check(phases.size===5 && game.state.result==='SURVIVED','complete default round reaches SURVIVED on both clients');
    check(sunsetChecks>35,'SUNSET music gate stays exactly zero throughout transition');
    check(clients.every(a=>a.supportPlayed),'support siren triggered exactly once per client');
    check(worstPeak<.95,`no pre-compressor clipping; measured peak ${worstPeak.toFixed(4)}`);
    check(maxSources<24,`bounded one-shot voices: maximum ${maxSources}`);
    // Exercise the actual breath state machine and real voices through exhaustion.
    game.reset();game.phase('DAY');game.state.players.detective.z=3;
    game.state.players.killer.still=true;
    game.input('killer',{breath:true});clients.forEach(a=>a.reset());
    let gaspIds=new Set(), warning=false, heart=false;
    for(let n=0;n<320;n++) {
      game.tick(.05);
      clients.forEach((a,i)=>{
        const role=i?'killer':'detective';a.updateState(game.state,role,{},.05);
        for(const e of game.state.events){a.event(e,game.state.players[role],role);if(e.type==='gasp')gaspIds.add(e.id);}
      });
      warning ||= clients[1].earGain.gain.value>0;
      heart ||= clients[1].nextHeart>clients[1].ctx.currentTime;
      await sleep(50);
    }
    check(gaspIds.size===1 && game.state.players.killer.cooldown>0,'15-second exhaustion emits one spatial gasp and enters cooldown');
    check(warning && heart && clients[0].debugState.breathDanger===0,'killer heart/tinnitus stay local and disappear after release');
    await sleep(1500);
    clients.forEach(a=>a.stop());
    check(clients.every(a=>a.activeSources.size===0),'return to menu stops active one-shots');
    log('ALL BROWSER CHECKS PASSED');
  }catch(error){log('FAIL '+error.stack);clients.forEach(a=>a.stop());}
  button.disabled=false;
};
