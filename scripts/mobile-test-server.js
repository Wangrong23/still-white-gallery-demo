// Local-only real-game fixture. Production does not expose tests.
import { readFile } from "node:fs/promises";
import { createApp } from "../server/index.js";
const app = createApp({ port: 5108, host: "127.0.0.1" });
const serve = app.server.listeners("request")[0];
app.server.removeListener("request", serve);
app.server.on("request", async (req, res) => {
  if (req.url !== "/tests/mobile-browser.html") return serve(req, res);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(await readFile(new URL("../tests/mobile-browser.html", import.meta.url)));
});
await app.start();
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => app.close().then(() => process.exit(0)));
