import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "paw"
  | "sparkles"
  | "clock"
  | "volume"
  | "shield"
  | "accessibility"
  | "play"
  | "pause"
  | "wand"
  | "bell"
  | "moon"
  | "chevronRight"
  | "chevronLeft"
  | "check"
  | "globe"
  | "heart"
  | "bolt"
  | "eye"
  | "eyeOff"
  | "monitor"
  | "lock"
  | "coffee"
  | "settings"
  | "x"
  | "info"
  | "headphones"
  | "keyboard"
  | "rotate"
  | "minus"
  | "plus";

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
  paw: <><path d="M12 13c-3.3 0-6 2.1-6 4.7 0 2 1.5 3.3 3.5 2.7a8.4 8.4 0 0 1 5 0c2 .6 3.5-.7 3.5-2.7 0-2.6-2.7-4.7-6-4.7Z"/><ellipse cx="5.5" cy="10" rx="2.2" ry="2.8"/><ellipse cx="10" cy="6.5" rx="2.2" ry="2.8"/><ellipse cx="18.5" cy="10" rx="2.2" ry="2.8"/><ellipse cx="14" cy="6.5" rx="2.2" ry="2.8"/></>,
  sparkles: <><path d="m12 2 1.1 4.2L17 8l-3.9 1.8L12 14l-1.1-4.2L7 8l3.9-1.8L12 2Z"/><path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14ZM5 12l.7 2.3L8 15l-2.3.7L5 18l-.7-2.3L2 15l2.3-.7L5 12Z"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  volume: <><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/></>,
  shield: <><path d="M12 3 4.5 6v5c0 5.1 3.1 8.5 7.5 10 4.4-1.5 7.5-4.9 7.5-10V6L12 3Z"/><path d="m9 12 2 2 4-4"/></>,
  accessibility: <><circle cx="12" cy="4.5" r="2"/><path d="M5 8.5h14M12 7v6M8.5 21l3.5-8 3.5 8"/></>,
  play: <path d="m9 6 9 6-9 6V6Z"/>,
  pause: <><path d="M8 5v14M16 5v14"/></>,
  wand: <><path d="m4 20 11-11M13 4l1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1ZM19 11l.8-1.5.7 1.5 1.5.7-1.5.8-.7 1.5-.8-1.5-1.5-.8 1.5-.7Z"/><path d="m3 16 5 5"/></>,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></>,
  moon: <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/>,
  chevronRight: <path d="m9 5 7 7-7 7"/>,
  chevronLeft: <path d="m15 5-7 7 7 7"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
  heart: <path d="M20.8 5.8a5.2 5.2 0 0 0-7.4 0L12 7.2l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4L12 22l8.8-8.8a5.2 5.2 0 0 0 0-7.4Z"/>,
  bolt: <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
  eyeOff: <><path d="m3 3 18 18"/><path d="M10.6 6.1A10.6 10.6 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.7M6.2 6.2C3.4 8 2 12 2 12s3.5 6 10 6a10 10 0 0 0 4-.8"/></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  coffee: <><path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M7 3v2M11 2v3M15 3v2"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  x: <><path d="m6 6 12 12M18 6 6 18"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1v-5ZM20 14h-3v6h2a1 1 0 0 0 1-1v-5Z"/></>,
  keyboard: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M7 16h10"/></>,
  rotate: <><path d="M20 7v5h-5"/><path d="M18.5 16a8 8 0 1 1 1.2-7L20 12"/></>,
  minus: <path d="M5 12h14"/>,
  plus: <><path d="M5 12h14M12 5v14"/></>,
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
