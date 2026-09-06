export const DEFAULT_SETTINGS = Object.freeze({
  volume: 1, ambience: 1, sensitivity: 1, invertY: false, voice: true, quality: "standard",
});
const KEY = "still.settings.v1";
export function normalizeSettings(value) {
  const v = value && typeof value === "object" ? value : {};
  const number = (key, min, max) => typeof v[key] === "number" && Number.isFinite(v[key])
    ? Math.max(min, Math.min(max, v[key])) : DEFAULT_SETTINGS[key];
  return {
    volume: number("volume", 0, 1), ambience: number("ambience", 0, 1),
    sensitivity: number("sensitivity", .25, 3),
    invertY: typeof v.invertY === "boolean" ? v.invertY : false,
    voice: typeof v.voice === "boolean" ? v.voice : true,
    quality: ["standard", "performance"].includes(v.quality) ? v.quality : "standard",
  };
}
export function loadSettings(storage) {
  try { return normalizeSettings(JSON.parse(storage.getItem(KEY))); }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(storage, value) {
  try { storage.setItem(KEY, JSON.stringify(normalizeSettings(value))); return true; }
  catch { return false; }
}

export function mountSettings({ language, storage, onChange }) {
  const zh = language === "zh";
  const copy = zh ? {
    title: "设置", close: "完成", volume: "总音量", ambience: "展馆环境声",
    sensitivity: "鼠标灵敏度", invertY: "反转鼠标纵轴", voice: "闭馆广播",
    quality: "画面清晰度", standard: "标准", performance: "性能优先",
    note: "偏好会自动记住。选“性能优先”可降低分辨率。联机时，展厅里的钟仍在走。",
    reset: "恢复默认", failed: "当前浏览器无法保存设置，本次调整仍然生效。",
  } : {
    title: "Settings", close: "Done", volume: "Master volume", ambience: "Room ambience",
    sensitivity: "Mouse sensitivity", invertY: "Invert mouse Y", voice: "Closing announcement",
    quality: "Render resolution", standard: "Standard", performance: "Performance",
    note: "Your preferences are saved here. Performance mode lowers resolution. Online, the clock keeps running.",
    reset: "Restore defaults", failed: "This browser cannot save settings. Changes still apply for this session.",
  };
  let settings = loadSettings(storage);
  const dialog = document.createElement("dialog");
  dialog.id = "settings";
  dialog.setAttribute("aria-labelledby", "settings-title");
  dialog.innerHTML = `<h2 id="settings-title">${copy.title}</h2><p class="settings-note">${copy.note}</p>
    <div class="settings-fields"></div><p id="settings-status" role="status"></p>
    <div class="settings-actions"><button type="button" id="settings-reset">${copy.reset}</button>
    <button type="button" id="settings-close" class="primary">${copy.close}</button></div>`;
  document.body.append(dialog);
  const fields = dialog.querySelector(".settings-fields");
  for (const [key, min, max, step] of [["volume",0,1,.05],["ambience",0,1,.05],["sensitivity",.25,3,.05]]) {
    fields.insertAdjacentHTML("beforeend", `<label for="setting-${key}">${copy[key]} <output id="value-${key}"></output></label>
      <input id="setting-${key}" data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}">`);
  }
  for (const key of ["invertY", "voice"])
    fields.insertAdjacentHTML("beforeend", `<label class="setting-toggle" for="setting-${key}">${copy[key]}
      <input id="setting-${key}" data-setting="${key}" type="checkbox"></label>`);
  fields.insertAdjacentHTML("beforeend", `<label for="setting-quality">${copy.quality}</label>
    <select id="setting-quality" data-setting="quality"><option value="standard">${copy.standard}</option><option value="performance">${copy.performance}</option></select>`);
  const sync = () => {
    fields.querySelectorAll("[data-setting]").forEach((input) => {
      const key = input.dataset.setting;
      if (input.type === "checkbox") input.checked = settings[key]; else input.value = settings[key];
      const output = dialog.querySelector(`#value-${key}`);
      if (output) output.textContent = key === "sensitivity" ? `${settings[key].toFixed(2)}×` : `${Math.round(settings[key]*100)}%`;
    });
  };
  const apply = () => {
    onChange(settings); sync();
    dialog.querySelector("#settings-status").textContent = saveSettings(storage, settings) ? "" : copy.failed;
  };
  fields.addEventListener("input", (e) => {
    const input = e.target, key = input.dataset.setting;
    if (!key) return;
    settings = normalizeSettings({ ...settings, [key]: input.type === "checkbox" ? input.checked
      : input.type === "range" ? Number(input.value) : input.value });
    apply();
  });
  dialog.querySelector("#settings-reset").onclick = () => { settings = { ...DEFAULT_SETTINGS }; apply(); };
  dialog.querySelector("#settings-close").onclick = () => dialog.close();
  sync(); onChange(settings);
  for (const id of ["settings-button", "pause-settings"]) {
    const button = document.getElementById(id);
    button.textContent = copy.title;
    button.onclick = () => dialog.showModal();
  }
  return dialog;
}
