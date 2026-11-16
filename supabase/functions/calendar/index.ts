import { fail, preflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeICS(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

function stamp(iso: string, time: string): string {
  return `${iso.replace(/-/g, "")}T${time.slice(0, 5).replace(":", "")}00`;
}

function nowStamp(): string {
  return `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Sao_Paulo",
  "X-LIC-LOCATION:America/Sao_Paulo",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0300",
  "TZOFFSETTO:-0300",
  "TZNAME:BRT",
  "DTSTART:19700101T000000",
  "END:STANDARD",
  "END:VTIMEZONE",
];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") return fail("Método não permitido.", 405);

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!UUID.test(token)) {
    return fail("Link de agenda inválido.", 400);
  }

  const admin = serviceClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, active")
    .eq("calendar_token", token)
    .maybeSingle();

  if (!profile || !profile.active) {
    return fail("Link de agenda inválido ou desativado.", 404);
  }

  const today = new Date(Date.now() - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const from = addDaysISO(today, -90);
  const to = addDaysISO(today, 365);

  const { data: events, error: eventsError } = await admin
    .from("events")
    .select("*")
    .gte("event_date", from)
    .lte("event_date", to)
    .order("event_date")
    .order("start_time");

  if (eventsError) {
    console.error("calendar events:", eventsError);
    return fail("Não foi possível carregar a agenda.", 500);
  }

  const { data: schedules } = await admin
    .from("schedules")
    .select("event_id, status, ministry:ministries(name)")
    .eq("profile_id", profile.id)
    .neq("status", "declined");

  const mine = new Map<string, string[]>();
  for (const row of schedules ?? []) {
    const ministry = Array.isArray(row.ministry) ? row.ministry[0] : row.ministry;
    const list = mine.get(row.event_id as string) ?? [];
    list.push(ministry?.name ?? "Ministério");
    mine.set(row.event_id as string, list);
  }

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EscalaJeru//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:Igreja JERU — ${profile.full_name}`),
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "X-PUBLISHED-TTL:PT6H",
    ...VTIMEZONE,
  ];

  for (const event of events ?? []) {
    const mineHere = mine.get(event.id as string) ?? [];
    const endTime = (event.end_time as string | null) ?? null;
    const description: string[] = [];
    if (event.description) description.push(String(event.description));
    if (mineHere.length > 0) {
      description.push(`Você serve em: ${mineHere.join(", ")}`);
    }

    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:${event.id}@escalajeru`),
      `DTSTAMP:${nowStamp()}`,
      fold(`DTSTART;TZID=America/Sao_Paulo:${stamp(event.event_date, event.start_time)}`),
      endTime
        ? fold(`DTEND;TZID=America/Sao_Paulo:${stamp(event.event_date, endTime)}`)
        : "",
      fold(`SUMMARY:${escapeICS(String(event.title))}`),
      description.length > 0
        ? fold(`DESCRIPTION:${escapeICS(description.join("\n\n"))}`)
        : "",
      event.location ? fold(`LOCATION:${escapeICS(String(event.location))}`) : "",
      "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "TRIGGER:-PT24H",
      "ACTION:DISPLAY",
      fold(`DESCRIPTION:${escapeICS(String(event.title))}`),
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  const body = lines.filter((line) => line !== "").join("\r\n");

  return new Response(body, {
    status: 200,
    headers: {
      ...preflightHeaders(),
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="escalajeru.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
});

function preflightHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
    Vary: "Origin",
  };
}
