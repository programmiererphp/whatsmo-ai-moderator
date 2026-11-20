# Whatsmo Recovery — Android 11 crash-loop rescue

## Why

The combined diagnostics/AI APK starts and then suddenly closes on a Samsung Galaxy S21. GitHub's previous builds passed but do not simulate real-world startup behavior. Root cause is **not yet confirmed**; Android process exit data and crash traces are needed.

## Independent native Recovery launcher

This build installs **two Android launcher icons** within the same APK:

- **Whatsmo** — the existing Tauri/Rust/WebView messaging app.
- **Whatsmo Recovery** — a standalone Android `Activity` with `android:process=":recovery"`; does not start Tauri, WhatsApp, the WebView, session background services, or AI calls.

Open **Whatsmo Recovery** from the Android apps screen if the main app closes.

Buttons: **Copy diagnostic report**, **Share report**, **Refresh logs**, **Enable/Disable safe mode**, and **Open Whatsmo**.

The report contains: Android SDK/device/version, recent Android 11+ `ApplicationExitInfo` process exit reasons (including native crash and ANR classification where available), Java/Kotlin fatal exception stacks, Rust log/panic tails, and the last locally mirrored redacted JavaScript events. Share/copy uses native Android Clipboard/Chooser and does not depend on the WebView.

The report is automatically trimmed and redacted on a best-effort basis. Inspect it before sharing. Reports stay on the device until manually shared.

## Safe-mode boot

The **first launch after installing this recovery build** enables safe mode by default (one time, via native SharedPreferences) to help open the app reliably after the reported crash loop. Existing session data, saved drafts, and encryption keys are not deleted.

In safe mode the app **does not automatically start the keep-alive foreground service, WhatsApp bridge/session reconnect, notification listeners, or scheduled outbox dispatcher**. The chat composer is disabled. **Settings → Diagnostics** and chat history remain accessible if the WebView runs.

To test normal messaging again:
1. Open the separate **Whatsmo Recovery** icon.
2. Tap **Disable safe mode**.
3. Tap **Open Whatsmo** (starts a fresh Android Activity).
4. If it crashes, reopen **Whatsmo Recovery**, press **Copy diagnostic report**, and share that report for inspection.
5. If you need a stable app view, re-enable safe mode and reopen Whatsmo.

Do not uninstall or clear app data. Do not use force-stop as a substitute for diagnostics.

## Implementation

- Android: `RecoveryActivity.kt`, `AndroidManifest.xml`, `MainActivity.kt`, `CrashRecorder.kt`.
- Rust/Tauri: `src-tauri/src/recovery.rs` with safe-mode query and bounded JSONL event snapshots.
- Svelte: `+page.svelte` reads the native boot policy **before** initiating session connections or scheduled sends; `ChatWindow.svelte` blocks sending in safe mode.
- JS logger: writes limited sanitized snapshots asynchronously to app-private native files for independent inspection.

## Acceptance tests

1. CI: Svelte/typecheck, Vitest, Rust check, and actual Android **release APK** compilation.
2. Install update **over** existing Whatsmo; preserve account and saved chat history.
3. Verify two launcher icons: Whatsmo and Whatsmo Recovery.
4. Open native Recovery: Copy report -> paste into Notes; Share report -> Android chooser; Refresh works.
5. Main app first launch: shows Recovery banner, no background WhatsApp sync; Settings → Diagnostics accessible without crash.
6. Turn off safe mode in Recovery; Open Whatsmo; verify send/receive on test WhatsApp account.
7. If normal mode crashes: open Recovery (it should remain stable), Copy report, inspect last process exit classification, Android fatal stack, Rust panic and JS snapshots.
8. Re-enable safe mode, reopen and verify chat composer is disabled.
9. Check report for private data before sharing. Validate no chat message bodies, API keys or addresses included.
10. Test cold launch, background/foreground, Samsung Android three-button navigation, keyboard, and no regression in session persistence.

## Limitations

The native crash screen can diagnose more failures but cannot guarantee capture of arbitrary OS kills or native crashes. An Android OS bug report / logcat may still be needed. Android's process-exit reasons are sometimes incomplete, and native logs may not cover crashes very early in startup. Safe mode intentionally disables WhatsApp connection rather than claiming to repair its unknown underlying failure.


## Native SIGSEGV confirmation (2026-11-20)

The user's Android 11 report confirms NATIVE_CRASH status=11 (SIGSEGV) at 01:04:01 and 01:04:10. The JS event trail shows send_text_message.start just before the first crash without success or failure. Disabling automatic retry avoided a startup trigger, but manual text sends can still cause a native crash.

Android 11 (API 30) does not expose native tombstones in ApplicationExitInfo.getTraceInputStream() for REASON_CRASH_NATIVE; this capability starts at API 31 (Android 12). For the actual native stack, collect a full system bug report through Settings > Developer options > Take bug report > Full report, or use adb logcat. A full bug report can contain personal data and should be shared only privately after review.

### One-shot native send safety guard

The native send_text_message command now fails closed unless the user explicitly arms exactly one test attempt in the independent Whatsmo Recovery activity. By default **sending is blocked** so repeatedly attempting a known crashing operation cannot abruptly close Whatsmo. Received messages and AI suggestions are unaffected.

1. Open Whatsmo Recovery and tap **Allow one diagnostic send (may crash)**.
2. Open Whatsmo and send only a test message to your own number. Permission is atomically consumed BEFORE native command processing; further attempts require new authorization.
3. The native recovery report now includes **NATIVE SEND SAFETY** with the last stage: entered_command, entering_library, returned_success or returned_error.
4. If the test crashes, reopen Whatsmo Recovery and copy its report. For a precise native stack, also collect a system bug report.

The guard prevents repeated crash loops, but it does not repair the native library or its unknown segmentation fault. Do not allow routine sending until the native stack has been investigated.
