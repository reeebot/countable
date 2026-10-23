const { spawnSync } = require("node:child_process");
const { getAndroidProductionEnv } = require("./android-production-env");

const [expoCli, ...expoArgs] = process.argv.slice(2);
if (!expoCli) {
  console.error("Android debug bundle wrapper did not receive the Expo CLI path.");
  process.exit(1);
}

let env;
try {
  env = getAndroidProductionEnv();
} catch (error) {
  console.error(`Android debug bundle failed: ${error.message}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [expoCli, ...expoArgs], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Could not start the Android debug bundle: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
