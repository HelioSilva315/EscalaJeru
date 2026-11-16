import { IS_DEMO } from "./config";
import { demoApi, demoSessionId, clearDemoSession, setDemoSession, currentDemoPerson } from "./demo";
import { normalizePhoneBR } from "./phone";
import { requireSupabase, supabase } from "./supabase";
import type {
  AppNotification,
  Channel,
  ChurchEvent,
  DirectoryPerson,
  EventInput,
  InviteResult,
  Message,
  Ministry,
  MinistryInput,
  MinistryMember,
  Person,
  PersonInput,
  Role,
  Schedule,
  ScheduleStatus,
  ScheduleWithRelations,
} from "./types";

export { IS_DEMO };

/* ------------------------------------------------------------------ */
/* Erros amigáveis                                                     */
/* ------------------------------------------------------------------ */
export function friendlyError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Não foi possível concluir. Tente novamente.";
  const msg = raw.toLowerCase();

  if (msg.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (msg.includes("user already registered")) return "Este e-mail já está cadastrado.";
  if (msg.includes("password should be at least")) return "A senha é curta demais.";
  if (msg.includes("rate limit") || msg.includes("too many"))
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos.";
  if (msg.includes("failed to fetch") || msg.includes("network"))
    return "Sem conexão com o servidor. Verifique sua internet.";
  if (msg.includes("row-level security") || msg.includes("permission denied"))
    return "Você não tem permissão para esta ação.";
  if (msg.includes("duplicate key") && msg.includes("phone"))
    return "Já existe alguém com este telefone.";
  if (msg.includes("schedules_one_per_day"))
    return "Esta pessoa já serve em outro ministério neste dia. Cada pessoa pode servir em um ministério por dia.";
  if (msg.includes("duplicate key") && msg.includes("event_id"))
    return "Esta pessoa já está nesta equipe.";
  if (msg.includes("duplicate key")) return "Este registro já existe.";
  if (msg.includes("já está escalad")) return raw;
  if (msg.includes("um ministério por dia")) return raw;
  if (msg.includes("jwt") || msg.includes("session")) return "Sua sessão expirou. Entre novamente.";
  if (msg.includes("function") && msg.includes("not found"))
    return "Recurso do servidor ainda não publicado. Fale com o administrador.";
  return raw.length > 180 ? "Não foi possível concluir. Tente novamente." : raw;
}

async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(name, {
    body: body as Record<string, unknown>,
  });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const payload = (await ctx.json()) as { error?: string; message?: string };
        detail = payload.error || payload.message || detail;
      }
    } catch {
      /* usa mensagem padrão */
    }
    throw new Error(detail);
  }
  return data as T;
}

/* ------------------------------------------------------------------ */
/* Autenticação                                                        */
/* ------------------------------------------------------------------ */
export async function getSessionUserId(): Promise<string | null> {
  if (IS_DEMO) {
    const id = demoSessionId();
    return id;
  }
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function signIn(email: string, password: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signUpFirstLeader(input: {
  full_name: string;
  phone: string;
  email: string;
  password: string;
}): Promise<{ needsConfirmation: boolean }> {
  const client = requireSupabase();
  const phone = normalizePhoneBR(input.phone);
  if (!phone) throw new Error("Telefone inválido.");
  const { data, error } = await client.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: { full_name: input.full_name.trim(), phone },
    },
  });
  if (error) throw new Error(error.message);
  return { needsConfirmation: !data.session };
}

export async function signOut(): Promise<void> {
  if (IS_DEMO) {
    clearDemoSession();
    return;
  }
  const client = requireSupabase();
  await client.auth.signOut();
}

export async function resetPassword(email: string): Promise<void> {
  if (IS_DEMO) throw new Error("Indisponível no modo demonstração.");
  const client = requireSupabase();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
  if (error) throw new Error(error.message);
}

export async function acceptInvite(code: string, password: string): Promise<string> {
  const data = await invokeFunction<{ email: string }>("accept-invite", {
    code: code.trim().toUpperCase(),
    password,
  });
  return data.email;
}

export async function needsBootstrap(): Promise<boolean> {
  if (IS_DEMO) return false;
  const client = requireSupabase();
  const { data, error } = await client.rpc("needs_bootstrap");
  if (error) return false;
  return Boolean(data);
}

export async function onAuthChange(cb: () => void): Promise<() => void> {
  if (IS_DEMO) return () => undefined;
  const client = requireSupabase();
  const { data } = client.auth.onAuthStateChange(() => cb());
  return () => data.subscription.unsubscribe();
}

