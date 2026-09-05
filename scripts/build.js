import { cp, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const check = spawnSync(process.execPath, ["scripts/check.js"], {
  stdio: "inherit",
});
if (check.status) process.exit(check.status);
await mkdir("dist/vendor", { recursive: true });
for (const path of ["client", "shared", "index.html"])
  await cp(path, `dist/${path}`, { recursive: true });
for (const name of ["three.module.js", "three.core.js"])
  await cp(`node_modules/three/build/${name}`, `dist/vendor/${name}`);
await writeFile(
  "dist/DEPLOYMENT.txt",
  "Static preview build. For working HOST/JOIN deploy the full project with Node.js and npm start (see README).\n",
);
console.log(
  "Browser assets built in dist/. Full multiplayer runs with npm start.",
);
