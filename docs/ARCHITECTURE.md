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

The desktop shell samples once per ten seconds. Core Graphics on macOS and `GetLastInputInfo` on Windows expose only elapsed input time. Read-only platform probes suppress locked/secure desktops, held mouse buttons, and full-screen Windows. macOS also conservatively suppresses when the active screen has no visible menu-bar/Dock inset.

## Immersive capture

1. The director creates an absolute physical rectangle bounded by 640×480, 12% of the monitor, and 1.5 million pixels.
2. Pet, bubble, and effect windows remain hidden.
3. The capture adapter takes one region in memory. `xcap` uses Core Graphics on macOS and its GDI/`BitBlt` backend on Windows because the `wgc` feature is disabled.
4. Binary IPC returns raw RGBA; no base64 or JSON pixel array is created.
5. WebGL2 uploads the frame, immediately fills the CPU view with zeroes, and runs a short displacement shader.
6. The renderer emits `captureReady`; only then are overlay windows revealed.
7. Timeout, permission denial, invalid frames, or context loss selects the cartoon fallback. Texture, VAO, buffer, and program are deleted.

## Content contracts

Rust is authoritative for scheduler and IPC wire shapes (`src-tauri/src/core`). The checked-in action catalog uses the same camel-case serde representation and is validated by both Rust and Zod tests. Content identifiers, localization contracts, SFX cue IDs, hit polygons, durations, and dismiss timings are checked before packaging. Invalid actions are excluded by the director.

