import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { DIALOGUES } from "../../content";
import { createBuddyPetI18n } from "../../i18n";
import type { EpisodePlan } from "../domain/types";
import { BubbleOverlay } from "./BubbleOverlay";
import { EffectOverlay } from "./EffectOverlay";

const plan: EpisodePlan = {
  eventId: "test-episode",
  trigger: "manual",
  petId: "memeCat",
  actionId: "scratch",
  lineKey: "signature-start",
  monitorId: "primary",
  anchorRect: { x: 20, y: 20, width: 300, height: 220 },
  motionPath: [{ x: -220, y: 20, width: 300, height: 220 }, { x: 20, y: 20, width: 300, height: 220 }],
  introDurationMs: 0,
  captureRect: null,
  locale: "en",
  tone: "sassy",
  seed: 42,
  reduceMotion: false,
  powerSaver: false,
};

describe("overlay renderers", () => {
  it("renders a localized click-through speech bubble", async () => {
    const i18n = await createBuddyPetI18n({ locale: "en", detectLanguage: false });
    render(<I18nextProvider i18n={i18n}><BubbleOverlay plan={{ ...plan, line: "Hands off my new cardboard box." }} /></I18nextProvider>);
    expect(screen.getByText("Hands off my new cardboard box.")).toBeInTheDocument();
  });

  it("uses the action manifest intent for matching dialogue", async () => {
    const i18n = await createBuddyPetI18n({ locale: "en", detectLanguage: false });
    render(<I18nextProvider i18n={i18n}><BubbleOverlay plan={{ ...plan, eventId: "manifest-line", lineKey: "break-offer" }} /></I18nextProvider>);
    expect(screen.getByText(DIALOGUES.en.memeCat["break-offer"].sassy)).toBeInTheDocument();
  });

  it("selects the scratch effect from the episode action", () => {
    const { container } = render(<EffectOverlay plan={plan} />);
    expect(container.querySelector(".scratch-effect")).toBeInTheDocument();
    expect(container.querySelector(".crack-effect")).not.toBeInTheDocument();
  });

  it("marks effects for reduced motion and battery saver rendering", () => {
    const { container } = render(<EffectOverlay plan={{ ...plan, reduceMotion: true, powerSaver: true }} />);
    expect(container.querySelector(".effect-overlay")).toHaveClass("is-reduced-motion", "is-power-saver");
  });

  it.each([
    ["camel-spit-wipe", ".splatter-effect"],
    ["camel-neck-stretch", ".stretch-effect"],
    ["shiba-zoomies", ".speed-effect"],
    ["cat-cursor-loaf", ".loaf-effect"],
    ["shared-confetti-pop", ".confetti-effect"],
    ["shared-break-ticket", ".paper-prop--ticket"],
    ["shared-sticky-note", ".paper-prop--note"],
    ["shared-corner-nap", ".nap-effect"],
    ["shared-edge-peek", ".peek-effect"],
  ])("renders a distinct cartoon fallback for %s", (actionId, selector) => {
    const { container } = render(<EffectOverlay plan={{ ...plan, actionId }} />);
    expect(container.querySelector(selector)).toBeInTheDocument();
  });
});
