import test from "node:test";
import assert from "node:assert/strict";
import { BINDINGS } from "../shared/config.js";
import { rebind, loadBindings, saveBindings } from "../client/bindings.js";

test("bindings persist, retain role-specific F sharing, and reject conflicts and reserved keys", () => {
  let value = null;
  const storage = { getItem: () => value, setItem: (_, next) => { value = next; } };
  assert.deepEqual(loadBindings(storage), BINDINGS);
  const next = rebind(BINDINGS, "breath", "KeyB");
  assert.equal(saveBindings(storage, next), true);
  assert.deepEqual(loadBindings(storage), next);
  assert.equal(rebind(next, "forward", "KeyB"), null);
  assert.equal(rebind(next, "forward", "KeyF"), null);
  assert.ok(rebind(next, "pose", "KeyF"));
  for (const code of ["Escape", "Tab", "F2", "ArrowUp", "<script>", null])
    assert.equal(rebind(next, "breath", code), null);
  assert.equal(rebind(next, "__proto__", "KeyB"), null);
  value = JSON.stringify({ forward: "KeyS" });
  assert.deepEqual(loadBindings(storage), BINDINGS);
  value = "{";
  assert.deepEqual(loadBindings(storage), BINDINGS);
  assert.equal(saveBindings({ setItem() { throw Error(); } }, next), false);
});

test("translated controls follow bindings without replacing the pose name placeholder", async () => {
  globalThis.localStorage = { getItem: () => "zh" };
  globalThis.navigator ??= { language: "zh" };
  const { t, tf, setControlBindings } = await import("../client/i18n.js");
  setControlBindings({ ...BINDINGS, breath: "KeyB", pose: "KeyG" });
  assert.match(t("breathReady"), /B/);
  assert.match(t("help"), /<kbd>B<\/kbd>/);
  assert.equal(tf("enterPose", { pose: "贴墙" }), "G · 贴墙");
  assert.doesNotMatch(t("killerControls"), /\{/);
});
