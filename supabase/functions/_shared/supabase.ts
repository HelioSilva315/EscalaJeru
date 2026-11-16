import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(authorization: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY não configurados.");
  }
  return createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface CallerProfile {
  id: string;
  full_name: string;
  role: "leader" | "member" | "pending";
  active: boolean;
}

/** Valida o JWT do chamador e devolve o perfil (fonte: banco, não o token). */
export async function requireLeader(
  authorization: string | null,
): Promise<CallerProfile> {
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError("Sessão não informada.", 401);
  }
  const token = authorization.slice("Bearer ".length).trim();
  const client = anonClient(authorization);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError("Sessão inválida ou expirada.", 401);
  }

  const admin = serviceClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    throw new HttpError("Perfil não encontrado.", 403);
  }
  if (!profile.active || profile.role !== "leader") {
    throw new HttpError("Somente líderes podem executar esta ação.", 403);
  }
  return profile as CallerProfile;
}

export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function normalizePhoneBR(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return null;
  if (digits[0] === "0") return null;
  return `+55${digits}`;
}

export function inviteCode(): string {
  // Sem caracteres ambíguos (0/O, 1/I/L).
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
}
