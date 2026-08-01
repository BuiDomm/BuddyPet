import { validateActionCatalog, validateLocalizationContract, validateSfxCatalog } from "./schema";
import type { ActionCatalog, LocalizationContract, SfxCatalog } from "./types";

export const ACTION_CATALOG_URL = "/content/actions.v1.json";
export const SFX_CATALOG_URL = "/content/sfx-cues.v1.json";
export const LOCALIZATION_CONTRACT_URL = "/content/localization-contract.v1.json";

export class ContentLoadError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ContentLoadError";
    this.cause = cause;
  }
}

export interface LoadActionCatalogOptions {
  readonly fetcher?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly url?: string;
}

export async function loadActionCatalog(options: LoadActionCatalogOptions = {}): Promise<ActionCatalog> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) throw new ContentLoadError("No fetch implementation is available to load BuddyPet content");

  try {
    const response = await fetcher(options.url ?? ACTION_CATALOG_URL, {
      cache: "no-store",
      signal: options.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return validateActionCatalog(await response.json());
  } catch (error) {
    if (error instanceof ContentLoadError) throw error;
    throw new ContentLoadError("BuddyPet action content could not be loaded or validated", error);
  }
}

export async function loadSfxCatalog(options: LoadActionCatalogOptions = {}): Promise<SfxCatalog> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) throw new ContentLoadError("No fetch implementation is available to load BuddyPet content");

  try {
    const response = await fetcher(options.url ?? SFX_CATALOG_URL, {
      cache: "no-store",
      signal: options.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return validateSfxCatalog(await response.json());
  } catch (error) {
    if (error instanceof ContentLoadError) throw error;
    throw new ContentLoadError("BuddyPet SFX content could not be loaded or validated", error);
  }
}

export async function loadLocalizationContract(options: LoadActionCatalogOptions = {}): Promise<LocalizationContract> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) throw new ContentLoadError("No fetch implementation is available to load BuddyPet content");

  try {
    const response = await fetcher(options.url ?? LOCALIZATION_CONTRACT_URL, {
      cache: "no-store",
      signal: options.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return validateLocalizationContract(await response.json());
  } catch (error) {
    if (error instanceof ContentLoadError) throw error;
    throw new ContentLoadError("BuddyPet localization contract could not be loaded or validated", error);
  }
}
