import { packageDirectories } from "./package_order.mjs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const app = "apps/plan-editor";
const windows = process.platform === "win32";

function build(directory) {
  process.stdout.write(`\n${directory}: npm run build\n`);
  const command = windows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const args = windows
    ? ["/d", "/s", "/c", "npm run build"]
    : ["run", "build"];
  const result = spawnSync(command, args, {
    cwd: resolve(root, directory),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const directory of packageDirectories) build(directory);
build(app);
