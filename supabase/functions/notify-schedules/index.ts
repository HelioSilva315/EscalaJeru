import { fail, json, preflight } from "../_shared/cors.ts";
import {
  HttpError,
  requireLeader,
  serviceClient,
} from "../_shared/supabase.ts";
import { sendReminder } from "../_shared/messaging.ts";

// Fuso fixo do Brasil (sem horário de verão desde 2019).
function eventDate(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 8)}-03:00`);
}

function todayISO(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function humanDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00-03:00`);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function humanTime(time: string): string {
  return time.slice(0, 5).replace(":", "h");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return fail("Método não permitido.", 405);

  try {
    const body = await request.json().catch(() => ({}));
    const eventId = body.event_id ? String(body.event_id) : null;
    const manual = Boolean(body.manual);

    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const provided = request.headers.get("x-cron-secret") ?? "";
    const isCron = Boolean(cronSecret) && provided === cronSecret;

    if (!isCron) {
      await requireLeader(request.headers.get("Authorization"));
    }

    const admin = serviceClient();
    const now = new Date();
    const today = todayISO();

    let query = admin
      .from("schedules")
      .select(
        "id, profile_id, status, note, event_date, " +
          "event:events(id, title, event_date, start_time, end_time, location), " +
          "ministry:ministries(name)",
      )
      .neq("status", "declined")
      .is("notified_at", null)
      .gte("event_date", today)
      .lte("event_date", addDaysISO(today, manual ? 30 : 2));

    if (eventId) query = query.eq("event_id", eventId);

    const { data: rows, error } = await query;
    if (error) {
      console.error("notify-schedules query:", error);
      return fail("Não foi possível carregar as escalas.", 500);
    }

    const cutoff = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    const candidates = (rows ?? []).filter((row) => {
      const event = Array.isArray(row.event) ? row.event[0] : row.event;
      if (!event?.event_date || !event?.start_time) return false;
      const startsAt = eventDate(event.event_date, event.start_time);
      if (startsAt.getTime() < now.getTime()) return false;
      if (manual) return true;
      return startsAt.getTime() <= cutoff.getTime();
    });

    if (candidates.length === 0) {
      return json({ sent: 0, candidates: 0, skipped: 0, failed: 0 });
    }

    const profileIds = Array.from(
      new Set(candidates.map((row) => row.profile_id as string)),
    );
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, phone, active, notify_whatsapp, notify_sms")
      .in("id", profileIds);

    const profileMap = new Map(
      (profiles ?? []).map((profile) => [profile.id as string, profile]),
    );

    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/+$/, "");
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of candidates) {
      const profile = profileMap.get(row.profile_id as string);
      if (!profile || !profile.active || !profile.phone) {
        skipped += 1;
        continue;
      }

      const event = Array.isArray(row.event) ? row.event[0] : row.event;
      const ministry = Array.isArray(row.ministry)
        ? row.ministry[0]
        : row.ministry;
      const firstName = String(profile.full_name).split(" ")[0];

      const lines = [
        `Olá, ${firstName}! Lembrete da escala na Igreja JERU.`,
        "",
        `${event.title} — ${humanDate(event.event_date)} às ${humanTime(event.start_time)}`,
        `Ministério: ${ministry?.name ?? "Ministério"}`,
      ];
      if (event.location) lines.push(`Local: ${event.location}`);
      if (row.note) lines.push(`Observação: ${row.note}`);
      lines.push("");
      lines.push(
        appUrl
          ? `Confirme sua presença: ${appUrl}/escalas`
          : "Abra o EscalaJeru para confirmar sua presença.",
      );

      const text = lines.join("\n");

      await admin.from("notifications").insert({
        profile_id: profile.id,
        title: `Lembrete: ${ministry?.name ?? "escala"}`,
        body: `${event.title} · ${humanDate(event.event_date)} às ${humanTime(event.start_time)}`,
        link: "/escalas",
      });

      const result = await sendReminder(profile.phone, text, {
        whatsapp: Boolean(profile.notify_whatsapp),
        sms: Boolean(profile.notify_sms),
      });

      await admin.from("notification_log").insert({
        profile_id: profile.id,
        schedule_id: row.id,
        channel: result.ok
          ? result.provider.startsWith("whatsapp") || result.provider === "zapi"
            ? "whatsapp"
            : "sms"
          : "app",
        provider: result.provider,
        status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
        detail: result.detail ?? null,
      });

      if (result.ok || result.skipped) {
        await admin
          .from("schedules")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", row.id);
      }

      if (result.ok) sent += 1;
      else if (result.skipped) skipped += 1;
      else failed += 1;
    }

    return json({
      sent,
      skipped,
      failed,
      candidates: candidates.length,
    });
  } catch (error) {
    if (error instanceof HttpError) return fail(error.message, error.status);
    console.error("notify-schedules:", error);
    return fail("Não foi possível enviar os lembretes.", 500);
  }
});
