# BuddyPet Desktop

BuddyPet is a privacy-first desktop companion for macOS and Windows. It runs in a Tauri native shell, watches only the elapsed time since the last input, and stages harmless visual mischief in small transparent windows. It never edits documents, injects input, reads typed content, or uploads captured pixels.

This repository currently contains a runnable desktop foundation and vertical slice:

- Tauri 2 + Rust director with quiet hours, cooldowns, rolling/daily budgets, startup/wake grace, active-streak sampling, manual summon, adaptive downshift, and stale-event protection.
- Native tray, configurable emergency shortcut, launch-at-login integration, non-focusable pet/effect/bubble windows, RAM-only regional capture, and a native hit-mask poller.
- Five-step onboarding and a complete settings/playground UI.
- Goat #10, Camel #7, Meme Cat, and Shiba Inu with interactive CSS/SVG motion plus original concept art under `public/assets/pets`.
- 17 validated action manifests, 33 typed SFX cues, and 768 dialogue lines across Vietnamese, English, Korean, and Japanese.
- WebGL2 immersive crack/displacement rendering with a 200 ms fallback and explicit CPU/GPU buffer cleanup.

## Run locally

Requirements: Node.js 22+, Rust 1.85+, and the platform prerequisites from the Tauri 2 documentation.

```bash
npm ci
npm run desktop:dev
```

Useful verification commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
cd src-tauri && cargo test --lib
cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings
npx tauri build --debug --no-bundle --ci
```

The first launch opens onboarding. Later launches remain in the menu bar/system tray; choose **Settings…** to reopen the window. Sound, launch at login, telemetry, and immersive capture all default to off.

## Important product boundaries

- “Stress detection” means only an active streak derived from time-since-last-input.
- Screen pixels are captured only after explicit consent, limited to one small frame, transferred through binary IPC, zeroed after texture upload, and never written to disk.
- The effect and speech-bubble windows are always click-through. The pet window accepts input only inside its native hit region.
- The updater is wired but disabled until a real release public key and beta/stable endpoints are configured.
- Production `.riv` rigs, final per-Buddy audio binaries, native-language review, legal/art review, code-signing identities, notarization credentials, and real-device QA are release inputs and are not committed to this repository.

See [architecture](docs/ARCHITECTURE.md), [privacy model](docs/PRIVACY.md), [asset pipeline](docs/ASSET_PIPELINE.md), and [release checklist](docs/RELEASE_CHECKLIST.md).

