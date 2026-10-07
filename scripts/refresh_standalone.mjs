import { spawnSync } from "node:child_process";
import { packageDirectories } from "./package_order.mjs";
for (const path of packageDirectories) {
  for (const args of [
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    ["run", "build"],
  ]) {
    console.log(`${path}: npm ${args.join(" ")}`);
    const windows = process.platform === "win32";
    const result = spawnSync(
      windows ? (process.env.ComSpec ?? "cmd.exe") : "npm",
      windows ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args,
      { cwd: path, stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
