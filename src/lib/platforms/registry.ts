/**
 * Supported social platforms. The order here is the canonical display order and
 * is also the categorical color order validated for charts (see globals.css).
 */
export const PLATFORMS = ["instagram", "tiktok", "facebook", "youtube", "linkedin", "x", "pinterest"] as const;

export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

export type PlatformMeta = {
  id: Platform;
  name: string;
  /** What an account is called on this platform. */
  accountNoun: string;
  /** Prefix for handles shown in the UI ("@name"), empty when not applicable. */
  handlePrefix: string;
  /** Validated categorical chart color. Mirrors --color-viz-<platform>. */
  vizColor: string;
  /** Developer portal where an official app must be registered. */
  developerPortal: string;
};

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  instagram: {
    id: "instagram",
    name: "Instagram",
    accountNoun: "Professional account",
    handlePrefix: "@",
    vizColor: "#d95926",
    developerPortal: "https://developers.facebook.com/docs/instagram-platform",
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    accountNoun: "Account",
    handlePrefix: "@",
    vizColor: "#199e70",
    developerPortal: "https://developers.tiktok.com/",
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    accountNoun: "Page",
    handlePrefix: "",
    vizColor: "#3987e5",
    developerPortal: "https://developers.facebook.com/docs/pages-api",
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    accountNoun: "Channel",
    handlePrefix: "@",
    vizColor: "#e66767",
    developerPortal: "https://developers.google.com/youtube/v3",
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    accountNoun: "Page or profile",
    handlePrefix: "",
    vizColor: "#9085e9",
    developerPortal: "https://learn.microsoft.com/linkedin/",
  },
  x: {
    id: "x",
    name: "X",
    accountNoun: "Account",
    handlePrefix: "@",
    vizColor: "#008300",
    developerPortal: "https://developer.x.com/",
  },
  pinterest: {
    id: "pinterest",
    name: "Pinterest",
    accountNoun: "Business account",
    handlePrefix: "@",
    vizColor: "#d55181",
    developerPortal: "https://developers.pinterest.com/",
  },
};

/** Single-series data color (validated). Mirrors --color-viz-gold. */
export const VIZ_SINGLE_SERIES = "#c98500";
export const VIZ_GRID = "#242422";
export const VIZ_AXIS = "#383835";
export const VIZ_SURFACE = "#121211";
