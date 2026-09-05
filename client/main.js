import {Gallery} from './scene.js';
import {Game} from '../shared/game.js';
import {CONFIG as C,BINDINGS} from '../shared/config.js';
import {spots,rooms} from '../shared/world.js';
import {sunAt} from '../shared/sun.js';
import {Sound} from './audio.js';
import {RehearsalBot} from './bot.js';
import {Connection} from './network.js';
const $=id=>document.getElementById(id),canvas=$('game');
let gallery;
try{gallery=new Gallery(canvas);}catch(e){$('network-status').textContent='无法初始化 WebGL 2。请使用支持硬件加速的桌面 Chrome / Edge。';console.error(e);throw e;}
const sound=new Sound();let game=new Game({debug:true}),bot=new RehearsalBot(game),state=game.state,mode='menu',role='detective',chosenRole='detective',view={yaw:0,pitch:0},paused=false,keys=new Set(),aim=false,debug=false,showSpots=false,botEnabled=true,eventId=0,lastPhase='',phaseUntil=0,toastUntil=0,networkClock=0,started=false,waiting=false,lastTime=performance.now(),dragLook=false;
let bindings={...BINDINGS};try{bindings={...bindings,...JSON.parse(localStorage.getItem('still.bindings')||'{}')};}catch{}
const connection=new Connection(s=>{state=s;game.state=s;},m=>{
 if(m.type==='start'){eventId=0;lastPhase='';$('results').hidden=true;$('replay').disabled=false;$('replay').textContent='ANOTHER ROUND ↗';if(!started)begin('online',connection.role||role);else{paused=false;$('pause').hidden=true;toast('新一局开始 · 15 秒准备');}}
 if(m.type==='peer-left'){pause(true);$('pause-copy').textContent='另一位玩家已离开。本局已停止，请返回主菜单重新创建房间。';$('resume').disabled=true;}
 if(m.type==='disconnected'&&mode==='online'){pause(true);$('pause-copy').textContent='与服务器的连接已断开，请返回主菜单重新连接。';$('resume').disabled=true;}
 if(m.type==='waiting-rematch'){toast(`再来一局：${m.count} / 2 位玩家已准备`);}
 if(m.type==='error')toast(m.message);
});
const help=`<p><strong>共同操作</strong><br><kbd>W A S D</kbd> 移动 · 鼠标观察 · <kbd>Esc</kbd> 释放鼠标 / 菜单。</p><p><strong>DETECTIVE / 警探</strong><br>左键射击 · 右键举枪 · <kbd>Q</kbd> 标记 / 取消可疑藏点（最多 3 个）<br>按住 <kbd>R</kbd> 快速回头 · <kbd>F</kbd> 夜间手电。</p><p><strong>KILLER / 凶手</strong><br><kbd>Shift</kbd> 短跑 · <kbd>E</kbd> 进入 / 解除 STILL<br>按住 <kbd>Space</kbd> 屏息 · 夜间左键袭击。</p><p>静止不会消除你的影子。观察太阳，趁警探转身换位。误射会让日落提前 35 秒。日落后警探逃向南侧入口；凶手有 45 秒追猎。超时仍存活，警探胜利。</p><p><strong>单人演练调试</strong><br><kbd>Tab</kbd> 切换角色 · <kbd>F2</kbd> 调试信息 · <kbd>F3</kbd> 推进 45 秒<br><kbd>F4</kbd> 日落 · <kbd>F6</kbd> 夜晚 · <kbd>F7</kbd> 补弹<br><kbd>F8</kbd> 所有藏点 · <kbd>F9</kbd> 开关陪练。</p>`;
document.querySelectorAll('.help-copy').forEach(el=>el.innerHTML=help);
document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{chosenRole=b.dataset.role;document.querySelectorAll('[data-role]').forEach(x=>x.classList.toggle('selected',x===b));});
$('help-button').onclick=()=>$('help').showModal();$('close-help').onclick=()=>$('help').close();
$('local').onclick=()=>{connection.close();game=new Game({debug:true});bot=new RehearsalBot(game);state=game.state;begin('local',chosenRole);};
$('join').onclick=()=>{$('join-form').hidden=!$('join-form').hidden;$('room-code').focus();};
async function connect(mode){$('network-status').textContent='CONNECTING…';$('host').disabled=true;$('connect').disabled=true;try{sound.start();const m=await connection.connect(mode,chosenRole,$('room-code').value.trim());role=m.role;waiting=true;$('network-status').textContent=`ROOM ${m.code} · ${m.role.toUpperCase()} · 等待另一位玩家加入…`;}catch(e){$('network-status').textContent=e.message;$('host').disabled=false;}finally{$('connect').disabled=false;}}
$('host').onclick=()=>connect('host');$('connect').onclick=()=>connect('join');$('room-code').onkeydown=e=>{if(e.key==='Enter')connect('join');};
function lock(){if(document.pointerLockElement!==canvas)canvas.requestPointerLock()?.catch(()=>toast('可按住鼠标中键拖动观察，或用方向键转向'));}
function begin(nextMode,nextRole){mode=nextMode;role=nextRole;paused=false;started=true;waiting=false;eventId=0;lastPhase='';view={yaw:state.players[role].yaw,pitch:0};keys.clear();$('menu').hidden=true;$('hud').hidden=false;$('pause').hidden=true;$('results').hidden=true;$('resume').disabled=false;sound.start();lock();}
function pause(value){if(!started)return;paused=value;$('pause').hidden=!value;keys.clear();aim=false;if(value){document.exitPointerLock();$('pause-copy').textContent=mode==='online'?'联机对局会继续计时。继续后点击画面锁定鼠标。':'单人演练已暂停。';}else lock();}
function menu(){connection.close();mode='menu';started=false;waiting=false;paused=false;keys.clear();$('hud').hidden=true;$('pause').hidden=true;$('results').hidden=true;$('menu').hidden=false;$('network-status').textContent='';$('host').disabled=false;$('resume').disabled=false;document.exitPointerLock();game=new Game({debug:true});state=game.state;document.body.classList.remove('night');}
$('pause-button').onclick=()=>pause(true);$('resume').onclick=()=>pause(false);$('return-menu').onclick=menu;$('result-menu').onclick=menu;
$('replay').onclick=()=>{if(mode==='local'){game=new Game({debug:true});bot=new RehearsalBot(game);state=game.state;begin('local',role);}else{connection.send('rematch');$('replay').textContent='WAITING FOR THE OTHER PLAYER…';$('replay').disabled=true;}};
canvas.addEventListener('click',()=>{if(started&&!paused&&state.phase!=='GAME_OVER')lock();});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&started&&state.phase!=='GAME_OVER'&&!paused)pause(true);});
document.addEventListener('mousemove',e=>{if((document.pointerLockElement!==canvas&&!dragLook)||paused)return;view.yaw-=e.movementX*.0021;view.pitch=Math.max(-1.15,Math.min(1.15,view.pitch-e.movementY*.0018));});
const backYaw=()=>view.yaw+(role==='detective'&&keys.has(bindings.lookBack)?Math.PI:0);
function input(){return{forward:Number(keys.has(bindings.forward))-Number(keys.has(bindings.backward)),strafe:Number(keys.has(bindings.right))-Number(keys.has(bindings.left)),yaw:backYaw(),pitch:view.pitch,sprint:keys.has(bindings.sprint)||keys.has('ShiftRight'),breath:keys.has(bindings.breath)};}
function action(a){if(paused||!started)return;if(mode==='local'){game.input(role,input());game.action(role,a);}else{connection.send('input',{input:input()});connection.send('action',{action:a});}}
document.addEventListener('keydown',e=>{if(!started||e.target.matches('input'))return;if(['Tab','Space','F2','F3','F4','F6','F7','F8','F9'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='Escape'){if(!document.pointerLockElement)pause(!paused);return;}keys.add(e.code);if(paused)return;
 if(e.code===bindings.still)action('still');if(e.code===bindings.mark)action('mark');if(e.code===bindings.flashlight)action('flashlight');
 if(mode==='local'){if(e.code==='Tab'){game.input(role,{});role=role==='detective'?'killer':'detective';view={yaw:state.players[role].yaw,pitch:0};keys.clear();lastPhase='';toast(`控制 ${role.toUpperCase()}`);}if(e.code==='F2')debug=!debug;if(e.code==='F3')game.debugAction('time');if(e.code==='F4')game.debugAction('sunset');if(e.code==='F6')game.debugAction('night');if(e.code==='F7')game.debugAction('ammo');if(e.code==='F8')showSpots=!showSpots;if(e.code==='F9'){botEnabled=!botEnabled;game.input(role==='killer'?'detective':'killer',{});toast(botEnabled?'陪练已启用':'陪练已停止');}if(e.code==='F10'){game.reset();game.debugAction('day');state=game.state;botEnabled=false;role='killer';Object.assign(state.players.killer,{x:1,z:-5});game.action('killer','still');Object.assign(state.players.detective,{x:5,z:3,yaw:Math.PI/2});view={yaw:.38,pitch:-.2};debug=true;toast('SHADOW STUDY · F3 推进太阳 / Tab 警探视角');}}
});
document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();aim=false;if(started&&!paused)pause(true);});document.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('mousedown',e=>{if(!started||paused||e.target!==canvas)return;if(e.button===1){e.preventDefault();dragLook=true;}if(e.button===0)action(role==='detective'?'shoot':'attack');if(e.button===2)aim=true;});document.addEventListener('mouseup',e=>{if(e.button===2)aim=false;if(e.button===1)dragLook=false;});
function toast(text){$('toast').textContent=text;toastUntil=performance.now()+3200;}
function phaseCard(title,copy,kicker=''){phaseUntil=performance.now()+3800;$('phase-title').textContent=title;$('phase-copy').textContent=copy;$('phase-kicker').textContent=kicker;}
function hud(now){const s=state,p=s.players[role],night=s.phase==='NIGHT';$('role-label').textContent=role.toUpperCase()+(mode==='local'?' / REHEARSAL':'');$('objective').textContent=role==='detective'?(night?'RUN.':'FIND HIM.'):(night?'FIND HIM.':p.still?'STILL.':"DON’T MOVE.");
 $('sun-dot').style.left=`${Math.min(1,s.dayTime/C.dayDuration)*100}%`;$('phase-label').textContent=s.phase==='PREPARATION'?`DOORS OPEN IN ${Math.ceil(C.preparationDuration-s.phaseTime)}`:night?'AFTER SUNSET':s.phase==='SUNSET'?'THE GALLERY IS CLOSING':'BEFORE SUNSET';
 $('resource').innerHTML=role==='detective'?`BULLETS<div class="bullets">${Array.from({length:4},(_,i)=>`<span class="${i>=s.ammo?'spent':''}">●</span>`).join('')}</div>`:`${p.holding?'HOLDING':p.cooldown>0?'RECOVERING':'BREATH'}<div class="breath-bar"><i style="width:${p.breath/C.breathDuration*100}%"></i></div>`;
 let place=rooms[0];if(p.x<-9)place=p.z<0?rooms[1]:rooms[2];if(p.x>9)place=p.z<0?rooms[3]:rooms[4];$('location').innerHTML=`${place.name}<span>${place.sub}</span>`;
 $('controls-hint').innerHTML=role==='detective'?'R — 回头 &nbsp; Q — 标记<br>右键举枪 · 左键射击':'E — STILL &nbsp; SPACE — 屏息<br>SHIFT — 短跑';
 const nearest=role==='killer'?game.nearestSpot():null;$('interaction').textContent=role==='killer'&&!night?(p.still?'E — LEAVE STILL':nearest?'E — STILL':''):night&&role==='killer'?'LEFT CLICK — ATTACK':'';
 $('crosshair').style.opacity=role==='detective'?1:.2;document.body.classList.toggle('night',night||s.phase==='SUNSET'||s.phase==='GAME_OVER'&&s.dayTime>=420);
 const tension=role==='killer'?game.tension():0;$('vignette').style.opacity=role==='killer'?tension*.26:0;if(role==='killer')sound.update(tension,s.elapsed,night);
 if(s.phase!==lastPhase){lastPhase=s.phase;
  if(s.phase==='PREPARATION')phaseCard(role.toUpperCase(),role==='detective'?'Find him before sunset. / 日落前，找出他。':"Don't move. / 先选一个藏点。",'15 SECONDS TO COMPOSE THE SCENE');
  if(s.phase==='DAY')phaseCard(role==='detective'?'FIND HIM.':'DON’T MOVE.',role==='detective'?'Four bullets. One stranger.':'Your shadow will not wait.','17:53 / THE GALLERY IS OPEN');
  if(s.phase==='SUNSET')phaseCard('CLOSING TIME.','The gallery is now closed.','18:00');
  if(s.phase==='NIGHT')phaseCard(role==='detective'?'RUN.':'YOUR TURN.',role==='detective'?'Find the south exit. / 返回南侧入口逃生。':'45 seconds. Find him.','AFTER SUNSET');
  if(s.phase==='GAME_OVER'){document.exitPointerLock();$('pause').hidden=true;$('results').hidden=false;const result=s.result;$('result-title').textContent=result==='FOUND YOU'?'FOUND YOU.':result==='ESCAPED'?'ESCAPED.':result==='SURVIVED'?'SURVIVED.':'DETECTED.';$('winner').textContent=result==='FOUND YOU'?'KILLER WINS / 凶手获胜':'DETECTIVE WINS / 警探获胜';$('result-copy').textContent=result==='FOUND YOU'?'白昼的猎物，找到了你。':result==='ESCAPED'?'你在黑暗里找到了出口。':result==='SURVIVED'?'你熬过了 45 秒的追猎。':'画面里，多出来的那个人。';}
 }
 $('phase-card').style.opacity=now<phaseUntil?1:0;$('toast').style.opacity=now<toastUntil?1:0;
 // Actual blackout lasts 0.4 seconds, within a longer closing announcement.
 $('blackout').style.opacity=s.phase==='SUNSET'&&s.phaseTime>.65&&s.phaseTime<1.05?1:0;
 $('debug').hidden=!debug||mode!=='local';if(debug){const sun=sunAt(s.dayTime);$('debug').textContent=`LOCAL DEBUG  [F2]\nSTATE    ${s.phase}\nSUN      ${(sun.elevation*180/Math.PI).toFixed(1)}° / ${(sun.azimuth*180/Math.PI).toFixed(1)}°\nDAY      ${(420-s.dayTime).toFixed(1)} s left\nNIGHT    ${(45-s.nightTime).toFixed(1)} s left\nIN FOV   ${game.tension()>.05}\nSPOT     ${s.players.killer.spotId??'—'}\nBREATH   ${s.players.killer.breath.toFixed(1)}\nBOT      ${botEnabled?'ON':'OFF'}\nDRAW     ${gallery.renderer.info.render.calls}\nF3 +45s · F4 sunset · F6 night\nF7 ammo · F8 spots · F9 bot · Tab role`;}
}
function frame(now){const dt=Math.min((now-lastTime)/1000,.06);lastTime=now;if(started&&!paused){view.yaw+=(Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*dt*1.6;view.pitch=Math.max(-1.15,Math.min(1.15,view.pitch+(Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')))*dt));}
 if(started){if(mode==='local'&&!paused){game.input(role,input());if(botEnabled)bot.tick(dt,role==='detective'?'killer':'detective');game.tick(dt);state=game.state;}if(mode==='online'){networkClock+=dt;if(networkClock>1/30){connection.send('input',{input:paused?{yaw:backYaw(),pitch:view.pitch}:input()});networkClock=0;}}
  for(const e of state.events){if(e.id<=eventId)continue;eventId=e.id;sound.event(e,state.players[role],role);if(e.type==='shot')gallery.shot(e.point);if(e.type==='penalty'&&role==='detective')toast('EMPTY SHOT. / 日落提前 35 秒');if(e.type==='gasp'&&role==='killer')toast('Breathe. / 暂时无法屏息');}hud(now);
 }
 gallery.update(state,role,{yaw:backYaw(),pitch:view.pitch},dt,{menu:mode==='menu',showSpots:mode==='local'&&showSpots,aim});requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Inspection hooks are deliberately local-only. Online rules stay server-owned.
window.still={get state(){return state;},get mode(){return mode;},get role(){return role;},get renderer(){return gallery.renderer;},get scene(){return gallery;},debug(action){if(mode==='local')game.debugAction(action);},setPlayer(r,data){if(mode==='local')Object.assign(state.players[r],data);},setView(yaw,pitch=0){if(mode==='local')view={yaw,pitch};},get botEnabled(){return botEnabled;},set botEnabled(v){if(mode==='local'){botEnabled=v;game.inputs={};}},action,bind(action,code){if(action in BINDINGS){bindings[action]=code;localStorage.setItem('still.bindings',JSON.stringify(bindings));}}};
