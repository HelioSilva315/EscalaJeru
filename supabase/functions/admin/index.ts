import {
  fail,
  json,
  preflight,
} from "../_shared/cors.ts";
import {
  HttpError,
  inviteCode,
  normalizePhoneBR,
  randomPassword,
  requireLeader,
  serviceClient,
} from "../_shared/supabase.ts";

interface CreatePersonInput {
  full_name?: string;
  phone?: string;
  email?: string;
  role?: "leader" | "member";
  birth_date?: string | null;
  avatar_color?: string;
  password?: string;
}

const AVATAR_COLORS = [
  "#2c5a4b",
  "#b96f4e",
  "#4c6d88",
  "#77556f",
  "#9b7a3f",
  "#5d7360",
];

function cleanName(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 90);
}

function syntheticEmail(phone: string): string {
  return `m${phone.replace(/\D/g, "")}@membros.escalajeru.app`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return fail("Método não permitido.", 405);

  try {
    const authorization = request.headers.get("Authorization");
    const leader = await requireLeader(authorization);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const admin = serviceClient();

    if (action === "create-person") {
      const input = (body.input ?? {}) as CreatePersonInput;
      const fullName = cleanName(input.full_name);
      const phone = normalizePhoneBR(input.phone ?? "");
      const role = input.role === "leader" ? "leader" : "member";
      const email = (input.email ?? "").trim().toLowerCase();

      if (fullName.split(" ").length < 2) {
        return fail("Informe o nome completo (nome e sobrenome).");
      }
      if (!phone) {
        return fail("Telefone obrigatório. Use DDD + número.");
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return fail("E-mail inválido.");
      }

      const { data: existingPhone } = await admin
        .from("profiles")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();
      if (existingPhone) {
        return fail("Já existe alguém cadastrado com este telefone.");
      }

      const loginEmail = email || syntheticEmail(phone);
      const color =
        input.avatar_color && /^#[0-9a-fA-F]{6}$/.test(input.avatar_color)
          ? input.avatar_color
          : AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      const provisionalPassword = (input.password ?? "").trim() || randomPassword();

      const { data: created, error: createError } = await admin.auth.admin
        .createUser({
          email: loginEmail,
          password: provisionalPassword,
          email_confirm: true,
          app_metadata: { invited: true, role, invited_by: leader.id },
          user_metadata: {
            full_name: fullName,
            phone,
            avatar_color: color,
          },
        });

      if (createError || !created.user) {
        const message = createError?.message ?? "Não foi possível criar a conta.";
        if (/already|registered|exists/i.test(message)) {
          return fail("Este e-mail já está cadastrado. Use outro e-mail.");
        }
        return fail(message, 400);
      }

      const profileId = created.user.id;

      // O trigger já cria o perfil; completamos os campos opcionais.
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .update({
          birth_date: input.birth_date || null,
          avatar_color: color,
          role,
          active: true,
          must_change_password: true,
        })
        .eq("id", profileId)
        .select("*")
        .single();

      if (profileError || !profile) {
        await admin.auth.admin.deleteUser(profileId);
        return fail(profileError?.message ?? "Perfil não pôde ser criado.", 500);
      }

      return json({
        person: profile,
        provisionalPassword,
      });
    }

    if (action === "resend-invite") {
      const personId = String(body.personId ?? "");
      if (!personId) return fail("Informe a pessoa.");

      const { data: profile } = await admin
        .from("profiles")
        .select("id, active")
        .eq("id", personId)
        .maybeSingle();
      if (!profile) return fail("Pessoa não encontrada.", 404);
      if (!profile.active) return fail("Este cadastro está desativado.");

      await admin
        .from("invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("profile_id", personId)
        .is("used_at", null)
        .is("revoked_at", null);

      const code = inviteCode();
      const { error } = await admin.from("invites").insert({
        profile_id: personId,
        code,
        created_by: leader.id,
      });
      if (error) return fail(error.message, 500);
      return json({ inviteCode: code });
    }

    if (action === "deactivate-person") {
      const personId = String(body.personId ?? "");
      if (!personId) return fail("Informe a pessoa.");
      if (personId === leader.id) {
        return fail("Você não pode desativar o seu próprio acesso.");
      }

      await admin
        .from("schedules")
        .delete()
        .eq("profile_id", personId)
        .gte("event_date", new Date().toISOString().slice(0, 10));

      const { error } = await admin
        .from("profiles")
        .update({ active: false, role: "member" })
        .eq("id", personId);
      if (error) return fail(error.message, 500);

      const { data: target } = await admin.auth.admin.getUserById(personId);
      if (target?.user) {
        await admin.auth.admin.updateUserById(personId, {
          ban_duration: "876000h",
        });
      }
      return json({ ok: true });
    }

    if (action === "reset-password") {
      const personId = String(body.personId ?? "");
      if (!personId) return fail("Informe a pessoa.");

      const { data: target } = await admin.auth.admin.getUserById(personId);
      if (!target?.user) return fail("Pessoa não encontrada.", 404);

      const provisionalPassword = randomPassword();
      const { error: updateError } = await admin.auth.admin.updateUserById(personId, {
        password: provisionalPassword,
      });
      if (updateError) return fail(updateError.message, 500);

      await admin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", personId);

      return json({ provisionalPassword });
    }

    return fail("Ação desconhecida.", 404);
  } catch (error) {
    if (error instanceof HttpError) return fail(error.message, error.status);
    console.error("admin:", error);
    return fail("Não foi possível concluir a ação.", 500);
  }
});
