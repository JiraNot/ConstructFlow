import { packageDirectories as orderedPackages } from "./package_order.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

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
  if (response.status !== 0) {
    if (capture) {
      process.stdout.write(response.stdout?.toString() ?? '');
      process.stderr.write(response.stderr?.toString() ?? '');
    }
    process.exit(response.status ?? 1);
  }
  return capture
    ? { stdout: response.stdout.toString(), stderr: response.stderr.toString() }
    : undefined
}

function runDirect(label, command, args, cwd, capture = false) {
  console.log(`\n${label}: ${command} ${args.join(" ")}`);
  const response = spawnSync(command, args, {
    cwd,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (response.error) throw response.error;
  const output = capture
    ? `${response.stdout?.toString() ?? ""}${response.stderr?.toString() ?? ""}`
    : "";
  if (capture) process.stdout.write(output);
  if (response.status !== 0) process.exit(response.status ?? 1);
  return output;
}

const buildResults = [];
const testSuites = [];
const integrationResults = [];
let planEditorBuildOutput = "";
for (const directory of packages) {
  if (process.argv.includes("--install"))
    run(directory, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
  const result = run(directory, ["run", "build"], true);
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  buildResults.push({ directory, result: "PASS" });
  if (directory === "apps/plan-editor") planEditorBuildOutput = output;
}
let totalTests = 0
for (const directory of [
  "packages/geometry-kernel",
  "packages/family-engine",
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
  "apps/plan-editor",
]) {
  const result = run(directory, ["test"], true)
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
  process.stdout.write(result.stdout ?? "")
  process.stderr.write(result.stderr ?? "")
  const match = output.match(/ℹ tests (\d+)/)
  if (match) totalTests += Number(match[1])
  else throw new Error(`Could not read Node test count for ${directory}`)
  testSuites.push({ directory, tests: Number(match[1]) });
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
testSuites.push({ directory: "apps/mcp-server (Node runtime)", tests: Number(mcpSummary[1]) });
const pythonOutput = runDirect("apps/mcp-server Python tests", process.platform === "win32" ? "python" : "python3", ["test_server.py"], resolve(root, "apps/mcp-server"), true);
const pythonSummary = pythonOutput.match(/Ran (\d+) tests?/);
if (!pythonSummary) throw new Error("Could not read Python test count for apps/mcp-server");
testSuites.push({ directory: "apps/mcp-server (Python)", tests: Number(pythonSummary[1]) });
const integrationVerifiers = ["verify:kitchen", "verify:renovation-integration", "verify:file-io", "verify:phases", "verify:coordination", "verify:house-demo"];
for (const verifier of integrationVerifiers) {
  run(".", ["run", verifier]);
  integrationResults.push({ verifier, result: "PASS" });
}

const commitResult = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd: root,
  encoding: "utf8",
});
if (commitResult.error) throw commitResult.error;
const commit = commitResult.status === 0 ? commitResult.stdout.trim() : "unavailable";
const buildWarnings = planEditorBuildOutput
  .split(/\r?\n/)
  .filter((line) => /^\s*\(!\)/.test(line));
const largeChunks = planEditorBuildOutput
  .split(/\r?\n/)
  .flatMap((line) => {
    const match = line.match(/^\s*dist\/assets\/([^\s]+\.js)\s+([\d,.]+) kB\s+│ gzip:\s+([\d,.]+) kB/);
    if (!match || Number(match[2].replaceAll(",", "")) <= 500) return [];
    return [{ file: match[1], minified: match[2], gzip: match[3] }];
  });
const suiteRows = testSuites
  .map(({ directory, tests }) => `| \`${directory}\` | ${tests} | PASS |`)
  .join("\n");
const buildRows = buildResults
  .map(({ directory, result }) => `| \`${directory}\` | ${result} |`)
  .join("\n");
const integrationRows = integrationResults
  .map(({ verifier, result }) => `| \`${verifier}\` | ${result} |`)
  .join("\n");
const warningText = buildWarnings.length
  ? buildWarnings.map((warning) => `- ${warning.trim()}`).join("\n")
  : "- None reported by the Plan Editor production build.";
const chunkRows = largeChunks.length
  ? largeChunks.map(({ file, minified, gzip }) => `| \`${file}\` | ${minified} kB | ${gzip} kB |`).join("\n")
  : "| — | — | — |";
const generatedAt = new Date().toISOString();
const status = `# Generated Build Status\n\nGenerated by \`scripts/test_standalone.mjs\` after the complete standalone verification run.\n\n- Generated at (UTC): ${generatedAt}\n- Source commit: \`${commit}\` (the working tree may contain uncommitted changes)\n- Build targets: ${buildResults.length} passed\n- Node tests: ${totalTests} passed across ${testSuites.length - 1} Node suites\n- Python tests: ${pythonSummary[1]} passed\n- Integration verifiers: ${integrationResults.length} passed\n\n## Build results\n\n| Target | Result |\n| --- | --- |\n${buildRows}\n\n## Test suites\n\n| Suite | Tests | Result |\n| --- | ---: | --- |\n${suiteRows}\n\n## Integration verifiers\n\n| Verifier | Result |\n| --- | --- |\n${integrationRows}\n\n## Plan Editor JavaScript chunks over 500 kB\n\n| Chunk | Minified | Gzip |\n| --- | ---: | ---: |\n${chunkRows}\n\n## Plan Editor production-build warnings\n\n${warningText}\n`;
const generatedDirectory = resolve(root, "docs/generated");
mkdirSync(generatedDirectory, { recursive: true });
writeFileSync(resolve(generatedDirectory, "BUILD-STATUS.md"), status, "utf8");
console.log(`\nStandalone verification passed: ${totalTests} Node tests across ${packages.length} build targets and ${integrationVerifiers.length} integration verifiers.`)
