const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const SUPABASE_URL = url.replace(/\/+$/, "");
export const SUPABASE_ANON_KEY = anonKey;

export const isSupabaseConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
  !SUPABASE_URL.includes("SEU-PROJETO") &&
  anonKey.length > 20 &&
  !anonKey.includes("COLE_AQUI");

export const IS_DEMO = !isSupabaseConfigured;

export const APP_NAME = "EscalaJeru";
export const CHURCH_NAME =
  (import.meta.env.VITE_CHURCH_NAME ?? "").trim() || "Igreja JERU";
export const APP_VERSION = "1.0.0";

export const SUPPORT_WHATSAPP = "";

export const VERSE = {
  text: "Servi ao Senhor com alegria e apresentai-vos a ele com canto.",
  ref: "Salmos 100:2",
};

export const MINISTRY_COLORS = [
  "#2c5a4b",
  "#b96f4e",
  "#4c6d88",
  "#77556f",
  "#9b7a3f",
  "#5d7360",
  "#8a5a44",
  "#546b7c",
];

export const AVATAR_COLORS = [
  "#2c5a4b",
  "#b96f4e",
  "#4c6d88",
  "#77556f",
  "#9b7a3f",
  "#5d7360",
];
