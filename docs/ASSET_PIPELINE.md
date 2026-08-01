# Mascot, motion, sound, and voice pipeline

## Free Motion Rig

BuddyPet has no Rive runtime, account, export, or license dependency. The
shipped renderer is code-native React/CSS/SVG and can be sold without paying an
animation-runtime fee.

The current prototype masters are transparent 1254 × 1254 PNG cutouts:

- `public/assets/pets/goat10.png`
- `public/assets/pets/camel7.png`
- `public/assets/pets/meme-cat.png`
- `public/assets/pets/shiba.png`

`BuddyImageRig` clips each master into top, middle, left-leg, and right-leg
layers. The episode phase and `actionId` select deterministic CSS motion clips;
the code-native SVG remains a final fallback. `npm run check:assets` validates
transparent masters, minimum dimensions, action coverage, and motion selectors.

For production polish, redraw each master as separate transparent layers using
any free vector/raster tool. Export `head`, `torso`, `arm-l`, `arm-r`, `leg-l`,
`leg-r`, `tail`, optional `prop`, and a compact hit polygon. WebP or SVG layers
can replace the current clipped PNG without changing the Rust director, native
window route, input gestures, dialogue, or SFX contract. Left/right jersey art
must remain separate so #10 and #7 are never mirrored.

The old Rive scripts and briefs remain under `docs/rive-scripts` and
`docs/RIVE_*` only as archived experiments. They are not loaded or checked by
the application.

## Art and legal boundaries

The concept cutouts are original to this repository and do not use a real
person's face, official kit, club logo, voice, tattoo, catchphrase, or protected
celebration. Goat #10 and Camel #7 still require the planned legal/art review
before public marketing.

The desktop brand source is `public/assets/brand/app-icon-v2.png`; generated
desktop variants live in `src-tauri/icons-v2`.

## Sound effects

The catalog is `public/content/sfx-cues.v1.json`. The runnable app provides a
procedural Web Audio layer for footsteps, entrances, species calls, rustle,
startled/pet/drop/exit reactions, impacts, paper, scratch, splash, skid, whoosh,
an original victory cue, and break chimes. Final original `.ogg` recordings can
replace cues individually without changing action code.

## Locale voice packs

Voice is optional and explicitly downloaded from Sound settings. Only the pack
for the currently selected locale is requested; synthesis reads the visible
bubble locally and falls back to an installed operating-system voice. No
microphone, cloud synthesis, cloning, or dialogue history is used.

| Locale | Download | Engine | License note |
|---|---:|---|---|
| Vietnamese | ~64 MiB | Piper VITS `vi_VN-vais1000-medium` | MIT model; VAIS-1000 corpus CC BY 4.0 |
| English | ~64 MiB | Piper VITS `en_US-ljspeech-medium` | MIT model; LJSpeech corpus public domain |
| Korean | ~123 MiB | Supertonic 3 int8 | OpenRAIL-M |
| Japanese | shared ~123 MiB pack | Supertonic 3 int8 | OpenRAIL-M |

Every download has a pinned URL and SHA-256 checksum in
`src-tauri/src/voice_pack.rs`. Korean and Japanese intentionally share the same
installed model files. Vietnamese no longer uses Supertonic 3.

All dialogue catalogs are structurally complete. Vietnamese, English, Korean,
and Japanese still require native-speaker review before public release.
