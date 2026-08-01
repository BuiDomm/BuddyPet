# Architecture

## Runtime topology

The Rust process owns all durable state and scheduling. React is packaged into the application and renders four roles:

| Window | Role | Input |
|---|---|---|
| `settings` | Onboarding, preferences, playground | Normal window |
| `pet-stage` | Buddy animation and gestures | Native hit region only; non-focusable |
| `effect-main` | Regional WebGL/cartoon prank | Always click-through |
| `bubble` | Semantic dialogue | Always click-through |

Overlay webviews remain mounted but render `null` while dormant. Their windows are hidden, and WebGL resources are deleted at the end of the 2.35-second effect.

## Episode lifecycle

`BehaviorDirector` is deterministic under a seed and owns:

`Dormant → SafetyCheck → Enter → Mischief → Reaction → Exit → Cooldown`

It enforces one active event ID, a 12-second deadline, a 5-second reaction limit, preset budgets/cooldowns, quiet hours, Meeting Mode, active/idle rules, a five-minute resume grace, and a 24-hour frequency downshift after negative feedback. Renderer callbacks with an old event ID are ignored.

Every episode also carries a native `motionPath`, pet-specific intro duration, and the manifest `lineKey`. The shell moves the non-activating pet window from a sampled safe monitor edge to the anchor; React blends walk/run, a species-specific flourish, matching dialogue, action SFX, and the prank. Paths are sampled before use and rejected if the pet bounds would cross the current pointer. Reduce Motion replaces the route with a short reveal.

The desktop shell samples once per ten seconds. Core Graphics on macOS and `GetLastInputInfo` on Windows expose only elapsed input time. No foreground-app, browser, filename, document-type, URL, or Accessibility-tree field exists in `ActivitySnapshot`, so browsing, editing, media, and other active computer use are scheduled identically. Read-only platform probes suppress locked/secure desktops, held mouse buttons, and full-screen Windows. macOS also conservatively suppresses when the active screen has no visible menu-bar/Dock inset. `NSProcessInfo.isLowPowerModeEnabled` and Windows `GetSystemPowerStatus` feed a power-saver bit into each episode; WebGL is then capped at 30 FPS and secondary particles are removed.

Native 12-second episode and five-second reaction watchdogs operate independently from the ten-second activity sampler. A separate 300 ms capture watchdog reveals the pet and bubble even if the effect renderer crashes before sending `captureReady`.

## Immersive capture

1. The director creates an absolute physical rectangle bounded by 640×480, 12% of the monitor, and 1.5 million pixels.
2. Pet, bubble, and effect windows remain hidden.
3. The capture adapter takes one region in memory. `xcap` uses Core Graphics on macOS and its GDI/`BitBlt` backend on Windows because the `wgc` feature is disabled.
4. Binary IPC returns raw RGBA; no base64 or JSON pixel array is created.
5. WebGL2 uploads the frame, immediately fills the CPU view with zeroes, and runs a short displacement shader.
6. The renderer emits `captureReady`; only then are overlay windows revealed.
7. Timeout, permission denial, invalid frames, or context loss selects the matching action-specific cartoon fallback. Texture, VAO, buffer, and program are deleted.

## Content contracts

Rust is authoritative for scheduler and IPC wire shapes (`src-tauri/src/core`). The checked-in action catalog uses the same camel-case serde representation and is validated by both Rust and Zod tests. Content identifiers, localization contracts, SFX cue IDs, hit polygons, durations, and dismiss timings are checked before packaging. Invalid actions are excluded by the director.
