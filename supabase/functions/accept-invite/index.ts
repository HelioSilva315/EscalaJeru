import { fail, json, preflight } from "../_shared/cors.ts";
import { HttpError, serviceClient } from "../_shared/supabase.ts";

function passwordProblem(password: string): string | null {
  if (password.length < 8) return "A senha precisa ter ao menos 8 caracteres.";
  if (!/[A-Za-zÀ-ÿ]/.test(password)) return "Inclua ao menos uma letra.";
  if (!/\d/.test(password)) return "Inclua ao menos um número.";
  if (password.length > 72) return "A senha é longa demais.";
  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return fail("Método não permitido.", 405);

  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.code ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const password = String(body.password ?? "");

    if (code.length < 6) {
      return fail("Código de convite inválido.");
    }
    const problem = passwordProblem(password);
    if (problem) return fail(problem);

    const admin = serviceClient();

    const { data: invite, error: inviteError } = await admin
      .from("invites")
      .select("id, profile_id, used_at, revoked_at, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (inviteError) {
      console.error("accept-invite lookup:", inviteError);
      return fail("Não foi possível validar o convite.", 500);
    }

    // Mensagem única para não revelar se o código existe.
    const invalid = () =>
      fail(
        "Convite inválido ou expirado. Peça um novo código à liderança da igreja.",
        400,
      );

    if (!invite) return invalid();

    const now = Date.now();
    if (invite.used_at || invite.revoked_at) return invalid();
    if (new Date(invite.expires_at).getTime() < now) return invalid();

    const { data: target, error: userError } = await admin.auth.admin
      .getUserById(invite.profile_id);
    if (userError || !target?.user) {
      return fail("Conta do convite não encontrada. Fale com a liderança.", 404);
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(
      invite.profile_id,
      {
        password,
        email_confirm: true,
        ban_duration: "none",
      },
    );
    if (updateError) {
      return fail(
        updateError.message.includes("Password")
          ? "A senha não atende aos requisitos de segurança."
          : "Não foi possível ativar o acesso.",
        400,
      );
    }

    await admin
      .from("invites")
      .update({ used_at: new Date().toISOString() })
      .eq("id", invite.id);

    await admin
      .from("profiles")
      .update({ active: true })
      .eq("id", invite.profile_id)
      .neq("role", "pending");

    return json({ email: target.user.email });
  } catch (error) {
    if (error instanceof HttpError) return fail(error.message, error.status);
    console.error("accept-invite:", error);
    return fail("Não foi possível ativar o acesso.", 500);
  }
});
