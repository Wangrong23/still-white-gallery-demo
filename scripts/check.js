import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
function scan(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? scan(`${dir}/${e.name}`)
      : e.name.endsWith(".js")
        ? [`${dir}/${e.name}`]
        : [],
  );
}
for (const file of ["shared", "client", "server", "scripts", "tests"].flatMap(
  (d) => {
    try {
      return scan(d);
    } catch {
      return [];
    }
  },
)) {
  const r = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (r.status) {
    console.error(r.stderr);
    process.exit(1);
  }
}
console.log("All JavaScript modules pass syntax checks.");
