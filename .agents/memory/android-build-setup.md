---
name: Android build setup
description: Storage, memory, signing, ABI, and Expo prebuild workarounds for Android builds in this workspace.
---

Keep downloaded Android SDK packages, generated native project trees, Gradle's user home, and Java temporary files under the workspace's ignored `.local` directory. The default `~/.gradle` and `/tmp` are on a 4 GiB overlay and can fail with `ENOSPC` while the workspace volume still has ample room. Set `GRADLE_USER_HOME` to `.local/android-build/gradle-home` or symlink `~/.gradle` there.

For Gradle on Java 17, set `-XX:-UsePerfData`. An earlier release build crashed in HotSpot's `PerfLongVariant::sample()` with SIGBUS; disabling performance data let the build pass that point.

An 8 GiB container has killed Gradle during release packaging when peak memory approached the limit, even after native compilation completed.

Expo prebuild can clear and recreate the native Android project, including its debug keystore. Android updates must retain the previous APK's signing certificate. The generated Gradle template may default to four ABIs while an existing test APK is arm64-only.

Expo prebuild in the workspace package can also rewrite that package's manifest by adding `expo`, `react`, and `react-native` to its local dependencies, even though the workspace already manages them.

Rerunning `expo prebuild --no-clean` against generated Gradle files after the Android signing config plugin has transformed them fails: the plugin expects the original release block to still use the debug signing config.

**Why:** Repeated native builds exposed storage-quota, JDK sampling, memory-limit, SDK discovery, signing-identity, and ABI issues. A release daemon was killed near 7.3 GiB peak usage; a one-worker, 1.5 GiB heap retry completed successfully in an earlier build. Gradle's 4 GiB overlay cache also filled during APK packaging, while the workspace volume had ample free space. Prebuild rewrote the workspace package manifest, which would have caused unrelated dependency churn if left in place. The signing config plugin is designed for the generated template and is not idempotent against its transformed Gradle output.

**How to apply:** Keep the SDK, native build tree, Gradle user home (`GRADLE_USER_HOME`), and Java temp directory under ignored `.local` storage; explicitly export `ANDROID_HOME` and `ANDROID_SDK_ROOT` to `.local/android-sdk`; and pass `-XX:-UsePerfData` through `JAVA_TOOL_OPTIONS`. Usually limit concurrency with `--max-workers=2` and `CMAKE_BUILD_PARALLEL_LEVEL=2`; on an 8 GiB release build near the memory cap, retry with one worker, `org.gradle.parallel=false`, and a 1.5 GiB Gradle heap, skipping `lintVital*` only if needed for an installable test APK. If matching an arm64 test APK, pass `-PreactNativeArchitectures=arm64-v8a`. Before distribution, use `apksigner` and `aapt` to confirm package, version, and signer. After `expo prebuild`, inspect the artifact package manifest and revert generated dependency additions unless intentionally changing dependency ownership. If re-running prebuild against modified Gradle output, use a fresh test/native tree and preserve the existing debug signing identity before replacing a real build tree.

Every direct-install APK needs a higher Android `versionCode` than the installed build.

**Why:** Android can reject an APK as a downgrade when its `versionCode` is unchanged, even if its package and signing certificate match.

**How to apply:** Increment `versionCode` before each update build, then verify the final APK metadata and signing certificate against the previous release.

The native build tree under `.local/android-build` is a separate source snapshot, not a live view of `artifacts/drink-counter`.

**Why:** An APK assembled from the stale snapshot omitted a recent past-day logging control even though the workspace app and preview contained it.

**How to apply:** Before bundling, sync the current app, assets, components, constants, hooks, libraries, plugins, scripts, and `app.json` from `artifacts/drink-counter` into `.local/android-build`. Preserve the generated `android/` tree, local `package.json`, `node_modules`, Metro config, and caches. Confirm the changed UI text exists in `.local/android-build/app` before running Gradle.

Native widgets require syncing both the JavaScript package/entry point and the config plugin's generated Android receiver, service, provider XML, and widget class into the preserved local build tree.

**Why:** The JavaScript widget can bundle successfully while the launcher still cannot discover or launch it if the generated native registration is absent from the separate Android project.

**How to apply:** When adding a native widget, preserve the existing Android build tree and signing identity, but merge the new plugin-generated manifest/resources/classes and update the local package entry point and dependency before future APK builds.

Standalone debug APKs need `debuggableVariants = []` in the React Native Gradle block; the default debug variant expects Metro and omits `assets/index.android.bundle`.

**Why:** A debug APK without the bundled JavaScript installs successfully but shows “Unable to load script” when launched away from Metro.

**How to apply:** Preserve this setting in both the config plugin and generated build tree, then confirm `assets/index.android.bundle` is inside the finished APK before sharing it.

Direct Android debug bundles must inject `EXPO_PUBLIC_DOMAIN` from the Replit API domain before Metro bundles the app.

**Why:** The Expo preview sets this value, but a direct Gradle debug build did not. The shared API client then left `/api/...` requests relative, so catalogue search worked in the web preview but failed in the installed Android app.

**How to apply:** Route `createBundleDebugJsAndAssets` through the Android domain-environment wrapper and include the domain in the Gradle task inputs so a domain change regenerates the bundle.

For Android updates, match the architecture set in the prior installable APK and prefer the artifact's current native build tree when it has a warm Gradle/CMake cache. The existing Countable APK is arm64-only.

**Why:** Building from the separate `.local/android-build` snapshot triggered a cold native C++ rebuild across four ABIs, even though the app's own Android tree retained the previous APK's build cache. A full-ABI APK would also differ from the installed arm64 build without adding compatibility needed for these updates.

**How to apply:** Inspect the previous APK's `lib/` entries before building and pass `-PreactNativeArchitectures=arm64-v8a` when that matches. Keep the selected native tree's manifest, widget resources/classes, and app sources synchronized; use the separate `.local` tree only when its build snapshot is intentionally the APK source.

The Android Gradle signing plugin uses Java's strict Base64 decoder for the keystore secret.

**Why:** Base64 output copied with line breaks or other whitespace is rejected before the release build starts.

**How to apply:** Generate a single-line value with `base64 -w0 <keystore-path> | tr -d '\r\n'` and enter it only through Replit Secrets.