/* ------------------------------------------------------------------ */
/* Perfil                                                              */
/* ------------------------------------------------------------------ */
export async function getMyProfile(): Promise<Person> {
  if (IS_DEMO) return demoApi.getMyProfile();
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão expirada.");
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .single();
  if (error) throw new Error(error.message);
  return data as Person;
}

export async function updateMyProfile(patch: Partial<Person>): Promise<Person> {
  if (IS_DEMO) return demoApi.updateMyProfile(patch);
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão expirada.");
  const allowed = {
    full_name: patch.full_name,
    phone: patch.phone,
    birth_date: patch.birth_date,
    notify_whatsapp: patch.notify_whatsapp,
    notify_sms: patch.notify_sms,
    avatar_color: patch.avatar_color,
    must_change_password: patch.must_change_password,
  };
  Object.keys(allowed).forEach((key) => {
    if (allowed[key as keyof typeof allowed] === undefined) {
      delete allowed[key as keyof typeof allowed];
    }
  });
  const { data, error } = await client
    .from("profiles")
    .update(allowed)
    .eq("id", auth.user.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Person;
}

export async function changePassword(newPassword: string): Promise<void> {
  if (IS_DEMO) {
    await demoApi.updateMyProfile({ must_change_password: false });
    return;
  }
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão expirada.");
  const { error: authError } = await client.auth.updateUser({ password: newPassword });
  if (authError) throw new Error(authError.message);
  const { error: profileError } = await client
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", auth.user.id);
  if (profileError) throw new Error(profileError.message);
  await client.from("password_change_log").insert({
    profile_id: auth.user.id,
    changed_by: auth.user.id,
    method: "self",
  });
}

/**
 * Gera um novo token do feed da agenda. O link antigo deixa de funcionar,
 * o que permite revogar o acesso caso ele tenha sido compartilhado.
 */
export async function regenerateCalendarToken(): Promise<string> {
  const token = crypto.randomUUID();
  if (IS_DEMO) {
    await demoApi.updateMyProfile({ calendar_token: token });
    return token;
  }
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão expirada.");
  const { data, error } = await client
    .from("profiles")
    .update({ calendar_token: token })
    .eq("id", auth.user.id)
    .select("calendar_token")
    .single();
  if (error) throw new Error(error.message);
  return (data as { calendar_token: string }).calendar_token;
}

/* ------------------------------------------------------------------ */
/* Pessoas                                                             */
/* ------------------------------------------------------------------ */
export async function listDirectory(): Promise<DirectoryPerson[]> {
  if (IS_DEMO) return demoApi.listDirectory();
  const client = requireSupabase();
  const { data, error } = await client
    .from("people_directory")
    .select("id, full_name, role, avatar_color")
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as DirectoryPerson[];
}

export async function listPeople(): Promise<Person[]> {
  if (IS_DEMO) return demoApi.listPeople();
  const client = requireSupabase();
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .order("role")
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Person[];
}

export async function createPerson(input: PersonInput): Promise<InviteResult> {
  if (IS_DEMO) return demoApi.createPerson(input);
  return invokeFunction<InviteResult>("admin", {
    action: "create-person",
    input: {
      ...input,
      phone: normalizePhoneBR(input.phone) ?? input.phone,
    },
  });
}

export async function resetPersonPassword(personId: string): Promise<string> {
  if (IS_DEMO) throw new Error("Indisponível na demonstração.");
  const data = await invokeFunction<{ provisionalPassword: string }>("admin", {
    action: "reset-password",
    personId,
  });
  return data.provisionalPassword;
}

export async function updatePerson(
  id: string,
  patch: Partial<Person>,
): Promise<Person> {
  if (IS_DEMO) return demoApi.updatePerson(id, patch);
  const client = requireSupabase();
  const { data, error } = await client
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Person;
}

export async function deactivatePerson(id: string): Promise<void> {
  if (IS_DEMO) return demoApi.deactivatePerson(id);
  const client = requireSupabase();
  const { error } = await client
    .from("profiles")
    .update({ active: false, role: "member" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Ministérios                                                         */
/* ------------------------------------------------------------------ */
export async function listMinistries(): Promise<Ministry[]> {
  if (IS_DEMO) return demoApi.listMinistries();
  const client = requireSupabase();
  const { data, error } = await client
    .from("ministries")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Ministry[];
}

export async function saveMinistry(
  input: MinistryInput,
  id?: string,
): Promise<Ministry> {
  if (IS_DEMO) return demoApi.saveMinistry(input, id);
  const client = requireSupabase();
  if (id) {
    const { data, error } = await client
      .from("ministries")
      .update({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color,
        leader_id: input.leader_id || null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as Ministry;
  }
  const { data, error } = await client
    .from("ministries")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      color: input.color,
      leader_id: input.leader_id || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Ministry;
}

export async function listMinistryMembers(): Promise<MinistryMember[]> {
  if (IS_DEMO) return demoApi.listMinistryMembers();
  const client = requireSupabase();
  const { data, error } = await client.from("ministry_members").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as MinistryMember[];
}

export async function deactivateMinistry(id: string): Promise<void> {
  if (IS_DEMO) return demoApi.deactivateMinistry(id);
  const client = requireSupabase();
  const { error } = await client
    .from("ministries")
    .update({ active: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addMinistryMember(
  ministryId: string,
  profileId: string,
  role: "leader" | "member" = "member",
): Promise<void> {
  if (IS_DEMO) return demoApi.addMinistryMember(ministryId, profileId, role);
  const client = requireSupabase();
  const { error } = await client.from("ministry_members").insert({
    ministry_id: ministryId,
    profile_id: profileId,
    role_in_ministry: role,
  });
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
}

export async function removeMinistryMember(
  ministryId: string,
  profileId: string,
): Promise<void> {
  if (IS_DEMO) return demoApi.removeMinistryMember(ministryId, profileId);
  const client = requireSupabase();
  const { error } = await client
    .from("ministry_members")
    .delete()
    .eq("ministry_id", ministryId)
    .eq("profile_id", profileId);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Agenda                                                              */
/* ------------------------------------------------------------------ */
export async function listEvents(range?: {
  from?: string;
  to?: string;
}): Promise<ChurchEvent[]> {
  if (IS_DEMO) return demoApi.listEvents(range);
  const client = requireSupabase();
  let query = client.from("events").select("*").order("event_date").order("start_time");
  if (range?.from) query = query.gte("event_date", range.from);
  if (range?.to) query = query.lte("event_date", range.to);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ChurchEvent[];
}

export async function saveEvent(input: EventInput, id?: string): Promise<ChurchEvent> {
  if (IS_DEMO) return demoApi.saveEvent(input, id);
  const client = requireSupabase();
  const payload = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    event_date: input.event_date,
    start_time: input.start_time,
    end_time: input.end_time || null,
    location: input.location?.trim() || null,
    kind: input.kind,
  };
  if (id) {
    const { data, error } = await client
      .from("events")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as ChurchEvent;
  }
  const { data, error } = await client
    .from("events")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ChurchEvent;
}

export async function deleteEvent(id: string): Promise<void> {
  if (IS_DEMO) return demoApi.deleteEvent(id);
  const client = requireSupabase();
  const { error } = await client.from("events").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Escalas                                                             */
/* ------------------------------------------------------------------ */
export async function listSchedules(): Promise<ScheduleWithRelations[]> {
  if (IS_DEMO) return demoApi.listSchedules();
  const client = requireSupabase();
  const { data, error } = await client
    .from("schedules")
    .select("*, event:events(*), ministry:ministries(*)")
    .order("event_date")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as ScheduleWithRelations[];
}

export async function createSchedule(input: {
  event_id: string;
  ministry_id: string;
  profile_id: string;
  note?: string;
}): Promise<Schedule> {
  if (IS_DEMO) return demoApi.createSchedule(input);
  const client = requireSupabase();
  const { data, error } = await client
    .from("schedules")
    .insert({
      event_id: input.event_id,
      ministry_id: input.ministry_id,
      profile_id: input.profile_id,
      note: input.note?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Schedule;
}

export async function deleteSchedule(id: string): Promise<void> {
  if (IS_DEMO) return demoApi.deleteSchedule(id);
  const client = requireSupabase();
  const { error } = await client.from("schedules").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function respondSchedule(
  id: string,
  status: ScheduleStatus,
): Promise<void> {
  if (IS_DEMO) return demoApi.respondSchedule(id, status);
  const client = requireSupabase();
  const { error } = await client.rpc("respond_schedule", {
    p_schedule: id,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}

export async function setScheduleStatus(
  id: string,
  status: ScheduleStatus,
): Promise<void> {
  if (IS_DEMO) return demoApi.respondSchedule(id, status);
  const client = requireSupabase();
  const { error } = await client
    .from("schedules")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function notifySchedules(eventId?: string): Promise<number> {
  if (IS_DEMO) {
    return demoApi.listSchedules().then((rows) =>
      rows.filter((r) => r.status === "pending" && (!eventId || r.event_id === eventId))
        .length,
    );
  }
  const data = await invokeFunction<{ sent: number }>("notify-schedules", {
    event_id: eventId || null,
    manual: true,
  });
  return data.sent ?? 0;
}

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */
export async function listChannels(): Promise<Channel[]> {
  if (IS_DEMO) return demoApi.listChannels();
  const client = requireSupabase();
  const { data: channels, error: channelError } = await client
    .from("chat_channels")
    .select("*")
    .order("kind", { ascending: true })
    .order("name");
  if (channelError) throw new Error(channelError.message);

  const { data: auth } = await client.auth.getUser();
  const uid = auth.user?.id;

  const { data: messages } = await client
    .from("messages")
    .select("id, channel_id, sender_id, body, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  const { data: reads } = await client
    .from("channel_reads")
    .select("*")
    .eq("profile_id", uid ?? "");

  return ((channels ?? []) as Channel[]).map((channel) => {
    const channelMessages = (messages ?? []).filter(
      (m) => m.channel_id === channel.id,
    );
    const last = (channelMessages[0] as Message | undefined) ?? null;
    const read = (reads ?? []).find((r) => r.channel_id === channel.id);
    const since = read?.last_read_at ?? "1970-01-01T00:00:00.000Z";
    const unread = channelMessages.filter(
      (m) => m.sender_id !== uid && m.created_at > since,
    ).length;
    return {
      ...channel,
      last_message: last,
      unread_count: unread,
    };
  });
}

export async function listMessages(channelId: string): Promise<Message[]> {
  if (IS_DEMO) return demoApi.listMessages(channelId);
  const client = requireSupabase();
  const { data, error } = await client
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function sendMessage(channelId: string, body: string): Promise<Message> {
  if (IS_DEMO) return demoApi.sendMessage(channelId, body);
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão expirada.");
  const { data, error } = await client
    .from("messages")
    .insert({
      channel_id: channelId,
      sender_id: auth.user.id,
      body: body.trim(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Message;
}

export async function markChannelRead(channelId: string): Promise<void> {
  if (IS_DEMO) return demoApi.markChannelRead(channelId);
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return;
  const { error } = await client.from("channel_reads").upsert(
    {
      channel_id: channelId,
      profile_id: auth.user.id,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "channel_id,profile_id" },
  );
  if (error) throw new Error(error.message);
}

export function subscribeToMessages(
  channelId: string,
  callback: (message: Message) => void,
): () => void {
  if (IS_DEMO || !supabase) return () => undefined;
  const channel = supabase
    .channel(`messages-${channelId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `channel_id=eq.${channelId}`,
      },
      (payload) => callback(payload.new as Message),
    )
    .subscribe();
  return () => {
    void supabase?.removeChannel(channel);
  };
}

export function subscribeToSchedules(callback: () => void): () => void {
  if (IS_DEMO || !supabase) return () => undefined;
  try {
    const channel = supabase
      .channel(`schedules-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedules" },
        () => callback(),
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  } catch (error) {
    console.error("subscribeToSchedules:", error);
    return () => undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Notificações                                                        */
/* ------------------------------------------------------------------ */
export async function listNotifications(): Promise<AppNotification[]> {
  if (IS_DEMO) return demoApi.listNotifications();
  const client = requireSupabase();
  const { data, error } = await client
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppNotification[];
}

export async function markNotificationsRead(): Promise<void> {
  if (IS_DEMO) return demoApi.markNotificationsRead();
  const client = requireSupabase();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return;
  const { error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", auth.user.id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

export async function markNotificationRead(id: string): Promise<void> {
  if (IS_DEMO) return demoApi.markNotificationRead(id);
  const client = requireSupabase();
  const { error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/* Demonstração                                                        */
/* ------------------------------------------------------------------ */
export async function demoSignIn(personaId = "p-ana"): Promise<void> {
  setDemoSession(personaId);
}

export function demoCurrentId(): string {
  return currentDemoPerson().id;
}

export async function listDemoPersonas(): Promise<DirectoryPerson[]> {
  return demoApi.listDemoPersonas();
}

export async function switchDemoPersona(id: string): Promise<void> {
  await demoApi.switchDemoUser(id);
}

export async function resetDemo(): Promise<void> {
  await demoApi.resetDemo();
}

export function roleLabel(role: Role): string {
  if (role === "leader") return "Líder";
  if (role === "pending") return "Aguardando";
  return "Membro";
}
