import { Gallery } from "./scene.js";
import { Game } from "../shared/game.js";
import { CONFIG as C, BINDINGS } from "../shared/config.js";
import { spots, rooms } from "../shared/world.js";
import { sunAt } from "../shared/sun.js";
import { Sound } from "./audio.js";
import { RehearsalBot } from "./bot.js";
import { Connection } from "./network.js";
import { SnapshotBuffer } from "./interpolation.js";
import { DEFAULT_SETTINGS, mountSettings } from "./settings.js";
import { applyLanguage, language, t, tf, translateError } from "./i18n.js";
applyLanguage();
const $ = (id) => document.getElementById(id),
  canvas = $("game");
$("language").onchange = (event) => {
  localStorage.setItem("still.language", event.target.value);
  location.reload();
};
let gallery;
try {
  gallery = new Gallery(canvas);
} catch (e) {
  $("network-status").textContent = t("webglError");
  console.error(e);
  throw e;
}
const sound = new Sound();
let settings = { ...DEFAULT_SETTINGS };
const settingsDialog = mountSettings({ language, storage: localStorage, onChange: (next) => {
  settings = next;
  sound.configure(next);
  gallery.configure(next);
} });
const snapshots = new SnapshotBuffer();
let game = new Game({ debug: true }),
  bot = new RehearsalBot(game),
  state = game.state,
  mode = "menu",
  role = "detective",
  chosenRole = "detective",
  view = { yaw: 0, pitch: 0 },
  paused = false,
  keys = new Set(),
  aim = false,
  debug = false,
  showSpots = false,
  botEnabled = true,
  eventId = 0,
  lastPhase = "",
  phaseUntil = 0,
  toastUntil = 0,
  networkClock = 0,
  started = false,
  waiting = false,
  lastTime = performance.now(),
  dragLook = false;
