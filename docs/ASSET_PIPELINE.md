# Mascot and content pipeline

The shipped PNGs are original concept cutouts generated for this repository and are not based on a real person, official kit, club logo, voice, tattoo, catchphrase, or protected celebration:

- `public/assets/pets/goat10.png` — sky-blue/white #10 technical-dribbler goat.
- `public/assets/pets/camel7.png` — desert/teal #7 confident athletic camel.
- `public/assets/pets/meme-cat.png` — deadpan charcoal meme cat.
- `public/assets/pets/shiba.png` — energetic sesame-orange Shiba Inu.

The runnable vertical slice uses code-native SVG rigs so gestures and reduced-motion behavior work without binary art tooling. Production artists should replace these renderers with original Rive artboards matching `public/content/actions.v1.json`.

Each final Buddy must provide left/right artboards where a jersey number is visible, the `BuddyDirector` state machine, named inputs/markers, pose hit polygons, contact shadow, eye tracking, secondary motion, click/cry/pet/drag states, two entrances, two exits, and three signature pranks. CI must reject a catalog/asset mismatch.

The SFX catalog is in `public/content/sfx-cues.v1.json`. Its entries are marked pending until licensed or original `.ogg` binaries are supplied. The current app uses a short local Web Audio placeholder chime for interaction testing and never synthesizes a human voice.

All 768 dialogue strings are structurally complete. Vietnamese, English, Korean, and Japanese still require the native-review release gate before public distribution.

