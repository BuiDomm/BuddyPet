# BuddyPet v1 implementation audit

Last reviewed: 2026-08-01.

## Implemented and automated

- Tauri/Rust desktop topology, settings window, tray, autostart integration,
  configurable emergency hotkey, small pet/effect/bubble windows, stale-event
  protection, and renderer watchdogs.
- Active-streak scheduler with idle reset, quiet hours, startup/wake grace,
  cooldowns, rolling/daily budgets, Meeting Mode, manual summon, and adaptive
  downshift. Scheduling is app-agnostic, so browsing and all other active use
  can trigger a safe episode.
- Four Buddy selection with Meme Cat as the default, native edge-to-anchor
  entrances, click/double-click/hold/drag/right-click reactions, action-specific
  cartoon effects, Reduce Motion, and power-saver behavior.
- Settings/onboarding/playground and synchronized Vietnamese, English, Korean,
  and Japanese catalogs. Automated parity tests protect all four catalogs.
- One-frame bounded capture, binary IPC, WebGL upload/cleanup, cartoon fallback,
  and no pixel persistence or telemetry by default.
- 17 action manifests, 768 localized dialogue variants with recent-line
  avoidance, procedural SFX, and locale-selected offline voice-pack plumbing.
- Zero-cost Free Motion Rig runtime and asset validator. No `.riv` export is a
  release gate.

## Implemented but awaiting real-device/content gates

- Native hit-mask/pass-through and no-focus behavior need the planned 100-click
  matrix on physical macOS and Windows systems.
- Mixed DPI, multi-monitor hot-plug, sleep/wake, lock, fullscreen, protected/HDR
  capture, GPU loss, and the eight-hour soak need physical test evidence.
- Current character masters are polished prototype PNGs clipped into four
  regions. Final motion quality needs truly separated limbs/face/props and
  animator cleanup, but does not need a paid tool or runtime.
- Procedural SFX are functional; final original animal/action recordings and a
  native listening pass are still needed.
- Voice engines and checksums are wired per locale. Vietnamese now uses the
  dedicated VAIS-1000 Piper model; all four packs still need native listening
  approval on real speakers/headphones.
- macOS fullscreen suppression is conservative and must be proven against the
  target app matrix; Windows has a native bounds probe.

## Not release-ready yet

- Developer ID/notarization, Authenticode, final updater key/endpoints, and a
  signed N-1 to N update have not been configured.
- Native-speaker review, mascot legal/art review, privacy-policy publication,
  closed beta thresholds, and store/download-site operations remain external
  release work.

## Next implementation order

1. Split Meme Cat into production head/torso/paws/legs/tail/face layers and use
   it as the quality reference for the free rig.
2. Add deterministic motion-marker JSON so SFX and impacts are frame-aligned
   without relying on hard-coded timers.
3. Run native Vietnamese voice listening tests, tune speed/punctuation, and add
   required attribution text to the installer/About screen.
4. Execute macOS first-device QA, then Windows mixed-DPI and pass-through QA.
5. Replace placeholder updater/signing values only when release credentials and
   endpoints exist.
