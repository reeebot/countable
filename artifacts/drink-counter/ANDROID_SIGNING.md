# Android release signing

Countable's current direct-install test APK uses the standard Android debug
keystore. The workspace contains that debug keystore, but no separate Google
Play upload keystore or signing secrets. This workspace check does not inspect
any external Google Play Console account.

The Android `release` build is configured for **direct installation only**. It
uses the same debug signing identity as the current test APK so Android can
install future updates over it. This key is not a Google Play upload key. Do
not publish this build to Google Play. If Countable is later published through
Google Play, first confirm the Play Console's upload-key certificate and add a
separate release-signing setup without replacing this direct-install identity.

## Replit Secrets

Release builds read all signing values from these Replit Secrets:

- `COUNTABLE_ANDROID_KEYSTORE_BASE64`
- `COUNTABLE_ANDROID_KEYSTORE_PASSWORD`
- `COUNTABLE_ANDROID_KEY_ALIAS`
- `COUNTABLE_ANDROID_KEY_PASSWORD`

These secrets are not currently populated. Until all four are added in Tools >
Secrets, release builds will fail with the missing secret names rather than use
a different signing key.

Add the current debug keystore's existing alias and password values through
Replit Secrets, not in source files or chat. To obtain the keystore value, run
this from the workspace root and paste its output only into the secure
`COUNTABLE_ANDROID_KEYSTORE_BASE64` secret field:

```sh
base64 -w0 .local/android-build/android/app/debug.keystore | tr -d '\r\n'
```

The build decodes the key only into the ignored Android build output directory
when a release task runs. Debug builds do not require or materialize the
release keystore. Release builds fail with the missing secret names if any
required value is absent.
