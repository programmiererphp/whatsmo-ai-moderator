# Whatsmo AI Moderator + Social Games — Combined Delivery

Branch: feature/persistent-diagnostics, PR #4.
This delivery combines Android 11 layout/crash mitigation, diagnostics, AI coaching and the first two social-game modules.

## Goal and modules

1. AI coaching (src/lib/ai): editable OpenRouter key, text/image models, instruction and configurable cost limits.
2. Selected-chat gate (src/lib/moderator): intercept text Send and edits, show AI suggestions and hold, rewrite, approve, cancel or delay; outgoing media requires the existing explicit attachment preview confirmation.
3. Persistent delayed outbox: scheduled entries survive app restarts; a new incoming message in the same chat pauses a scheduled draft for review. An interval sends due drafts when the app is running; background execution while fully closed is NOT guaranteed.
4. Creative games (src/lib/games): Chat to Cartoon and Shared Collage. Images are generated only on user action and shared only after attachment-preview confirmation.
5. Diagnostics: local event log, JavaScript errors, Rust logs, Java/Kotlin exceptions, Android process exit reasons and copy/export report.

## Enable and use

- Open **Settings → AI coach & creative games**, enter an OpenRouter API key and select the text/image models. Key stays in app's local storage (not encrypted there), never commit it to GitHub.
- Open a conversation, toggle **Coach ON**. No coaching or data transmission occurs in other chats.
- Tap Send: the message stays local in a review panel while AI runs. Use original, AI rewrite, send now, send later or cancel. Failed AI requests leave the draft available for manual review.
- Tap **Games** to choose cartoon or shared collage. Create an image, tap **Share**, then confirm the existing image preview in Whatsmo.
- Open **Settings → Diagnostics** after an error, refresh native logs, copy report and share only after checking the report for private data.

## Safety and cost details

- Text coaching sends a limited slice of the selected conversation to OpenRouter. Users should not enable it for chats they do not want processed by external AI providers.
- Local outbox stores held messages and chat identifiers to survive restarts.
- Cost controls check estimates before requests; images and custom models may cost more than estimates. Provider billing is authoritative. Rates change; review the model's current published price.
- AI suggestions are advice, never a reliable prediction of another person's feelings. The AI never autonomously deletes previously sent WhatsApp messages.
- Image generation uses the OpenRouter Images endpoint; results depend on the configured image model's current capabilities and API access.

## Acceptance tests on Samsung Galaxy S21 Android 11

1. Merge only after green **Lint & typecheck**, Vitest and **Build release-test APK** checks.
2. Install over the existing APK. Do NOT uninstall/clear data; verify the second WhatsApp account stays linked.
3. Switch home/chat/settings repeatedly and leave the app open; verify no spontaneous closes or navigation-bar overlap.
4. Open keyboard, type, send, close keyboard; check composer remains visible and buttons clickable.
5. With **Coach OFF**, send a normal text and verify immediate arrival in official WhatsApp.
6. With **Coach ON**, press Send. Verify *no WhatsApp message arrived* before approval.
7. Test AI rewrite and manually edit a held draft; approve; confirm only the final text arrives once.
8. Simulate a bad/absent OpenRouter API key. The message must remain held, with a visible error and manual send option.
9. Edit an existing sent text with Coach ON; ensure AI review is required before the edit reaches WhatsApp.
10. Make a scheduled draft for a few minutes. When the app is running and the time passes, it should be sent.
11. Schedule another draft and send an incoming reply first; verify schedule is cancelled for review.
12. Schedule a draft, kill/reopen the app; verify draft survives, and behavior when past due is clearly indicated.
13. Attach a picture with Coach ON; verify that Whatsmo previews it and requires user Send confirmation.
14. Generate a cartoon and share to own test account; check image arrives and is viewable.
15. Create a collage with at least two contributions, including one from the other person's chat message; generate and share it.
16. Lower the text cost cap and check that requests are blocked before network calls; verify that held messages remain available.
17. Open Diagnostics, copy report, verify screen events, native log tail and exact build ID. Kill/reopen and verify events retained.
18. Check exported report before sharing: no chat text, API key, personal numbers or media keys should be present.
19. Inspect any native crash report and its Android 11 process-exit reason if the app closes again.
20. Regression: account pairing, message receiving, read receipts, chat list, media attachments and app restart remain functional.

## Deferred

- Fully reliable scheduled dispatch with app killed/backgrounded (would require Android WorkManager / foreground service integration).
- Automatic post-send message deletion/editing without review.
- AI analysis of attachments/voice messages.
- Shared live collaborative game state across phones (currently collaborative by exchanging chat messages and contributing them to the collage).

## Build and debug

The feature PR CI now builds a signed Android APK and uses workflow concurrency to cancel obsolete intermediate runs. After merge, open Actions → Build Android APK → latest successful main run → whatsmo-release-test-apk. Compare APK build SHA recorded under Diagnostics with the GitHub run.

Full Android crash fidelity may require an Android logcat capture; an application cannot guarantee all OS-level termination details from inside its own process.
