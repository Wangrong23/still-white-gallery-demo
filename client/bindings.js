import { BINDINGS } from "../shared/config.js";

const KEY = "still.bindings";
export const validKey = (code) => typeof code === "string" && /^(Key[A-Z]|Digit[0-9]|Space|ShiftLeft|ShiftRight)$/.test(code);
const overlaps = (a, b) => a === b || !([a, b].includes("pose") && [a, b].includes("flashlight"));
export function rebind(bindings, action, code) {
  if (!Object.hasOwn(BINDINGS, action) || !validKey(code)) return null;
  if (Object.entries(bindings).some(([other, assigned]) => other !== action && assigned === code && overlaps(action, other))) return null;
  return { ...bindings, [action]: code };
}
export function loadBindings(storage) {
  try {
    const saved = JSON.parse(storage.getItem(KEY));
    const result = Object.fromEntries(Object.entries(BINDINGS).map(([action, code]) => [action, validKey(saved?.[action]) ? saved[action] : code]));
    // Reject an inconsistent map as a whole so fallback keys never create new conflicts.
    return Object.entries(result).every(([action, code]) => rebind(result, action, code)) ? result : { ...BINDINGS };
  } catch { return { ...BINDINGS }; }
}
export function saveBindings(storage, bindings) {
  try { storage.setItem(KEY, JSON.stringify(bindings)); return true; } catch { return false; }
}
export function keyLabel(code) {
  return code.replace(/^Key|^Digit/, "").replace("ShiftLeft", "L Shift").replace("ShiftRight", "R Shift");
}

export function mountBindings(dialog, { language, storage, onChange }) {
  const zh = language === "zh";
  const labels = zh
    ? ["前进", "后退", "向左", "向右", "短跑", "警探 · 检查", "来客 · 特殊姿势", "屏息", "警探 · 手电", "警探 · 回头"]
    : ["Forward", "Backward", "Left", "Right", "Sprint", "Detective · Examine", "Visitor · Pose", "Hold breath", "Detective · Flashlight", "Detective · Look back"];
  let bindings = loadBindings(storage), pending = null;
  const section = document.createElement("section");
  section.className = "binding-fields";
  section.innerHTML = `<h3>${zh ? "键盘操作" : "Keyboard controls"}</h3><p class="settings-note">${zh ? "点击按键后按字母、数字、Shift 或空格。Esc 取消。方向键观察、鼠标和演练快捷键保持固定。" : "Select a key, then press a letter, number, Shift or Space. Esc cancels. Arrow-key look, mouse and rehearsal shortcuts stay fixed."}</p><div class="binding-list"></div><p role="status" class="binding-status"></p>`;
  dialog.querySelector(".settings-actions").before(section);
  const list = section.querySelector(".binding-list"), status = section.querySelector(".binding-status");
  const sync = () => list.querySelectorAll("button").forEach(button => {
    button.textContent = pending === button.dataset.action ? (zh ? "请按键…" : "Press a key…") : keyLabel(bindings[button.dataset.action]);
    button.setAttribute("aria-pressed", String(pending === button.dataset.action));
  });
  Object.keys(BINDINGS).forEach((action, index) => {
    const row = document.createElement("div"), label = document.createElement("span"), button = document.createElement("button");
    label.textContent = labels[index]; label.id = `binding-${action}`;
    button.type = "button"; button.dataset.action = action;
    button.setAttribute("aria-describedby", label.id);
    button.onclick = () => { pending = action; status.textContent = ""; sync(); };
    row.append(label, button); list.append(row);
  });
  const apply = () => {
    pending = null; sync(); onChange(bindings);
    status.textContent = saveBindings(storage, bindings) ? "" : (zh ? "无法保存，本次调整仍生效。" : "Cannot save. Changes apply for this session.");
  };
  dialog.addEventListener("keydown", event => {
    if (!pending) return;
    event.preventDefault(); event.stopPropagation();
    if (event.code === "Escape") { pending = null; sync(); return; }
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const next = rebind(bindings, pending, event.code);
    if (!next) { status.textContent = zh ? "该按键被占用或保留，请选择其他按键。" : "That key is assigned or reserved. Choose another."; return; }
    bindings = next; apply();
  });
  dialog.addEventListener("close", () => { pending = null; sync(); });
  dialog.querySelector("#settings-reset").addEventListener("click", () => { bindings = { ...BINDINGS }; apply(); });
  sync(); onChange(bindings);
  return { bind(action, code) { const next = rebind(bindings, action, code); if (!next) return false; bindings = next; apply(); return true; } };
}
