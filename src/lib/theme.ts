import { z } from "zod";

export const themePreferenceSchema = z.enum(["system", "light", "dark"]);

export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const THEME_COOKIE_NAME = "entrivo-theme";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "dark";
