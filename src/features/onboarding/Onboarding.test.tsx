import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { createBuddyPetI18n } from "../../i18n";
import { DEFAULT_SETTINGS } from "../domain/defaults";
import { Onboarding } from "./Onboarding";

async function renderOnboarding() {
  const i18n = await createBuddyPetI18n({ locale: "en", detectLanguage: false });
  const onAction = vi.fn(async () => undefined);
  const onComplete = vi.fn(async () => undefined);
  render(
    <I18nextProvider i18n={i18n}>
      <Onboarding initialSettings={{ ...DEFAULT_SETTINGS, locale: "en" }} capturePermission="unknown" onAction={onAction} onComplete={onComplete} />
    </I18nextProvider>,
  );
  return { onAction, onComplete };
}

describe("Onboarding", () => {
  it("preselects Meme Cat for a new user", async () => {
    await renderOnboarding();
    expect(screen.getByRole("radio", { name: /meme cat/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /goat #10/i })).toHaveAttribute("aria-checked", "false");
  });

  it("walks through all five setup decisions and completes", async () => {
    const { onComplete } = await renderOnboarding();

    expect(screen.getByRole("heading", { name: /choose your tiny troublemaker/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /shiba inu/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByRole("heading", { name: /how should your buddy tease you/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /sassy/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    fireEvent.click(screen.getByRole("radio", { name: /chaos/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByRole("heading", { name: /prank that forgets/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    fireEvent.click(screen.getByRole("button", { name: /try sound and controls|let the mischief begin/i }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      onboardingCompleted: true,
      selectedPets: ["shiba"],
      tone: "sassy",
      intensity: "chaos",
    }));
  });

  it("requests capture permission without blocking generic prank fallback", async () => {
    const { onAction } = await renderOnboarding();
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /allow access/i }));
    expect(onAction).toHaveBeenCalledWith({ action: "requestCapture" });
  });
});
