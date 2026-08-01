import { useEffect, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { BUDDIES, DEFAULT_BUDDY } from "../features/domain/defaults";
import type { BuddyId } from "../features/domain/types";
import { BuddyImageRig } from "./BuddyImageRig";

export type BuddyMood = "idle" | "enter" | "startled" | "happy" | "petted" | "dragging" | "prank" | "exit";

interface BuddyCharacterProps {
  buddyId: BuddyId;
  mood?: BuddyMood;
  size?: "tiny" | "small" | "medium" | "large" | "stage";
  decorative?: boolean;
  className?: string;
  actionId?: string;
  reduceMotion?: boolean;
  onRigReady?: (ready: boolean) => void;
  onMarker?: (marker: string) => void;
}

function Goat() {
  return (
    <>
      <ellipse className="buddy-shadow" cx="120" cy="198" rx="62" ry="12" />
      <g className="buddy-tail"><path fill="#f4e7d7" stroke="#46394c" strokeWidth="5" d="M66 127c-20-9-24-25-11-30 6 10 14 14 25 16Z" /></g>
      <g className="buddy-body">
        <path fill="#f7f0e6" stroke="#46394c" strokeWidth="5" d="M69 115c10-22 87-25 105 3 13 20 2 59-28 67H91c-30-7-39-43-22-70Z" />
        <path fill="var(--buddy-accent)" stroke="#46394c" strokeWidth="5" d="M72 126c31 12 72 11 99-1l1 28c-9 23-28 33-53 33-26 0-45-10-51-34Z" />
        <path fill="#fff" d="M91 129c5 2 10 3 16 3v51H91c-7-2-14-6-19-11l-3-37c7-3 14-5 22-6ZM151 130c6-1 12-3 18-6l3 30c-4 12-12 21-21 26Z" opacity=".86" />
        <text x="122" y="165" textAnchor="middle" fontSize="32" fontWeight="900" fill="#fff" stroke="#3f5186" strokeWidth="1.5">10</text>
        <path className="buddy-leg buddy-leg--left" fill="#ede1d2" stroke="#46394c" strokeWidth="5" d="M84 174v21c0 8 16 8 18 0l4-17Z" />
        <path className="buddy-leg buddy-leg--right" fill="#ede1d2" stroke="#46394c" strokeWidth="5" d="M143 178l4 17c2 8 18 8 18 0v-23Z" />
      </g>
      <g className="buddy-head">
        <path fill="#dfcaa7" stroke="#46394c" strokeWidth="5" d="M85 48C70 24 78 8 91 8c-3 17 2 25 14 34ZM155 48c15-24 7-40-6-40 3 17-2 25-14 34Z" />
        <path fill="#f7f0e6" stroke="#46394c" strokeWidth="5" d="M79 47c17-18 64-18 82 2 13 15 9 50-7 65-17 16-53 15-69-2-15-16-20-48-6-65Z" />
        <path fill="#f0d5cd" stroke="#46394c" strokeWidth="4" d="M82 53 55 45c-6 14 7 26 27 23ZM158 53l27-8c6 14-7 26-27 23Z" />
        <path fill="#e9d8c4" d="M91 84c13-9 43-9 57 0l-4 20c-10 13-39 13-49 0Z" />
        <g className="buddy-eyes"><ellipse cx="103" cy="72" rx="6" ry="8" fill="#362d39" /><ellipse cx="138" cy="72" rx="6" ry="8" fill="#362d39" /><circle cx="101" cy="69" r="2" fill="#fff" /><circle cx="136" cy="69" r="2" fill="#fff" /></g>
        <path className="buddy-mouth" d="M111 96c6 5 13 5 19 0" fill="none" stroke="#46394c" strokeWidth="4" strokeLinecap="round" />
        <path d="M116 88c2-2 6-2 8 0" fill="none" stroke="#665561" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="buddy-ball"><circle cx="190" cy="188" r="18" fill="#fff" stroke="#46394c" strokeWidth="4"/><path d="m190 177 7 5-3 8h-8l-3-8 7-5ZM176 183l7-1M179 197l7-7M202 198l-8-8M205 182l-8 1" stroke="#46394c" strokeWidth="2.5" fill="none"/></g>
    </>
  );
}

function Camel() {
  return (
    <>
      <ellipse className="buddy-shadow" cx="120" cy="199" rx="67" ry="11" />
      <g className="buddy-body">
        <path fill="#d99c5c" stroke="#493642" strokeWidth="5" d="M57 119c7-21 31-31 53-22 8-27 44-27 55 1 19 3 30 16 27 38-3 25-19 43-46 45H91c-30-1-43-32-34-62Z" />
        <path fill="var(--buddy-accent)" stroke="#493642" strokeWidth="5" d="M61 126c31-7 74-3 104 11l-8 44H87c-17-5-26-21-28-40Z" />
        <path className="buddy-leg buddy-leg--left" fill="#c8874b" stroke="#493642" strokeWidth="5" d="M77 169v27c1 8 17 8 18 0l3-20Z" />
        <path className="buddy-leg buddy-leg--right" fill="#c8874b" stroke="#493642" strokeWidth="5" d="M143 177l3 19c1 8 17 8 18 0v-24Z" />
        <text x="126" y="170" textAnchor="middle" fontSize="35" fontWeight="900" fill="#f5e9d3">7</text>
      </g>
      <g className="buddy-head camel-head">
        <path fill="#d99c5c" stroke="#493642" strokeWidth="5" d="M111 117c-10-25-9-56-1-80 5-17 16-25 34-23 25 2 35 24 24 45-8 15-21 23-30 34l-4 34Z" />
        <path fill="#eeb979" stroke="#493642" strokeWidth="5" d="M126 24c8-16 25-21 40-12 16 10 15 34-1 44-16 10-45 5-48-11-2-8 2-15 9-21Z" />
        <path fill="#d99c5c" stroke="#493642" strokeWidth="4" d="m127 21-14-14c-7 11-3 21 10 28ZM158 14l11-11c7 9 3 19-8 26Z" />
        <g className="buddy-eyes"><ellipse cx="139" cy="31" rx="5" ry="7" fill="#352d34" /><circle cx="138" cy="29" r="1.6" fill="#fff" /></g>
        <path className="buddy-mouth" d="M153 46c7 2 12 0 16-4" fill="none" stroke="#493642" strokeWidth="3.5" strokeLinecap="round" />
      </g>
      <g className="buddy-spark"><path d="m199 78 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="#ffd55c" stroke="#493642" strokeWidth="3"/></g>
    </>
  );
}

function Cat() {
  return (
    <>
      <ellipse className="buddy-shadow" cx="120" cy="196" rx="68" ry="12" />
      <g className="buddy-tail"><path fill="#9b94a6" stroke="#403746" strokeWidth="6" strokeLinecap="round" d="M164 151c38 7 46-22 30-32-3 22-14 19-29 15" /></g>
      <g className="buddy-body">
        <path fill="#a9a3b5" stroke="#403746" strokeWidth="5" d="M65 125c13-26 92-28 108 2 15 28 1 61-29 65H91c-33-5-41-40-26-67Z" />
        <path fill="#eee8ea" d="M89 148c11-17 51-18 64 0l-9 43H92Z" />
        <path className="buddy-leg buddy-leg--left" fill="#9891a2" stroke="#403746" strokeWidth="5" d="M76 172v21c1 9 23 9 24 0l3-17Z" />
        <path className="buddy-leg buddy-leg--right" fill="#9891a2" stroke="#403746" strokeWidth="5" d="m141 176 3 17c1 9 23 9 24 0v-21Z" />
      </g>
      <g className="buddy-head">
        <path fill="#a9a3b5" stroke="#403746" strokeWidth="5" d="m72 54 11-37 27 23c10-4 22-4 31 0l27-23 4 42c9 22 0 52-19 65-20 14-55 9-70-10-13-17-19-39-11-60Z" />
        <path fill="#e9b9c7" d="m82 31 5 24 15-12ZM160 31l-4 24-13-12Z" />
        <g className="buddy-eyes"><ellipse cx="102" cy="76" rx="12" ry="14" fill="#fff" stroke="#403746" strokeWidth="3" /><ellipse cx="142" cy="76" rx="12" ry="14" fill="#fff" stroke="#403746" strokeWidth="3" /><circle cx="105" cy="79" r="5" fill="#403746" /><circle cx="145" cy="79" r="5" fill="#403746" /></g>
        <path fill="#e9a9b6" stroke="#403746" strokeWidth="3" d="m122 92 6 5-6 5-6-5Z" />
        <path className="buddy-mouth" d="M122 102c-1 10-11 10-15 4M122 102c1 10 11 10 15 4" fill="none" stroke="#403746" strokeWidth="3" strokeLinecap="round" />
        <path d="M90 96 61 90M91 105l-30 4M151 96l29-6M151 105l30 4" stroke="#403746" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g className="buddy-spark"><path d="m188 53 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" fill="#ffd65a"/></g>
    </>
  );
}

function Shiba() {
  return (
    <>
      <ellipse className="buddy-shadow" cx="120" cy="198" rx="68" ry="11" />
      <g className="buddy-tail"><path fill="#e68a3e" stroke="#44343a" strokeWidth="6" strokeLinecap="round" d="M164 128c36 1 37-31 17-34 8 13 0 25-17 19" /></g>
      <g className="buddy-body">
        <path fill="#e99149" stroke="#44343a" strokeWidth="5" d="M60 124c14-29 96-31 115 1 16 28 0 62-31 67H91c-34-5-46-40-31-68Z" />
        <path fill="#fff1dc" d="M84 145c13-15 56-16 70 0l-10 46H91Z" />
        <path className="buddy-leg buddy-leg--left" fill="#f1a45e" stroke="#44343a" strokeWidth="5" d="M75 171v23c1 9 24 9 25 0l2-17Z" />
        <path className="buddy-leg buddy-leg--right" fill="#f1a45e" stroke="#44343a" strokeWidth="5" d="m140 177 3 17c1 9 24 9 25 0v-23Z" />
      </g>
      <g className="buddy-head">
        <path fill="#e99149" stroke="#44343a" strokeWidth="5" d="m72 56 13-42 26 26c8-3 18-3 27 0l26-26 8 45c7 22-4 49-23 61-21 12-52 7-67-12-12-15-18-34-10-52Z" />
        <path fill="#f8c08e" d="m84 28 5 26 15-12ZM157 28l-5 26-12-12Z" />
        <path fill="#fff1dc" d="M91 78c4-16 17-24 31-10 15-14 29-5 32 11 5 23-11 37-32 38-22 0-37-16-31-39Z" />
        <g className="buddy-eyes"><path d="M96 73c5 5 11 5 16 0M134 73c5 5 11 5 16 0" fill="none" stroke="#44343a" strokeWidth="4" strokeLinecap="round" /></g>
        <path fill="#44343a" d="M116 86c4-3 9-3 13 0-1 6-4 8-7 8-3 0-5-2-6-8Z" />
        <path className="buddy-mouth" d="M122 94c0 9-8 12-14 8M122 94c0 9 8 12 14 8" fill="none" stroke="#44343a" strokeWidth="3" strokeLinecap="round" />
        <path fill="#e68b9b" stroke="#44343a" strokeWidth="2.5" d="M118 103c3 13 16 12 17-1-6 3-11 3-17 1Z" />
      </g>
      <g className="buddy-spark"><path d="m191 68 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="#ffe174" stroke="#44343a" strokeWidth="2.5" /></g>
    </>
  );
}

export function BuddyCharacter({ buddyId, mood = "idle", size = "medium", decorative = false, className = "", actionId, reduceMotion, onRigReady }: BuddyCharacterProps) {
  const { t } = useTranslation();
  const buddy = BUDDIES.find((item) => item.id === buddyId) ?? DEFAULT_BUDDY;
  const label = t(`pets.${buddy.id}.name`, { defaultValue: buddy.name });
  const actionClass = actionId ? `action-${actionId.replace(/[^a-zA-Z0-9_-]/g, "")}` : "";
  const style = {
    "--buddy-accent": buddy.accent,
    "--buddy-soft-accent": buddy.softAccent,
  } as CSSProperties;

  useEffect(() => {
    // The free rig uses the stage timeline for synchronized procedural SFX.
    onRigReady?.(false);
  }, [buddyId, onRigReady]);

  return (
    <div className={`buddy-character buddy-character--${size} mood-${mood} uses-free-rig ${reduceMotion ? "is-reduced-motion" : ""} ${actionClass} ${className}`} data-motion-engine="free-rig-v1" style={style} role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : label}>
      <BuddyImageRig buddyId={buddyId} decorative label={label}/>
      <svg
        className="buddy-svg-layer"
        viewBox="0 0 240 220"
        aria-hidden="true"
      >
        {buddyId === "goat10" && <Goat />}
        {buddyId === "camel7" && <Camel />}
        {buddyId === "memeCat" && <Cat />}
        {buddyId === "shiba" && <Shiba />}
      </svg>
    </div>
  );
}
