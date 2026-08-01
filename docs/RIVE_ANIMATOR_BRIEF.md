# Archived: BuddyPet Rive animator handoff

> This document is retained only for the earlier prototype. Rive is no longer a
> runtime or release dependency. Use `docs/ASSET_PIPELINE.md` for the active,
> zero-cost Free Motion Rig pipeline.

This is the production contract for the four runtime rigs. The application is
already wired to these names; changing them requires a matching code/catalog
change.

## What the animator needs

- A Rive account on a plan that can export **For runtime**.
- Edit access to one BuddyPet Rive workspace/project.
- The four approved character sources. Layered SVG/PSD artwork is preferred;
  the current transparent PNGs in `public/assets/pets` can be image-meshed for a
  spike, but will not deform as cleanly as separated head, torso, limbs, ears,
  tail, beard and jersey layers.
- This repository or the action manifest in
  `public/content/actions.v1.json` for the exact input/event names.

No API key is required by the desktop app. The only artifacts committed to the
repository are the final exported `.riv` binaries.

## Required exports

| File | Main artboard | State machine |
|---|---|---|
| `goat10.riv` | `Goat10` | `BuddyDirector` |
| `camel7.riv` | `Camel7` | `BuddyDirector` |
| `meme-cat.riv` | `MemeCat` | `BuddyDirector` |
| `shiba.riv` | `ShibaInu` | `BuddyDirector` |

Use a 300×275 artboard with the character grounded near the bottom center.
Keep at least 12% transparent breathing room around horns, ears, tail and jump
poses. Jersey-number poses need separate left/right art rather than mirroring.

## Minimum rig

- Root/hips, chest, neck, head and eye target.
- Left/right upper and lower legs with foot controls.
- Left/right arm or front-leg chains where appropriate.
- Ear, tail, beard/hair and jersey secondary-motion controls.
- IK targets for both feet and any hand/paw that touches a screen edge.
- Contact shadow controlled independently from the body.
- Image meshes or vector paths weighted across joints; smooth the weights at
  shoulders, hips, neck and tail root.

## `BuddyDirector` inputs

Inputs shared by every rig:

- `walking` — Boolean
- `startled` — Trigger
- `pet` — Boolean
- `drag` — Boolean
- `exit` — Trigger
- `reduceMotion` — Boolean

Signature action triggers/numbers:

- Goat: `headbutt`, `nibble`, `dribble`, `edge`, `ballTargetX`.
- Camel: `neckStretch`, `chew`, `spitWipe`, `stretchAmount`, `edge`.
- Meme Cat: `cardSlap`, `scratch`, `loaf`, `pawSide`, `scratchCount`, `lookX`.
- Shiba: `tug`, `dig`, `zoomies`, `tugAmount`, `particleLevel`, `targetX`.
- Shared behaviors: `breakTicket`, `stickyNote`, `confetti`, `nap`, `peek`.

The state machine must always have a safe idle fallback. Any one-shot action
returns to idle automatically and must not leave a trigger latched.

## Required animation set

- Two entrances, four idles, walk, run, turn and flourish.
- Three signature pranks per Buddy.
- Startled/cry/jump-away, pet/purr, drag/wriggle/drop and two exits.
- Reduced-motion alternatives using short pose/fade transitions.
- Footstep, impact, bite, release and effect-clear events at the matching
  visual frame.

Use these shared General Event names exactly so runtime SFX follows the visual
frame: `footstepLeft`, `footstepRight`, `clothRustle`, `speciesCall`, `whoosh`,
`impact`, `bite`, `release`, `skid`, `land`, `victory`, and `effect-clear`.
Action-specific markers from `public/content/actions.v1.json` are additional
requirements.

The Camel celebration should read as a confident athletic leap and landing,
not copy a real person's protected face, voice, kit, catchphrase or exact
signature celebration.

The matching celebration sound must be an original synthetic BuddyPet cue or a
newly recorded performance. Do not ship a celebrity recording or extract audio
from broadcasts/social media.

## Export and acceptance

1. Mark the main artboard as a component and keep `BuddyDirector` attached.
2. Use **Publish → Export for runtime** and export one file per Buddy.
3. Put the files in `src/assets/rive` using the exact names above.
4. Run `npm run check:rive:strict`.
5. Run the app and test every action in Playground and with **Test Buddy
   entrance** on a Retina display.

Acceptance requires no clipping, no black rectangle, no foot sliding, smooth
state blending, correct left/right jersey art, and a working fallback when the
`.riv` file is intentionally removed.
