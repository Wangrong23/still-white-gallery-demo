// The browser viewport stays native; only the game stage rotates clockwise.
export function landscapeLayout(width, height, active) {
  const rotated = active && height > width;
  return { width: rotated ? height : width, height: rotated ? width : height, rotated };
}
export function stagePoint(x, y, rect, rotated) {
  return rotated ? { x: y - rect.top, y: rect.right - x } : { x: x - rect.left, y: y - rect.top };
}
export function joystick(dx, dy, radius = 48) {
  const distance = Math.hypot(dx, dy);
  if (distance < 8) return { forward: 0, strafe: 0, sprint: false };
  const strength = Math.min(1, (distance - 8) / (radius - 8));
  return { forward: -dy / distance * strength, strafe: dx / distance * strength,
    sprint: dy < -radius * 1.3 && Math.abs(dx) < -dy * .7 };
}

export function mountMobile({ language, onResize, onReset, onLook, onAction, onAim, onWake }) {
  const zh = language === "zh";
  const root = document.createElement("div"); root.id = "game-stage";
  document.body.prepend(root);
  for (const id of ["game", "paper", "vignette", "blackout", "hud", "pause", "results"])
    root.append(document.getElementById(id));
  const layer = document.createElement("div"); layer.id = "touch-controls"; layer.hidden = true;
  const labels = zh ? { move: "移动 · 上推短跑", look: "滑动观察", aim: "举枪", shoot: "开火", inspect: "检查", lookBack: "回头", flashlight: "手电", pose: "姿势", breath: "屏息", attack: "袭击" }
    : { move: "MOVE · PUSH UP TO RUN", look: "DRAG TO LOOK", aim: "Aim", shoot: "Fire", inspect: "Examine", lookBack: "Look back", flashlight: "Light", pose: "Pose", breath: "Breath", attack: "Attack" };
  layer.innerHTML = `<div class="touch-look" aria-label="${labels.look}"></div><div class="touch-stick" aria-label="${labels.move}"><i></i><span>${labels.move}</span></div><div class="touch-actions"></div>`;
  root.append(layer);
  const buttons = {};
  for (const name of ["lookBack", "flashlight", "aim", "inspect", "shoot", "pose", "breath", "attack"]) {
    const button = document.createElement("button"); button.type = "button"; button.dataset.touch = name;
    button.textContent = labels[name]; button.setAttribute("aria-label", labels[name]);
    layer.querySelector(".touch-actions").append(button); buttons[name] = button;
  }
  const stick = layer.querySelector(".touch-stick"), knob = stick.querySelector("i"), look = layer.querySelector(".touch-look");
  let enabled = matchMedia("(pointer: coarse)").matches, active = false, usable = false, currentRole = "", phase = "";
  let layout = {}, signature = "", aiming = false;
  const pointers = new Map();
  const controls = { forward: 0, strafe: 0, sprint: false, breath: false, inspect: false, lookBack: false };
  const reset = () => {
    const oldPointers = [...pointers]; pointers.clear();
    for (const [id, p] of oldPointers) if (p.element.hasPointerCapture?.(id)) p.element.releasePointerCapture(id);
    Object.assign(controls, { forward: 0, strafe: 0, sprint: false, breath: false, inspect: false, lookBack: false });
    knob.style.transform = "translate(-50%, -50%)";
    aiming = false; onAim(false);
    Object.values(buttons).forEach(b => b.classList.remove("pressed"));
    onReset();
  };
  const resize = () => {
    const viewport = window.visualViewport;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const next = landscapeLayout(width, height, enabled && active);
    const nextSignature = `${width},${height},${viewport?.offsetLeft || 0},${viewport?.offsetTop || 0},${next.rotated},${enabled},${active}`;
    if (signature === nextSignature) return;
    signature = nextSignature; layout = next; reset();
    root.style.width = `${next.width}px`; root.style.height = `${next.height}px`;
    root.style.left = `${viewport?.offsetLeft || 0}px`; root.style.top = `${viewport?.offsetTop || 0}px`;
    root.style.transform = next.rotated ? `translateX(${width}px) rotate(90deg)` : "translateZ(0)";
    root.classList.toggle("mobile-game", enabled && active);
    root.classList.toggle("rotated-stage", next.rotated);
    document.body.classList.toggle("touch-device", enabled);
    onResize();
  };
  const point = event => stagePoint(event.clientX, event.clientY, root.getBoundingClientRect(), layout.rotated);
  const updateStick = p => {
    const dx = p.last.x - p.start.x, dy = p.last.y - p.start.y;
    const moving = controls.forward || controls.strafe;
    Object.assign(controls, joystick(dx, dy));
    const scale = Math.min(1, 48 / (Math.hypot(dx, dy) || 1));
    knob.style.transform = `translate(calc(-50% + ${dx * scale}px), calc(-50% + ${dy * scale}px))`;
    if (!moving && (controls.forward || controls.strafe)) onWake();
  };
  const down = (event, type, element) => {
    if (!usable || event.pointerType === "mouse" || [...pointers.values()].some(p => p.type === type)) return;
    event.preventDefault();
    const position = point(event);
    pointers.set(event.pointerId, { type, element, start: position, last: position });
    element.setPointerCapture(event.pointerId);
    if (type === "move" || type === "look") return;
    element.classList.add("pressed");
    if (["breath", "inspect", "lookBack"].includes(type)) controls[type] = true;
    else if (type === "aim") { aiming = !aiming; onAim(aiming); }
    else onAction(type);
  };
  stick.addEventListener("pointerdown", e => down(e, "move", stick));
  look.addEventListener("pointerdown", e => down(e, "look", look));
  Object.entries(buttons).forEach(([name, button]) => button.addEventListener("pointerdown", e => down(e, name, button)));
  layer.addEventListener("pointermove", event => {
    const p = pointers.get(event.pointerId); if (!p) return;
    event.preventDefault(); const next = point(event);
    if (p.type === "look") onLook(next.x - p.last.x, next.y - p.last.y);
    p.last = next;
    if (p.type === "move") updateStick(p);
  });
  const release = event => {
    const p = pointers.get(event.pointerId); if (!p) return;
    pointers.delete(event.pointerId);
    if (p.type === "move") {
      Object.assign(controls, { forward: 0, strafe: 0, sprint: false });
      knob.style.transform = "translate(-50%, -50%)";
    } else if (["breath", "inspect", "lookBack"].includes(p.type)) controls[p.type] = false;
    p.element.classList.toggle("pressed", p.type === "aim" && aiming);
    if (p.element.hasPointerCapture?.(event.pointerId)) p.element.releasePointerCapture(event.pointerId);
  };
  for (const type of ["pointerup", "lostpointercapture"]) layer.addEventListener(type, release);
  layer.addEventListener("pointercancel", reset);
  // Touch must not synthesize desktop shooting/click handlers.
  layer.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); });
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("scroll", resize);
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", () => { if (document.hidden) reset(); });
  document.addEventListener("pointerdown", event => {
    if (event.pointerType !== "touch" || enabled) return;
    enabled = true; resize();
  }, true);
  resize();
  return {
    get enabled() { return enabled; }, controls, reset,
    update({ started, paused, modal, role, state, poseAvailable }) {
      const nextUsable = enabled && started && !paused && !modal && state.phase !== "GAME_OVER";
      if (active !== started) { active = started; resize(); }
      if (enabled && (usable !== nextUsable || currentRole !== role || phase !== state.phase)) reset();
      usable = nextUsable; currentRole = role; phase = state.phase; layer.hidden = !usable;
      const detective = role === "detective", night = phase === "NIGHT", day = ["PREPARATION", "DAY"].includes(phase);
      const visible = { lookBack: detective, flashlight: detective && night, aim: detective,
        inspect: detective && phase === "DAY", shoot: detective && (phase === "DAY" || night),
        pose: !detective && day && poseAvailable, breath: !detective && day, attack: !detective && night };
      for (const [name, button] of Object.entries(buttons)) if (button.hidden !== !visible[name]) button.hidden = !visible[name];
    },
  };
}
