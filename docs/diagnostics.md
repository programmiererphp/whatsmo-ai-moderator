# Whatsmo diagnostics — user and developer guide

Open **Settings → Diagnostics & crash reports → Open diagnostics**.

## Captured
- Startup, foreground/background, page-hide and detection of a previous unclosed session (possible OS termination or crash, not definitive).
- JavaScript runtime errors and unhandled promises; SvelteKit client errors.
- Screen navigation and button actions (allowlisted labels only), WhatsApp pairing/connection state.
- Tauri native-command names, start/end/error and elapsed time (never inputs or raw responses).
- WhatsApp bridge event names without message bodies or chat identifiers.
- Text/media send attempts, outcomes and retries; lengths and types only.
- Rust's existing rotating structured log files and panic log, accessed on-demand by an app-private Tauri command.
- Uncaught Android Java/Kotlin exception stacks via CrashRecorder in app-private storage.
- Android 11+ ActivityManager process-exit reasons/status on next launch (e.g. crash, ANR, low-memory process termination).

## Storage and export
- Last 500 frontend events persist in localStorage, written synchronously on each event.
- Rust logs rotate daily; viewer reads bounded tails of up to 5 files.
- Android exception recorder writes approximately 256 KB maximum per file to app-private storage; the native log reader attempts to load it.
- **Copy report** is the most reliable Android export; **Export .txt** may depend on WebView download support.
- No automatic telemetry upload or sharing.
- **Do not post logs publicly.** Redaction of phone numbers, emails, chat identifiers, URLs and tokens is best-effort; review reports before sharing. Raw native log files on-device are not sanitized.
- **Clear events** clears frontend logs only; does not delete chat sessions or native logs.

## Limits
- Native SIGSEGV/SIGABRT, Android OS process kills and ANRs may be identified by the next-launch OS exit reason on Android 11+, but full trace details or stack traces are not guaranteed. Crashes before handler initialization might not have an app-written stack.
- An unclosed session can also result from ordinary Android background termination.
- Kotlin crash-file lookup from Rust depends on the Android data directory mapping; some devices may require external adb logcat.
- Complete OS/kernel diagnostics require an authorized Android bug report or adb; apps cannot access arbitrary other-process logs.

## Acceptance checks
1. GitHub Actions frontend test/typecheck and Rust checks.
2. Full APK build on the pull request and after merge.
3. Install APK over existing one without clearing linked WhatsApp session.
4. Open Settings → Diagnostics, copy the report and check event and native log sections.
5. Send/receive a test message, check command start/success/failure durations.
6. Background/foreground, close/reopen, check persisted events and lifecycle markers.
7. Verify token, email and phone redaction, and no raw chat text stored.
8. Check stability on Samsung Galaxy S21 / Android 11; if crash persists, collect Android logcat.

This feature branch includes the pending Android 11 crash-remediation patch from PR #3.
