import i18next, { createInstance, type i18n as I18nInstance, type InitOptions } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { LOCALES, type Locale } from "../content/types";
import { resources } from "./resources";

const baseOptions = {
  resources,
  supportedLngs: [...LOCALES],
  fallbackLng: "en",
  keySeparator: false,
  defaultNS: "translation",
  ns: ["translation"],
  load: "languageOnly",
  nonExplicitSupportedLngs: true,
  returnNull: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false }
} satisfies InitOptions;

export interface BuddyPetI18nOptions {
  readonly locale?: Locale;
  readonly detectLanguage?: boolean;
}

function addPlugins(instance: I18nInstance, detectLanguage: boolean): I18nInstance {
  instance.use(initReactI18next);
  if (detectLanguage) instance.use(LanguageDetector);
  return instance;
}

function initializationOptions(options: BuddyPetI18nOptions): InitOptions {
  const detectLanguage = options.detectLanguage ?? options.locale === undefined;
  return {
    ...baseOptions,
    lng: options.locale,
    detection: detectLanguage
      ? {
          order: ["localStorage", "navigator", "htmlTag"],
          caches: ["localStorage"],
          lookupLocalStorage: "buddypet.locale"
        }
      : undefined
  };
}

/** Creates an isolated instance for tests, previews, and secondary Tauri windows. */
export async function createBuddyPetI18n(options: BuddyPetI18nOptions = {}): Promise<I18nInstance> {
  const detectLanguage = options.detectLanguage ?? options.locale === undefined;
  const instance = addPlugins(createInstance(), detectLanguage);
  await instance.init(initializationOptions(options));
  return instance;
}

export const i18n = i18next;
let sharedInitialization: Promise<I18nInstance> | null = null;

/** Initializes the shared React instance once; repeated calls reuse the same promise. */
export function initializeI18n(options: BuddyPetI18nOptions = {}): Promise<I18nInstance> {
  if (i18n.isInitialized) {
    if (options.locale && i18n.resolvedLanguage !== options.locale) {
      return i18n.changeLanguage(options.locale).then(() => i18n);
    }
    return Promise.resolve(i18n);
  }
  if (!sharedInitialization) {
    const detectLanguage = options.detectLanguage ?? options.locale === undefined;
    addPlugins(i18n, detectLanguage);
    sharedInitialization = i18n.init(initializationOptions(options)).then(() => i18n);
  }
  return sharedInitialization;
}

export { dialogueTranslationKey, resources } from "./resources";
export type { DialogueTranslationKey } from "./resources";