let hudClock = 0;
let connectionBlocked = false;
let bindings = { ...BINDINGS };
try {
  bindings = {
    ...bindings,
    ...JSON.parse(localStorage.getItem("still.bindings") || "{}"),
  };
} catch {}
const connection = new Connection(
  (s) => {
    snapshots.push(s, performance.now());
    state = s;
    game.state = s;
  },
  (m) => {
    if (m.type === "start") {
      sound.cancelAnnouncement();
      snapshots.reset();
      gallery.resetEffects();
      eventId = 0;
      lastPhase = "";
      sound.nextHeart = 0;
      keys.clear();
      view = { yaw: 0, pitch: 0 };
      $("results").hidden = true;
      $("replay").disabled = false;
      $("replay").textContent = t("replay");
      if (!started) begin("online", connection.role || role);
      else {
        paused = false;
        $("pause").hidden = true;
        toast(t("roundStarted"));
      }
    }
    if (m.type === "reconnecting") connectionStatus("reconnecting", true);
    if (m.type === "peer-reconnecting") connectionStatus("peerReconnecting", true);
    if (m.type === "peer-left") connectionStatus(m.reason === "expired" ? "reconnectExpired" : "peerLeft", true, true);
    if (m.type === "disconnected") connectionStatus("reconnectExpired", true, true);
    if (m.type === "restored") {
      snapshots.reset();
      if (m.started) {
        if (!started) begin("online", connection.role, false);
        view = { yaw: state.players[role].yaw, pitch: state.players[role].pitch };
        eventId = state.eventId; // Do not replay old shots, footsteps or broadcasts.
        lastPhase = state.phase === "GAME_OVER" ? "" : state.phase;
        phaseUntil = 0;
        connectionStatus(m.active ? "reconnected" : "peerReconnecting", !m.active);
      } else {
        connectionBlocked = false;
        waiting = true;
        $("network-status").textContent = tf("waiting", { code: connection.room, role: t(connection.role) });
        $("network-cancel").hidden = false;
      }
    }
    if (m.type === "resumed") connectionStatus("reconnected", false);
    if (m.type === "waiting-rematch") {
      toast(tf("rematchReady", { count: m.count }));
    }
    if (m.type === "error") toast(m.message);
  },
  (key, message) => (key === "server" ? translateError(message) : t(key)),
);
function connectionStatus(key, blocked, terminal = false) {
  connectionBlocked = blocked;
  keys.clear();
  sound.cancelAnnouncement();
  if (started) {
    pause(true);
    $("pause-copy").textContent = t(key);
    $("resume").disabled = blocked;
    $("replay").disabled = blocked;
    $("replay").textContent = t("replay");
    if (state.phase === "GAME_OVER") {
      $("pause").hidden = true;
      $("result-copy").textContent = t(key);
    }
  } else {
    $("network-status").textContent = t(key);
    $("host").disabled = !terminal;
    $("connect").disabled = !terminal;
    $("network-cancel").hidden = terminal;
    waiting = !terminal;
  }
}
document.querySelectorAll("[data-role]").forEach(
  (b) =>
    (b.onclick = () => {
      chosenRole = b.dataset.role;
      document
        .querySelectorAll("[data-role]")
        .forEach((x) => x.classList.toggle("selected", x === b));
    }),
);
$("help-button").onclick = () => $("help").showModal();
$("close-help").onclick = () => $("help").close();
$("local").onclick = () => {
  connection.close();
  game = new Game({ debug: true });
  bot = new RehearsalBot(game);
  state = game.state;
  begin("local", chosenRole);
};
$("join").onclick = () => {
  $("join-form").hidden = !$("join-form").hidden;
  $("room-code").focus();
};
async function connect(mode) {
  $("network-status").textContent = t("connecting");
  $("host").disabled = true;
  $("connect").disabled = true;
  try {
    sound.start();
    const m = await connection.connect(
      mode,
      chosenRole,
      $("room-code").value.trim(),
    );
    role = m.role;
    waiting = true;
    $("network-cancel").hidden = false;
    $("network-status").textContent = tf("waiting", {
      code: m.code,
      role: t(m.role),
    });
  } catch (e) {
    $("network-status").textContent = e.message;
    $("host").disabled = false;
  } finally {
    $("connect").disabled = false;
  }
}
$("host").onclick = () => connect("host");
$("connect").onclick = () => connect("join");
$("room-code").onkeydown = (e) => {
  if (e.key === "Enter") connect("join");
};
function lock() {
  if (document.pointerLockElement !== canvas)
    canvas
      .requestPointerLock()
      ?.catch(() => toast(t("pointerFallback")));
}
function begin(nextMode, nextRole, capturePointer = true) {
  sound.cancelAnnouncement();
  gallery.resetEffects();
  mode = nextMode;
  role = nextRole;
  paused = false;
  started = true;
  waiting = false;
  connectionBlocked = false;
  $("network-cancel").hidden = true;
  eventId = 0;
  sound.nextHeart = 0;
  lastPhase = "";
  view = { yaw: state.players[role].yaw, pitch: 0 };
  keys.clear();
  $("menu").hidden = true;
  $("hud").hidden = false;
  $("pause").hidden = true;
  $("results").hidden = true;
  $("resume").disabled = false;
  if (capturePointer) { sound.start(); lock(); }
}
function pause(value) {
  if (!started) return;
  if (!value && connectionBlocked) return;
  paused = value;
  $("pause").hidden = !value;
  keys.clear();
  aim = false;
  if (value) {
    document.exitPointerLock();
    $("pause-copy").textContent =
      mode === "online" ? t("onlinePause") : t("soloPause");
  } else { sound.start(); lock(); }
}
function menu() {
  sound.stop();
  gallery.resetEffects();
  connection.close();
  mode = "menu";
  started = false;
  waiting = false;
  connectionBlocked = false;
  $("network-cancel").hidden = true;
  paused = false;
  keys.clear();
  $("hud").hidden = true;
  $("pause").hidden = true;
  $("results").hidden = true;
  $("menu").hidden = false;
  $("network-status").textContent = "";
  $("host").disabled = false;
  $("resume").disabled = false;
  document.exitPointerLock();
  game = new Game({ debug: true });
  state = game.state;
  document.body.classList.remove("night");
}
$("pause-button").onclick = () => pause(true);
$("resume").onclick = () => pause(false);
$("return-menu").onclick = menu;
$("result-menu").onclick = menu;
$("network-cancel").onclick = menu;
$("replay").onclick = () => {
  if (mode === "local") {
    game = new Game({ debug: true });
    bot = new RehearsalBot(game);
    state = game.state;
    begin("local", role);
  } else {
    connection.send("rematch");
    $("replay").textContent = t("waitingPlayer");
    $("replay").disabled = true;
  }
};
canvas.addEventListener("click", () => {
  if (started && !paused && state.phase !== "GAME_OVER") lock();
});
document.addEventListener("pointerlockchange", () => {
  if (
    !document.pointerLockElement &&
    started &&
    state.phase !== "GAME_OVER" &&
    !paused
  )
    pause(true);
});
document.addEventListener("mousemove", (e) => {
  if ((document.pointerLockElement !== canvas && !dragLook) || paused) return;
  view.yaw -= e.movementX * 0.0021 * settings.sensitivity;
  view.pitch = Math.max(
    -1.15,
    Math.min(1.15, view.pitch - e.movementY * 0.0018 * settings.sensitivity * (settings.invertY ? -1 : 1)),
  );
});
const backYaw = () =>
  view.yaw +
  (role === "detective" && keys.has(bindings.lookBack) ? Math.PI : 0);
