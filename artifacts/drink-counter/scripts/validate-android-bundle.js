const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { getAndroidProductionEnv } = require("./android-production-env");

const projectRoot = path.resolve(__dirname, "..");

function findWorkspaceRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("Could not find workspace root (no pnpm-workspace.yaml found).");
}

function main() {
  const workspaceRoot = findWorkspaceRoot(projectRoot);
  const outputDir = path.join(
    workspaceRoot,
    ".local",
    "android-build",
    "bundle-preflight",
  );
  const env = getAndroidProductionEnv();

  fs.rmSync(outputDir, { recursive: true, force: true });
  console.log(
    `Validating the Android production bundle for https://${env.EXPO_PUBLIC_DOMAIN}...`,
  );

  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "expo",
      "export",
      "--platform",
      "android",
      "--output-dir",
      outputDir,
    ],
    {
      cwd: projectRoot,
      env,
      stdio: "inherit",
    },
  );

  fs.rmSync(outputDir, { recursive: true, force: true });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log("Android production bundle validation passed.");
}

try {
  main();
} catch (error) {
  console.error(`Android bundle validation failed: ${error.message}`);
  process.exit(1);
}
