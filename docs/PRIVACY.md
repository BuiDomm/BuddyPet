# Privacy and security model

BuddyPet is offline-first and has no account, microphone, clipboard reader, Accessibility-tree access, key logger, input injector, elevation helper, service, DLL injection, or document filesystem workflow.

Persisted app data is limited to versioned settings, cooldown/snooze state, recent episode outcomes, and budget history. Active streaks, pointer coordinates, captured pixels, and hit-test positions stay in memory. Errors returned by capture are deliberately generic so display/window details do not enter logs.

Screen capture is optional for app operation. The permission probe runs only after an explicit onboarding/settings action. Each prank takes at most one bounded frame. Frames are not encoded, cached, OCR’d, analyzed, attached to crash reports, or sent over the network. Cartoon effects remain available when permission is absent or revoked.

Telemetry is stored as an opt-in preference but no telemetry transport is implemented in this phase. The production implementation must remain allow-listed to episode type, dismiss outcome, preset, locale, and coarse performance buckets.

Overlay capabilities intentionally omit filesystem, network, updater, autostart, and process permissions. All visible “damage” is generated in transparent windows and never changes another process, document, cursor, or input stream.

