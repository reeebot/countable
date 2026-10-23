const path = require("node:path");

const { withAppBuildGradle } = require(
  require.resolve("@expo/config-plugins", {
    paths: [path.dirname(require.resolve("expo/package.json"))],
  }),
);

const marker = "// Countable Android production bundle preflight v2.";
const previousMarker = "// Countable Android production bundle preflight.";
const standaloneDebugBundleMarker = "// Countable standalone debug JS bundle.";

const bundleCheckGradleConfig = `${marker}
def countableBundlePreflight = tasks.register("validateAndroidProductionBundle", Exec) {
    workingDir new File(rootDir, "../../../artifacts/drink-counter")
    commandLine "pnpm", "run", "validate:android-bundle"
}

tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    dependsOn(countableBundlePreflight)
}

gradle.projectsEvaluated {
    def releaseBundleTask = tasks.findByName("createBundleReleaseJsAndAssets")
    if (!releaseBundleTask) {
        throw new GradleException("Could not find the Android release JavaScript bundle task.")
    }

    releaseBundleTask.inputs.property(
        "countableProductionApiDomainSource",
        System.getenv("REPLIT_INTERNAL_APP_DOMAIN") ?:
            System.getenv("REPLIT_DEV_DOMAIN") ?:
            System.getenv("EXPO_PUBLIC_DOMAIN") ?: ""
    )
    releaseBundleTask.inputs.property(
        "countableProductionReplId",
        System.getenv("REPL_ID") ?: System.getenv("EXPO_PUBLIC_REPL_ID") ?: ""
    )
    def bundleWrapper = new File(
        rootDir,
        "../../../artifacts/drink-counter/scripts/run-android-release-bundle.js"
    )
    releaseBundleTask.nodeExecutableAndArgs.set(["node", bundleWrapper.absolutePath])

    def debugBundleTask = tasks.findByName("createBundleDebugJsAndAssets")
    if (debugBundleTask) {
        debugBundleTask.inputs.property(
            "countableDebugApiDomainSource",
            System.getenv("REPLIT_INTERNAL_APP_DOMAIN") ?:
                System.getenv("REPLIT_DEV_DOMAIN") ?:
                System.getenv("EXPO_PUBLIC_DOMAIN") ?: ""
        )
        debugBundleTask.inputs.property(
            "countableDebugReplId",
            System.getenv("REPL_ID") ?: System.getenv("EXPO_PUBLIC_REPL_ID") ?: ""
        )
        def debugBundleWrapper = new File(
            rootDir,
            "../../../artifacts/drink-counter/scripts/run-android-debug-bundle.js"
        )
        debugBundleTask.nodeExecutableAndArgs.set(["node", debugBundleWrapper.absolutePath])
    }
}
`;

function withAndroidProductionBundleCheck(config) {
  return withAppBuildGradle(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (!contents.includes(standaloneDebugBundleMarker)) {
      const reactBlockIndex = contents.indexOf("react {");
      if (reactBlockIndex < 0) {
        throw new Error("Could not find the React Native Gradle configuration block.");
      }
      const reactBlockOpeningLineEnd = contents.indexOf("\n", reactBlockIndex);
      if (reactBlockOpeningLineEnd < 0) {
        throw new Error("Could not find the end of the React Native Gradle configuration line.");
      }
      contents =
        contents.slice(0, reactBlockOpeningLineEnd + 1) +
        `    ${standaloneDebugBundleMarker}\n    debuggableVariants = []\n` +
        contents.slice(reactBlockOpeningLineEnd + 1);
    }

    if (contents.includes(marker)) {
      modConfig.modResults.contents = contents;
      return modConfig;
    }

    const previousBlockIndex = contents.indexOf(previousMarker);
    if (previousBlockIndex >= 0) {
      const androidBlockIndex = contents.indexOf("android {", previousBlockIndex);
      if (androidBlockIndex < 0) {
        throw new Error(
          "Could not find the Android block after the previous bundle preflight.",
        );
      }
      contents =
        contents.slice(0, previousBlockIndex) +
        contents.slice(androidBlockIndex);
    }

    const androidBlockIndex = contents.indexOf("android {");
    if (androidBlockIndex < 0) {
      throw new Error("Could not find the expected Android block for bundle preflight.");
    }

    contents =
      contents.slice(0, androidBlockIndex) +
      bundleCheckGradleConfig +
      "\n" +
      contents.slice(androidBlockIndex);
    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

module.exports = withAndroidProductionBundleCheck;
