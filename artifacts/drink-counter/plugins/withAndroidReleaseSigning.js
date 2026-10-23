const path = require("node:path");

const { withAppBuildGradle } = require(
  require.resolve("@expo/config-plugins", {
    paths: [path.dirname(require.resolve("expo/package.json"))],
  }),
);

const marker = "// Countable direct-install release signing from Replit Secrets.";

const signingEnvironmentConfig = `${marker}
def countableReleaseStorePassword = System.getenv("COUNTABLE_ANDROID_KEYSTORE_PASSWORD") ?: ""
def countableReleaseKeyAlias = System.getenv("COUNTABLE_ANDROID_KEY_ALIAS") ?: ""
def countableReleaseKeyPassword = System.getenv("COUNTABLE_ANDROID_KEY_PASSWORD") ?: ""
def countableReleaseKeystoreBase64 = System.getenv("COUNTABLE_ANDROID_KEYSTORE_BASE64") ?: ""
def countableReleaseKeystoreFile = new File(buildDir, "countable-release-key.jks")
def countableReleaseKeystoreCreated = false

gradle.taskGraph.whenReady { taskGraph ->
    def includesReleaseTask = taskGraph.allTasks.any {
        it.name.toLowerCase().contains("release")
    }

    if (includesReleaseTask) {
        def requiredSecrets = [
            "COUNTABLE_ANDROID_KEYSTORE_BASE64": countableReleaseKeystoreBase64,
            "COUNTABLE_ANDROID_KEYSTORE_PASSWORD": countableReleaseStorePassword,
            "COUNTABLE_ANDROID_KEY_ALIAS": countableReleaseKeyAlias,
            "COUNTABLE_ANDROID_KEY_PASSWORD": countableReleaseKeyPassword
        ]
        def missingSecrets = requiredSecrets.findAll { name, value -> !value }.keySet()
        if (!missingSecrets.isEmpty()) {
            throw new GradleException(
                "Android release signing requires these Replit Secrets: " +
                missingSecrets.join(", ")
            )
        }

        try {
            countableReleaseKeystoreFile.parentFile.mkdirs()
            countableReleaseKeystoreFile.bytes =
                java.util.Base64.getDecoder().decode(countableReleaseKeystoreBase64)
            def permissionsSet =
                countableReleaseKeystoreFile.setReadable(false, false) &&
                countableReleaseKeystoreFile.setWritable(false, false) &&
                countableReleaseKeystoreFile.setReadable(true, true) &&
                countableReleaseKeystoreFile.setWritable(true, true)
            if (!permissionsSet) {
                countableReleaseKeystoreFile.delete()
                throw new GradleException(
                    "Could not restrict access to the temporary Android signing key."
                )
            }
            countableReleaseKeystoreCreated = true
        } catch (IllegalArgumentException error) {
            throw new GradleException(
                "COUNTABLE_ANDROID_KEYSTORE_BASE64 is not valid Base64."
            )
        }
    }
}

gradle.buildFinished {
    if (countableReleaseKeystoreCreated) {
        countableReleaseKeystoreFile.delete()
    }
}
`;

function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (contents.includes(marker)) return modConfig;

    const androidBlockIndex = contents.indexOf("android {");
    const buildTypesIndex = contents.indexOf("\n    buildTypes {", androidBlockIndex);
    const releaseBlockStart = contents.indexOf("\n        release {", buildTypesIndex);

    if (
      androidBlockIndex < 0 ||
      buildTypesIndex < 0 ||
      releaseBlockStart < 0
    ) {
      throw new Error(
        "Could not find the expected Android buildTypes.release block for Countable signing.",
      );
    }

    const releaseBlockEnd = contents.indexOf("\n        }", releaseBlockStart + 1);
    if (releaseBlockEnd < 0) {
      throw new Error("Could not find the end of the Android release build type.");
    }

    const releaseBlock = contents.slice(releaseBlockStart, releaseBlockEnd);
    const debugSigningLine = "signingConfig signingConfigs.debug";
    if (!releaseBlock.includes(debugSigningLine)) {
      throw new Error(
        "Expected the Android release build to use the preserved debug key before applying Countable signing.",
      );
    }

    const releaseSigningConfig = `\n    signingConfigs {
        countableRelease {
            storeFile countableReleaseKeystoreFile
            storePassword countableReleaseStorePassword
            keyAlias countableReleaseKeyAlias
            keyPassword countableReleaseKeyPassword
        }
    }
`;
    contents =
      contents.slice(0, buildTypesIndex) +
      releaseSigningConfig +
      contents.slice(buildTypesIndex);

    const updatedBuildTypesIndex = contents.indexOf("\n    buildTypes {", androidBlockIndex);
    const updatedReleaseBlockStart = contents.indexOf(
      "\n        release {",
      updatedBuildTypesIndex,
    );
    const updatedReleaseBlockEnd = contents.indexOf(
      "\n        }",
      updatedReleaseBlockStart + 1,
    );
    const updatedReleaseBlock = contents
      .slice(updatedReleaseBlockStart, updatedReleaseBlockEnd)
      .replace(debugSigningLine, "signingConfig signingConfigs.countableRelease");

    contents =
      contents.slice(0, updatedReleaseBlockStart) +
      updatedReleaseBlock +
      contents.slice(updatedReleaseBlockEnd);
    contents =
      contents.slice(0, androidBlockIndex) +
      signingEnvironmentConfig +
      "\n" +
      contents.slice(androidBlockIndex);

    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

module.exports = withAndroidReleaseSigning;
