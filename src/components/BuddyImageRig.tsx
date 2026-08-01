import type { BuddyId } from "../features/domain/types";

const IMAGE_BY_BUDDY: Record<BuddyId, string> = {
  goat10: "/assets/pets/goat10.png",
  camel7: "/assets/pets/camel7.png",
  memeCat: "/assets/pets/meme-cat.png",
  shiba: "/assets/pets/shiba.png",
};

export function BuddyImageRig({ buddyId, decorative, label }: { buddyId: BuddyId; decorative: boolean; label: string }) {
  const source = IMAGE_BY_BUDDY[buddyId];
  return (
    <div className={`buddy-image-rig buddy-image-rig--${buddyId}`} role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : label}>
      <div className="buddy-image-rig__mesh">
        <img className="buddy-image-part buddy-image-part--top" src={source} alt="" draggable={false}/>
        <img className="buddy-image-part buddy-image-part--middle" src={source} alt="" draggable={false}/>
        <img className="buddy-image-part buddy-image-part--leg-left" src={source} alt="" draggable={false}/>
        <img className="buddy-image-part buddy-image-part--leg-right" src={source} alt="" draggable={false}/>
      </div>
    </div>
  );
}
