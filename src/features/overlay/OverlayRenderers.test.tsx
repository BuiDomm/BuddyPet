import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { createBuddyPetI18n } from "../../i18n";
import type { EpisodePlan } from "../domain/types";
import { BubbleOverlay } from "./BubbleOverlay";
import { EffectOverlay } from "./EffectOverlay";

const plan: EpisodePlan = {
  eventId: "test-episode",
  trigger: "manual",
  petId: "memeCat",
  actionId: "scratch",
  monitorId: "primary",
  anchorRect: { x: 20, y: 20, width: 300, height: 220 },
  captureRect: null,
  locale: "en",
  tone: "sassy",
  seed: 42,
};

describe("overlay renderers", () => {
  it("renders a localized click-through speech bubble", async () => {
    const i18n = await createBuddyPetI18n({ locale: "en", detectLanguage: false });
    render(<I18nextProvider i18n={i18n}><BubbleOverlay plan={{ ...plan, line: "Hands off my new cardboard box." }} /></I18nextProvider>);
    expect(screen.getByText("Hands off my new cardboard box.")).toBeInTheDocument();
  });

  it("selects the scratch effect from the episode action", () => {
    const { container } = render(<EffectOverlay plan={plan} />);
    expect(container.querySelector(".scratch-effect")).toBeInTheDocument();
    expect(container.querySelector(".crack-effect")).not.toBeInTheDocument();
  });
});
