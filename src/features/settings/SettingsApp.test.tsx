import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { createBuddyPetI18n } from "../../i18n";
import { DEFAULT_SNAPSHOT } from "../domain/defaults";
import type { Locale } from "../domain/types";
import { SettingsApp } from "./SettingsApp";

describe("SettingsApp locale menu", () => {
  it.each([
    ["vi", "Trang chủ", "Đội Buddy"],
    ["en", "Home", "Buddy crew"],
    ["ko", "홈", "Buddy 친구들"],
    ["ja", "ホーム", "Buddyチーム"],
  ] as const)("renders the complete %s navigation catalog", async (locale, home, buddies) => {
    const i18n = await createBuddyPetI18n({ locale, detectLanguage: false });
    render(
      <I18nextProvider i18n={i18n}>
        <SettingsApp
          snapshot={{
            ...DEFAULT_SNAPSHOT,
            settings: { ...DEFAULT_SNAPSHOT.settings, locale: locale as Locale, onboardingCompleted: true },
          }}
          saving={false}
          saveError={null}
          onPatch={vi.fn()}
          onAction={vi.fn(async () => undefined)}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole("button", { name: home })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: buddies })).toBeInTheDocument();
    if (locale !== "en") expect(screen.queryByRole("button", { name: "Home" })).not.toBeInTheDocument();
  });

  it("resets the content scroll position when navigating", async () => {
    const i18n = await createBuddyPetI18n({ locale: "vi", detectLanguage: false });
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <SettingsApp
          snapshot={{ ...DEFAULT_SNAPSHOT, settings: { ...DEFAULT_SNAPSHOT.settings, locale: "vi", onboardingCompleted: true } }}
          saving={false}
          saveError={null}
          onPatch={vi.fn()}
          onAction={vi.fn(async () => undefined)}
        />
      </I18nextProvider>,
    );
    const scroll = container.querySelector<HTMLDivElement>(".page-scroll")!;
    scroll.scrollTop = 420;
    fireEvent.click(screen.getByRole("button", { name: "Đội Buddy" }));
    expect(scroll.scrollTop).toBe(0);
  });

  it("changes language immediately from the native toolbar selector and persists the choice", async () => {
    const i18n = await createBuddyPetI18n({ locale: "vi", detectLanguage: false });
    const onPatch = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <SettingsApp
          snapshot={{ ...DEFAULT_SNAPSHOT, settings: { ...DEFAULT_SNAPSHOT.settings, locale: "vi", onboardingCompleted: true } }}
          saving={false}
          saveError={null}
          onPatch={onPatch}
          onAction={vi.fn(async () => undefined)}
        />
      </I18nextProvider>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Đổi ngôn ngữ" }), { target: { value: "ja" } });
    expect(onPatch).toHaveBeenCalledWith({ locale: "ja" });
    expect(await screen.findByRole("button", { name: "ホーム" })).toBeInTheDocument();
  });

  it("uses the native tutorial route for the toolbar entrance test", async () => {
    const i18n = await createBuddyPetI18n({ locale: "vi", detectLanguage: false });
    const onAction = vi.fn(async () => undefined);
    render(
      <I18nextProvider i18n={i18n}>
        <SettingsApp
          snapshot={{ ...DEFAULT_SNAPSHOT, settings: { ...DEFAULT_SNAPSHOT.settings, locale: "vi", onboardingCompleted: true } }}
          saving={false}
          saveError={null}
          onPatch={vi.fn()}
          onAction={onAction}
        />
      </I18nextProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Test Buddy chạy ra" }));
    expect(onAction).toHaveBeenCalledWith({ action: "previewAction", petId: "memeCat", actionId: "slap" });
  });
});
