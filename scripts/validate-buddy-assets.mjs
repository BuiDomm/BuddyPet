import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const pets = {
  goat10: "goat10.png",
  camel7: "camel7.png",
  memeCat: "meme-cat.png",
  shiba: "shiba.png",
};
const root = process.cwd();
const assetRoot = resolve(root, "public/assets/pets");
const css = await readFile(resolve(root, "src/styles/global.css"), "utf8");
const manifest = JSON.parse(await readFile(resolve(root, "public/content/actions.v1.json"), "utf8"));
const failures = [];

for (const [petId, filename] of Object.entries(pets)) {
  const path = resolve(assetRoot, filename);
  try {
    const bytes = await readFile(path);
    const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const width = isPng ? bytes.readUInt32BE(16) : 0;
    const height = isPng ? bytes.readUInt32BE(20) : 0;
    const colorType = isPng ? bytes[25] : 0;
    if (!isPng || width < 512 || height < 512 || ![4, 6].includes(colorType)) {
      failures.push(`${filename}: expected transparent PNG at least 512×512`);
    }
  } catch {
    failures.push(`${filename}: missing`);
  }

  const actions = manifest.actions.filter((action) => action.petIds.includes(petId));
  if (actions.length < 3) failures.push(`${petId}: expected at least three actions`);
  for (const action of actions.filter((item) => !item.petIds.includes("shared"))) {
    if (!css.includes(`.action-${action.id}`)) failures.push(`${action.id}: missing motion selector`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Free Motion Rig ready: 4 transparent masters and ${manifest.actions.length} validated actions.`);
}
