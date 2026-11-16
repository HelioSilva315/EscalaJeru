import { CHURCH_NAME } from "./config";
import { eventDateTime } from "./dates";
import type { ChurchEvent, Ministry, ScheduleWithRelations } from "./types";

function icsDate(iso: string, time: string): string {
  return `${iso.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function escapeICS(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 72) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join("\r\n");
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

function eventBlock(
  ev: ChurchEvent,
  lines: { team?: string; description?: string; uid?: string } = {},
): string[] {
  const endTime =
    ev.end_time ||
    (() => {
      const d = eventDateTime(ev.event_date, ev.start_time);
      d.setHours(d.getHours() + 2);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    })();

  const description = [ev.description, lines.description]
    .filter(Boolean)
    .join("\n\n");
  const team = lines.team ? `\n\nEquipe: ${lines.team}` : "";

  return [
    "BEGIN:VEVENT",
    fold(`UID:${lines.uid || `${ev.id}@escalajeru`}`),
    fold(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`),
    fold(`DTSTART;TZID=America/Sao_Paulo:${icsDate(ev.event_date, ev.start_time)}`),
    fold(`DTEND;TZID=America/Sao_Paulo:${icsDate(ev.event_date, endTime)}`),
    fold(`SUMMARY:${escapeICS(ev.title)}`),
    ...(description
      ? [fold(`DESCRIPTION:${escapeICS(description + team)}`)]
      : team
        ? [fold(`DESCRIPTION:${escapeICS(team.trim())}`)]
        : []),
    ...(ev.location ? [fold(`LOCATION:${escapeICS(ev.location)}`)] : []),
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT24H",
    "ACTION:DISPLAY",
    fold(`DESCRIPTION:${escapeICS(ev.title)}`),
    "END:VALARM",
    "END:VEVENT",
  ];
}

export function buildICS(
  events: ChurchEvent[],
  teamByEvent?: Map<string, string>,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EscalaJeru//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${CHURCH_NAME}`),
    "X-WR-TIMEZONE:America/Sao_Paulo",
    ...VTIMEZONE,
    ...events.flatMap((ev) =>
      eventBlock(ev, { team: teamByEvent?.get(ev.id) }),
    ),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export function teamByEventFromSchedules(
  schedules: ScheduleWithRelations[],
  ministries: Ministry[],
  peopleNames: Map<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const schedule of schedules) {
    const ministry =
      schedule.ministry ?? ministries.find((m) => m.id === schedule.ministry_id);
    const name = peopleNames.get(schedule.profile_id);
    if (!ministry || !name) continue;
    const current = map.get(schedule.event_id) || "";
    map.set(
      schedule.event_id,
      current ? `${current}; ${ministry.name}: ${name}` : `${ministry.name}: ${name}`,
    );
  }
  return map;
}

export function downloadTextFile(
  filename: string,
  content: string,
  type = "text/calendar;charset=utf-8",
) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function googleCalendarUrl(ev: ChurchEvent): string {
  const endTime =
    ev.end_time ||
    (() => {
      const d = eventDateTime(ev.event_date, ev.start_time);
      d.setHours(d.getHours() + 2);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    })();
  const start = `${icsDate(ev.event_date, ev.start_time)}`;
  const end = `${icsDate(ev.event_date, endTime)}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${start}/${end}`,
    details: ev.description || `Agenda ${CHURCH_NAME}`,
    location: ev.location || CHURCH_NAME,
    ctz: "America/Sao_Paulo",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function calendarFeedUrl(token: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!base || !token) return "";
  return `${base}/functions/v1/calendar?token=${encodeURIComponent(token)}`;
}
