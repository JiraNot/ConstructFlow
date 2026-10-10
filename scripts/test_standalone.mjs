import { packageDirectories as orderedPackages } from "./package_order.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const packages = [...orderedPackages, "apps/plan-editor"];

function run(directory, args) {
  console.log(`\n${directory}: npm ${args.join(" ")}`);
  const windows = process.platform === "win32";
  const response = spawnSync(
    windows ? (process.env.ComSpec ?? "cmd.exe") : "npm",
    windows ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args,
    {
      cwd: resolve(root, directory),
      stdio: "inherit",
    },
  );
  if (response.error) throw response.error;
  if (response.status !== 0) process.exit(response.status ?? 1);
}

for (const directory of packages) {
  if (process.argv.includes("--install"))
    run(directory, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
  run(directory, ["run", "build"]);
}
for (const directory of [
  "packages/geometry-kernel",
  "packages/project-model",
  "packages/snapping-engine",
  "packages/constraint-engine",
  "packages/representation-engine",
  "packages/architecture-engine",
  "packages/roof-engine",
  "packages/drainage-engine",
  "packages/electrical-engine",
  "packages/clash-engine",
  "packages/sheet-engine",
  "packages/command-runtime",
  "packages/extension-engine",
  "packages/cad-adapter",
  "packages/bim-adapter",
])
  run(directory, ["test"]);
for (const verifier of ["verify:kitchen", "verify:file-io", "verify:phases", "verify:coordination"])
  run(".", ["run", verifier]);
