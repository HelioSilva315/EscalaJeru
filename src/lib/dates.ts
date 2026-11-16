const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISO(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function startOfWeekISO(iso: string): string {
  const d = fromISO(iso);
  return addDaysISO(iso, -d.getDay());
}

export function startOfMonthISO(year: number, month: number): string {
  return toISO(new Date(year, month, 1));
}

export function endOfMonthISO(year: number, month: number): string {
  return toISO(new Date(year, month + 1, 0));
}

export interface CalendarCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

export function monthMatrix(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      iso: toISO(d),
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    });
  }
  return cells;
}

export function monthLabel(year: number, month: number): string {
  const label = `${MONTHS[month]} de ${year}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function monthName(month: number): string {
  return MONTHS[month] ?? "";
}

export function weekdayLong(iso: string): string {
  return WEEKDAYS[fromISO(iso).getDay()];
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT[fromISO(iso).getDay()];
}

export function weekdayInitial(iso: string): string {
  return WEEKDAYS_SHORT[fromISO(iso).getDay()].slice(0, 1).toUpperCase();
}

export function formatLongDate(iso: string): string {
  const d = fromISO(iso);
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function formatFullDate(iso: string): string {
  const d = fromISO(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function formatShortDate(iso: string): string {
  const d = fromISO(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function formatDateWithYear(iso: string): string {
  const d = fromISO(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function relativeDayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Hoje";
  if (iso === addDaysISO(today, 1)) return "Amanhã";
  if (iso === addDaysISO(today, -1)) return "Ontem";
  return `${weekdayShort(iso)}, ${formatShortDate(iso)}`;
}

export function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

export function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start) return "";
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
}

export function eventDateTime(iso: string, time: string): Date {
  const d = fromISO(iso);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export function isEventPast(dateISO: string, endTime?: string | null): boolean {
  const end = endTime || "23:59";
  return eventDateTime(dateISO, end).getTime() < Date.now();
}

export function formatRelativeTime(ts: string): string {
  const date = new Date(ts);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

export function formatClock(ts: string): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dayKey(ts: string): string {
  return toISO(new Date(ts));
}

export function friendlyDayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Hoje";
  if (iso === addDaysISO(today, -1)) return "Ontem";
  return `${weekdayLong(iso)}, ${formatLongDate(iso)}`;
}

export function nextWeekday(weekday: number, includeToday = false): string {
  const today = fromISO(todayISO());
  let diff = (weekday - today.getDay() + 7) % 7;
  if (diff === 0 && !includeToday) diff = 7;
  return addDaysISO(todayISO(), diff);
}

export function upcomingDates(weekday: number, count: number): string[] {
  const first = nextWeekday(weekday, true);
  return Array.from({ length: count }, (_, i) => addDaysISO(first, i * 7));
}

export function rangeForMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 41);
  return { from: toISO(start), to: toISO(end) };
}

export function diffDays(from: string, to: string): number {
  return Math.round(
    (fromISO(to).getTime() - fromISO(from).getTime()) / 86400000,
  );
}

export function ageFromBirthday(birth: string): number {
  const d = fromISO(birth);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const before =
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (before) age--;
  return age;
}

export function isBirthdayInMonth(birth: string | null, month: number): boolean {
  if (!birth) return false;
  return fromISO(birth).getMonth() === month;
}
