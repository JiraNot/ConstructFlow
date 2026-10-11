import { packageDirectories as orderedPackages } from "./package_order.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const packages = [...orderedPackages, "apps/plan-editor"];

function run(directory, args, capture = false) {
  console.log(`\n${directory}: npm ${args.join(" ")}`);
  const windows = process.platform === "win32";
  const response = spawnSync(
    windows ? (process.env.ComSpec ?? "cmd.exe") : "npm",
    windows ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args,
    {
      cwd: resolve(root, directory),
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    },
  );
  if (response.error) throw response.error;
  if (response.status !== 0) process.exit(response.status ?? 1);
  return capture
    ? { stdout: response.stdout.toString(), stderr: response.stderr.toString() }
    : undefined
}

function runDirect(label, command, args, cwd) {
  console.log(`\n${label}: ${command} ${args.join(" ")}`);
  const response = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (response.error) throw response.error;
  if (response.status !== 0) process.exit(response.status ?? 1);
}

for (const directory of packages) {
  if (process.argv.includes("--install"))
    run(directory, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
  run(directory, ["run", "build"]);
}
let totalTests = 0
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
  "packages/takeoff-engine",
  "packages/clash-engine",
  "packages/sheet-engine",
  "packages/command-runtime",
  "packages/extension-engine",
  "packages/cad-adapter",
  "packages/bim-adapter",
]) {
  const result = run(directory, ["test"], true)
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
  process.stdout.write(result.stdout ?? "")
  process.stderr.write(result.stderr ?? "")
  const match = output.match(/ℹ tests (\d+)/)
  if (match) totalTests += Number(match[1])
  else throw new Error(`Could not read Node test count for ${directory}`)
}
const mcpNodeTests = spawnSync(process.execPath, ["--test", "test_standalone_runtime.mjs"], {
  cwd: resolve(root, "apps/mcp-server"),
  stdio: ["ignore", "pipe", "pipe"],
});
if (mcpNodeTests.error) throw mcpNodeTests.error;
process.stdout.write(mcpNodeTests.stdout.toString());
process.stderr.write(mcpNodeTests.stderr.toString());
if (mcpNodeTests.status !== 0) process.exit(mcpNodeTests.status ?? 1);
const mcpSummary = `${mcpNodeTests.stdout}\n${mcpNodeTests.stderr}`.match(/ℹ tests (\d+)/);
if (!mcpSummary) throw new Error("Could not read Node test count for apps/mcp-server standalone runtime");
totalTests += Number(mcpSummary[1]);
runDirect("apps/mcp-server Python tests", process.platform === "win32" ? "python" : "python3", ["test_server.py"], resolve(root, "apps/mcp-server"));
for (const verifier of ["verify:kitchen", "verify:file-io", "verify:phases", "verify:coordination"])
  run(".", ["run", verifier]);
console.log(`\nStandalone verification passed: ${totalTests} Node tests across ${packages.length} build targets and ${4} integration verifiers.`)
