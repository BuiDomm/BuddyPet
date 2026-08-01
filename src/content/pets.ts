import type { PetDefinition } from "./types";

export const PETS = [
  {
    id: "goat10",
    label: { vi: "Dê #10", en: "Goat #10", ko: "염소 #10", ja: "ヤギ #10" },
    species: "goat",
    jerseyNumber: 10,
    defaultSelected: false,
    palette: ["#D9F2FF", "#F8FCFF", "#386CB4"],
    motionRig: "Goat10",
    motionController: "FreeMotionDirector",
    sfxCues: ["goat-bleat", "goat-gasp", "goat-cry", "goat-nibble", "goat-impact", "goat-step", "ball-tap", "soft-pop"]
  },
  {
    id: "camel7",
    label: { vi: "Lạc đà #7", en: "Camel #7", ko: "낙타 #7", ja: "ラクダ #7" },
    species: "camel",
    jerseyNumber: 7,
    defaultSelected: false,
    palette: ["#D9A55B", "#F4D29D", "#123C69"],
    motionRig: "Camel7",
    motionController: "FreeMotionDirector",
    sfxCues: ["camel-grumble", "camel-gasp", "camel-cry", "camel-chew", "camel-spit", "camel-wipe", "camel-step", "soft-pop"]
  },
  {
    id: "memeCat",
    label: { vi: "Mèo Meme", en: "Meme Cat", ko: "밈 고양이", ja: "ミーム猫" },
    species: "cat",
    jerseyNumber: null,
    defaultSelected: true,
    palette: ["#F0B45F", "#FFF0D4", "#5B4337"],
    motionRig: "MemeCat",
    motionController: "FreeMotionDirector",
    sfxCues: ["cat-mew", "cat-yowl", "cat-purr", "cat-slap", "cat-scratch", "cat-loaf", "cat-step", "soft-pop"]
  },
  {
    id: "shiba",
    label: { vi: "Shiba Inu", en: "Shiba Inu", ko: "시바견", ja: "柴犬" },
    species: "dog",
    jerseyNumber: null,
    defaultSelected: false,
    palette: ["#D87735", "#FFF1D5", "#4A3327"],
    motionRig: "ShibaInu",
    motionController: "FreeMotionDirector",
    sfxCues: ["shiba-bork", "shiba-yip", "shiba-whine", "shiba-dig", "shiba-tug", "shiba-zoom", "shiba-step", "soft-pop"]
  }
] as const satisfies readonly PetDefinition[];

export const PET_BY_ID = Object.fromEntries(PETS.map((pet) => [pet.id, pet])) as {
  readonly [Pet in (typeof PETS)[number] as Pet["id"]]: Pet;
};
