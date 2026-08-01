# Archived Rive experiments

Rive is no longer a runtime or release dependency because exporting runtime
`.riv` files adds an avoidable production cost. The app now uses the free,
code-native Motion Rig documented in `docs/ASSET_PIPELINE.md`.

The names and contracts below are retained only so old scripting experiments
remain reproducible; putting a `.riv` file here does not load it in the app.

The runtime automatically picks up these exact files when they are exported by
Rive Editor:

- `goat10.riv` — artboard `Goat10`
- `camel7.riv` — artboard `Camel7`
- `meme-cat.riv` — artboard `MemeCat`
- `shiba.riv` — artboard `ShibaInu`

For script-first experiments, `goat10-prototype.riv` and
`meme-cat-prototype.riv` are also accepted when their corresponding production
files are absent. They only need the matching `Goat10` or `MemeCat` artboard and
are kept out of strict production validation. See `docs/rive-scripts/README.md`
for the 300 × 275 Node Script setup. A valid production rig always wins over
its prototype.

Every file must expose the `BuddyDirector` state machine. Input names are the
union of the relevant action manifests in `public/content/actions.v1.json`.
See `docs/RIVE_ANIMATOR_BRIEF.md` for the complete skeleton, mesh/IK, animation
and export handoff. See `docs/RIVE_PRODUCTION_WORKFLOW.md` for how the four
editable source rigs are commissioned, reviewed, exported, and integrated.
Until a valid binary is present, the layered image-mesh character remains
visible, with the code-native SVG as the final safety fallback. An invalid or
mismatched Rive export never leaves a blank pet window.