function input() {
  return {
    forward:
      Number(keys.has(bindings.forward)) - Number(keys.has(bindings.backward)),
    strafe: Number(keys.has(bindings.right)) - Number(keys.has(bindings.left)),
    yaw: backYaw(),
    pitch: view.pitch,
    sprint: keys.has(bindings.sprint) || keys.has("ShiftRight"),
    breath: keys.has(bindings.breath),
    inspect: role === "detective" && keys.has(bindings.still),
  };
}
function action(a) {
  if (paused || !started) return;
  if (a === "shoot" && state.ammo === 0) {
    toast(t(state.phase === "NIGHT" ? "noAmmoNight" : "noAmmo"));
    return;
  }
  if (mode === "local") {
    game.input(role, input());
    game.action(role, a);
  } else {
    connection.send("input", { input: input() });
    connection.send("action", { action: a });
  }
}
document.addEventListener("keydown", (e) => {
  if (settingsDialog.open || e.target.matches("input, select, textarea")) return;
  if (!started || e.target.matches("input")) return;
  if (
    ["Tab", "Space", "F2", "F3", "F4", "F6", "F7", "F8", "F9"].includes(e.code)
  )
    e.preventDefault();
  if (e.repeat) return;
  if (e.code === "Escape") {
    if (!document.pointerLockElement) pause(!paused);
    return;
  }
  keys.add(e.code);
  if (paused) return;
  if (role === "killer" && state.players.killer.still
    && [bindings.forward, bindings.backward, bindings.left, bindings.right].includes(e.code))
    action("unstill");
  if (e.code === bindings.still) action("still");
  if (e.code === bindings.pose && role === "killer") action("pose");
  if (e.code === bindings.mark) action("mark");
  if (e.code === bindings.flashlight && role === "detective") action("flashlight");
  if (mode === "local") {
    if (e.code === "Tab") {
      game.input(role, {});
      role = role === "detective" ? "killer" : "detective";
      view = { yaw: state.players[role].yaw, pitch: 0 };
      keys.clear();
      lastPhase = "";
      toast(tf("controlRole", { role: t(role) }));
    }
    if (e.code === "F2") debug = !debug;
    if (e.code === "F3") game.debugAction("time");
    if (e.code === "F4") game.debugAction("sunset");
    if (e.code === "F6") game.debugAction("night");
    if (e.code === "F7") game.debugAction("ammo");
    if (e.code === "F8") showSpots = !showSpots;
    if (e.code === "F9") {
      botEnabled = !botEnabled;
      game.input(role === "killer" ? "detective" : "killer", {});
      toast(t(botEnabled ? "botOn" : "botOff"));
    }
    if (e.code === "F10") {
      game.reset();
      eventId = 0;
      lastPhase = "";
      sound.nextHeart = 0;
      game.debugAction("day");
      state = game.state;
      botEnabled = false;
      role = "killer";
      Object.assign(state.players.killer, { x: 0, z: -3.5 });
      game.action("killer", "pose");
      Object.assign(state.players.detective, { x: 5, z: 3, yaw: Math.PI / 2 });
      view = { yaw: 0.38, pitch: -0.2 };
      debug = true;
      toast(
        language === "zh"
          ? "影子研究 · F3 推进太阳 · Tab 切换警探视角"
          : "SHADOW STUDY · F3 ADVANCE SUN · TAB DETECTIVE VIEW",
      );
    }
  }
});
document.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  aim = false;
  if (started && !paused) pause(true);
});
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("mousedown", (e) => {
  if (!started || paused || e.target !== canvas) return;
  if (e.button === 1) {
    e.preventDefault();
    dragLook = true;
  }
  if (e.button === 0) action(role === "detective" ? "shoot" : "attack");
  if (e.button === 2) aim = true;
});
document.addEventListener("mouseup", (e) => {
  if (e.button === 2) aim = false;
  if (e.button === 1) dragLook = false;
});
function toast(text) {
  $("toast").textContent = text;
  toastUntil = performance.now() + 3200;
}
function phaseCard(title, copy, kicker = "") {
  phaseUntil = performance.now() + 3800;
  $("phase-title").textContent = title;
  $("phase-copy").textContent = copy;
  $("phase-kicker").textContent = kicker;
}
function hud(now) {
  const s = state,
    p = s.players[role],
    night = s.phase === "NIGHT" || (s.phase === "GAME_OVER" && s.dayTime >= C.dayDuration);
  $("role-label").textContent =
    t(role) + (mode === "local" ? ` · ${t("rehearsal")}` : "");
  $("objective").textContent =
    role === "detective"
      ? night
        ? t("run")
        : t("findHim")
      : night
        ? t("findHim")
        : p.still
          ? t("still")
          : t("dontMove");
  $("sun-dot").style.left = `${Math.min(1, s.dayTime / C.dayDuration) * 100}%`;
  $("phase-label").textContent =
    s.phase === "PREPARATION"
      ? tf("doorsOpen", {
          seconds: Math.ceil(C.preparationDuration - s.phaseTime),
        })
      : night
        ? t("afterSunset")
        : s.phase === "SUNSET"
          ? t("closing")
          : t("beforeSunset");
  const lowBreath = role === "killer" && p.holding && p.breath <= C.breathWarning;
  const breathLabel = p.cooldown > 0 ? tf("breathCooldown", { seconds: Math.ceil(p.cooldown) })
    : p.holding ? t(lowBreath ? "breathLow" : "holding")
    : p.breathDelay > 0 ? t("breathSettling")
    : p.breath < C.breathDuration ? t("recovering") : t("breath");
  const breathHint = p.breathNeedsRelease ? t("breathRelease")
    : p.cooldown > 0 || p.breath < C.breathRestart ? t("breathMinimum")
    : !p.still ? t("breathStillFirst") : t("breathReady");
  $("resource").innerHTML =
    role === "detective"
      ? `${t("bullets")}<div class="bullets">${Array.from({ length: 4 }, (_, i) => `<span class="${i >= s.ammo ? "spent" : ""}">●</span>`).join("")}</div>`
      : `${breathLabel} · ${p.breath.toFixed(1)} / ${C.breathDuration}s<div class="breath-bar${lowBreath ? " low" : ""}"><i style="width:${(p.breath / C.breathDuration) * 100}%"></i></div><small class="breath-status">${p.holding ? t(lowBreath ? "breathReleaseSoon" : "breathHoldingHint") : breathHint}</small>`;
  let place = rooms[0];
  if (p.x < -9) place = p.z < 0 ? rooms[1] : rooms[2];
  if (p.x > 9) place = p.z < 0 ? rooms[3] : rooms[4];
  $("location").innerHTML = `${place.name}<span>${place.sub}</span>`;
  $("controls-hint").innerHTML =
    role === "detective"
      ? t("detectiveControls")
      : t("killerControls");
  const nearest = role === "killer" ? game.nearestSpot() : null;
  $("interaction").textContent =
    role === "detective" && s.phase === "DAY"
      ? p.inspectProgress > 0
        ? tf("inspecting", { percent: Math.min(100, Math.round(p.inspectProgress / C.inspectDuration * 100)) })
        : game.inspectionTarget() ? t("inspectHint") : s.ammo === 0 ? t("noAmmo") : ""
      : role === "killer" && !night
      ? s.players.detective.inspectTarget === "killer"
        ? t("inspectionPressure")
        : p.still
        ? t("leaveStill") + (nearest && p.spotId === null ? ` · ${tf("enterPose", { pose: t(`pose_${nearest.pose}`) })}` : "")
        : nearest
          ? `${t("enterStill")} · ${tf("enterPose", { pose: t(`pose_${nearest.pose}`) })}`
          : t("enterStill")
      : night && role === "killer"
        ? t("attack")
        : "";
  $("crosshair").style.opacity = role === "detective" ? 1 : 0.2;
  document.body.classList.toggle(
    "night",
    night ||
      s.phase === "SUNSET" ||
      (s.phase === "GAME_OVER" && s.dayTime >= 420),
  );
  const tension = role === "killer" ? game.tension() : 0;
  $("vignette").style.opacity = role === "killer" ? tension * 0.26 : 0;
  if (role === "killer") sound.update(tension, s.elapsed, night);
  if (s.phase !== lastPhase) {
    lastPhase = s.phase;
    if (s.phase === "PREPARATION")
      phaseCard(
        t(role),
        role === "detective"
          ? t("detectivePrep")
          : t("killerPrep"),
        t("compose"),
      );
    if (s.phase === "DAY")
      phaseCard(
        role === "detective" ? t("findHim") : t("dontMove"),
        role === "detective"
          ? t("fourBullets")
          : t("shadowWait"),
        t("galleryOpen"),
      );
    if (s.phase === "SUNSET")
      phaseCard(t("closingTime"), t("galleryClosed"), "18:00");
    if (s.phase === "NIGHT")
      phaseCard(
        role === "detective" ? t("run") : t("yourTurn"),
        role === "detective"
          ? t("findExit")
          : t("huntTime"),
        t("afterSunset"),
      );
    if (s.phase === "GAME_OVER") {
      document.exitPointerLock();
      $("pause").hidden = true;
      $("results").hidden = false;
      const result = s.result;
      $("result-title").textContent =
        result === "FOUND YOU"
          ? t("foundYou")
          : result === "ESCAPED"
            ? t("escaped")
            : result === "SURVIVED"
              ? t("survived")
              : t("detected");
      $("winner").textContent =
        t(result === "FOUND YOU" ? "killerWins" : "detectiveWins");
      $("result-copy").textContent =
        result === "FOUND YOU"
          ? t("resultFound")
          : result === "ESCAPED"
            ? t("resultEscaped")
            : result === "SURVIVED"
              ? t("resultSurvived")
              : t("resultDetected");
    }
  }
  $("phase-card").style.opacity = now < phaseUntil ? 1 : 0;
  $("toast").style.opacity = now < toastUntil ? 1 : 0;
  // Actual blackout lasts 0.4 seconds, within a longer closing announcement.
  $("blackout").style.opacity =
    s.phase === "SUNSET" && s.phaseTime > 0.65 && s.phaseTime < 1.05 ? 1 : 0;
  $("debug").hidden = !debug || mode !== "local";
  if (debug) {
    const sun = sunAt(s.dayTime);
    $("debug").textContent =
      `LOCAL DEBUG  [F2]\nSTATE    ${s.phase}\nSUN      ${((sun.elevation * 180) / Math.PI).toFixed(1)}° / ${((sun.azimuth * 180) / Math.PI).toFixed(1)}°\nDAY      ${(420 - s.dayTime).toFixed(1)} s left\nNIGHT    ${(45 - s.nightTime).toFixed(1)} s left\nIN FOV   ${game.tension() > 0.05}\nSPOT     ${s.players.killer.spotId ?? "—"}\nBREATH   ${s.players.killer.breath.toFixed(1)}\nBOT      ${botEnabled ? "ON" : "OFF"}\nDRAW     ${gallery.renderer.info.render.calls}\nF3 +45s · F4 sunset · F6 night\nF7 ammo · F8 spots · F9 bot · Tab role`;
  }
}
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.06);
  lastTime = now;
  if (started && !paused) {
    view.yaw +=
      (Number(keys.has("ArrowLeft")) - Number(keys.has("ArrowRight"))) *
      dt *
      1.6;
    view.pitch = Math.max(
      -1.15,
      Math.min(
        1.15,
        view.pitch +
          (Number(keys.has("ArrowUp")) - Number(keys.has("ArrowDown"))) * dt,
      ),
    );
  }
  if (started) {
    if (mode === "local" && !paused) {
      game.input(role, input());
      if (botEnabled)
        bot.tick(dt, role === "detective" ? "killer" : "detective");
      game.tick(dt);
      state = game.state;
    }
    if (mode === "online") {
      networkClock += dt;
      if (networkClock > 1 / 30) {
        connection.send("input", {
          input: paused ? { yaw: backYaw(), pitch: view.pitch } : input(),
        });
        networkClock %= 1 / 30;
      }
    }
    for (const e of state.events) {
      if (e.id <= eventId) continue;
      eventId = e.id;
      // STILL locks the body, but listening direction follows the free camera.
      sound.event(e, { ...state.players[role], yaw: backYaw() }, role);
      if (e.type === "shot") gallery.shot(e.point, e.surface);
      if (e.type === "mark" && role === "detective" && e.placed)
        toast(t("markPlaced"));
      if (e.type === "mark-alert" && role === "detective")
        toast(tf("markAlert", { spot: e.spotId + 1 }));
      if (e.type === "inspected" && role === "detective") toast(t("inspected"));
      if (e.type === "penalty" && role === "detective")
        toast(t("emptyShot"));
      if (e.type === "gasp" && role === "killer")
        toast(t("gasp"));
    }
    hudClock += dt;
    if (hudClock >= 1 / 15 || state.phase !== lastPhase) {
      hud(now);
      hudClock = 0;
    }
  }
  const rendered = mode === "online" ? snapshots.sample(state, now) : state;
  gallery.update(rendered, role, { yaw: backYaw(), pitch: view.pitch }, dt, {
    menu: mode === "menu",
    showSpots: mode === "local" && showSpots,
    aim,
    posePreview: role === "killer" && ["PREPARATION", "DAY"].includes(state.phase)
      && (!state.players.killer.still || state.players.killer.spotId === null) ? game.nearestSpot() : null,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Inspection hooks are deliberately local-only. Online rules stay server-owned.
window.still = {
  get state() {
    return state;
  },
  get mode() {
    return mode;
  },
  get role() {
    return role;
  },
  get renderer() {
    return gallery.renderer;
  },
  get scene() {
    return gallery;
  },
  debug(action) {
    if (mode === "local") game.debugAction(action);
  },
  setPlayer(r, data) {
    if (mode === "local") Object.assign(state.players[r], data);
  },
  setView(yaw, pitch = 0) {
    if (mode === "local") view = { yaw, pitch };
  },
  get botEnabled() {
    return botEnabled;
  },
  set botEnabled(v) {
    if (mode === "local") {
      botEnabled = v;
      game.inputs = {};
    }
  },
  action,
  bind(action, code) {
    if (action in BINDINGS) {
      bindings[action] = code;
      localStorage.setItem("still.bindings", JSON.stringify(bindings));
    }
  },
};
connection.resumeSaved();
