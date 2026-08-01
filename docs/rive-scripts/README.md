# Goat #10 — Rive Scripting quick start

This folder contains a procedural Goat #10 prototype written as a Rive **Node
Script**. It is useful for testing motion and interaction immediately; it is not
the final hand-authored mesh/bone/IK production rig.

The current script is visual/motion revision 5. Its art-direction target is the
approved Goat #10 mascot render (sky-blue/white striped jersey, gold `10`,
white shorts, chocolate horns, amber eyes, one hoof on the hip);
[`goat10-v3-reference.svg`](./goat10-v3-reference.svg) is kept for the previous
revision's proportions. Revision 5 adds eased action cross-fades, a foreground
beard-stroking hoof with mutually exclusive back/front layers, a sideways
startled recoil with gasp/sweat marks, and a centred victory V-jump with grin
and sparkles. Use `action = 1` in Rive when comparing finish.

## Create the artboard

1. In the blank Rive file, enter **W 300** and **H 275** and click **Create
   Artboard**. Do not use the 500 × 500 default.
2. Rename the artboard to **`Goat10`**.
3. Open the `</>` menu shown in the screenshot and choose **Node Script**.
4. Name the script **`Goat10Prototype`**.
5. Replace the generated scaffold with the complete contents of
   [`Goat10Prototype.lua`](./Goat10Prototype.lua), then save/compile it.
6. Return to the Design tab. In current Rive Beta builds, drag the
   `Goat10Prototype` row from the **Assets** panel onto the `Goat10` artboard.
   (Older editor builds also expose it by right-clicking the artboard.) Select
   the new child node in Hierarchy and set its position to **X 150 / Y 140**.
   If the asset cannot be dropped, open **Problems** first: a script with
   compile errors cannot be instantiated.
7. Press Play. Leave `action = 0` for the automatic demo, or select actions 1–6
   in the Inspector. Click the goat for a startled hop; drag and release it for
   a second reaction.

Suggested initial inputs:

| Input | Value |
|---|---:|
| `action` | `0` |
| `speed` | `1` |
| `accent` | `#7DBCEA` |
| `reduceMotion` | `false` |
| `showBall` | `true` |

## Export a test build

Use **Export for runtime** and save the file as
`src/assets/rive/goat10-prototype.riv`. BuddyPet keeps this prototype name
separate from the final `goat10.riv`, whose stricter `BuddyDirector`, rig,
marker, mesh and IK contract remains unchanged.

Rive runtime export currently requires a Rive plan that permits runtime export.
The source script remains editable in the Rive file; the exported `.riv` is a
compiled runtime asset and is not a substitute for keeping that source file.

## What this prototype proves

- Procedural vector drawing without SVG/PNG fallback.
- Idle breathing, walking, layered beard-stroking, eased headbutt, sideways
  startled recoil and a visually distinct centred victory-hop.
- Pointer hit testing, click reaction and drag/release reaction inside Rive.
- Script inputs that can later be data-bound to a View Model.

It does **not** create traditional bones, deformable meshes or IK handles. Those
still need to be authored in Rive's Design/Animate tools for the production
Goat. The script can remain as a controller/effect layer alongside that rig.

## Meme Cat prototype

[`MemeCatPrototype.lua`](./MemeCatPrototype.lua) is a second, independent Node
Script using the same runtime-safe API surface as Goat #10. Its visual target is
[`meme-cat-v1-reference.svg`](./meme-cat-v1-reference.svg): a plush grey-lilac
tabby with amber eyes, cream muzzle/belly, expressive ears and a purple collar.

1. Create a second **300 × 275** artboard named **`MemeCat`**.
2. Create a Node Script asset and paste all of `MemeCatPrototype.lua` into it.
   The asset may keep Rive's generated filename if the Beta editor does not
   expose Rename; the internal type name does not need to match the asset name.
3. Confirm **Problems 0**, drag the script asset from **Assets** onto the
   `MemeCat` artboard, then set the scripted node to **X 150 / Y 140**.
4. Set `action = 1` first to compare the idle pose with the reference, then use
   `action = 0` for the automatic reel. Click triggers startled; drag/release
   triggers zoomies.

Suggested inputs:

| Input | Value |
|---|---:|
| `action` | `0` |
| `speed` | `1` |
| `accent` | `#8468C8` |
| `reduceMotion` | `false` |
| `showProp` | `true` |

Meme Cat actions deliberately use different silhouettes: prowl alternates
grounded feet, grooming lifts one foreground paw to the tongue, card slap has
anticipation/impact/recovery, startled uses squash-and-stretch with a puffed
tail, and zoomies travel horizontally with rapid gait and speed lines. Export a
test asset as `src/assets/rive/meme-cat-prototype.riv` once it compiles in Rive.
