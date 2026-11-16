import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  ConfirmDialog,
  EmptyState,
  Field,
  FormError,
  LoadingBlock,
  Modal,
  PageHeader,
  StatusBadge,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import {
  deleteEvent,
  friendlyError,
  listEvents,
  listSchedules,
  saveEvent,
} from "@/lib/api";
import {
  formatLongDate,
  formatTime,
  fromISO,
  monthLabel,
  monthMatrix,
  monthName,
  rangeForMonth,
  todayISO,
  weekdayLong,
} from "@/lib/dates";
import {
  buildICS,
  downloadTextFile,
  googleCalendarUrl,
  teamByEventFromSchedules,
} from "@/lib/ics";
import type {
  ChurchEvent,
  EventInput,
  EventKind,
  ScheduleWithRelations,
} from "@/lib/types";
import { hasErrors, validateEvent, type Errors } from "@/lib/validation";

const KIND_LABEL: Record<EventKind, string> = {
  culto: "Culto",
  ensaio: "Ensaio",
  reuniao: "Reunião",
  evento: "Evento",
  especial: "Especial",
};

const KIND_COLOR: Record<EventKind, string> = {
  culto: "#2c5a4b",
  ensaio: "#b96f4e",
  reuniao: "#4c6d88",
  evento: "#77556f",
  especial: "#9b7a3f",
};

function emptyEvent(date: string): EventInput {
  return {
    title: "",
    description: "",
    event_date: date,
    start_time: "18:30",
    end_time: "20:30",
    location: "Templo principal",
    kind: "culto",
  };
}

export default function Agenda() {
  const { isLeader } = useAuth();
  const { directory, ministries, personById } = useAppData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [schedules, setSchedules] = useState<ScheduleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  const initial = searchParams.get("date") || todayISO();
  const initialDate = fromISO(initial);
  const [selected, setSelected] = useState(initial);
  const [view, setView] = useState({
    year: initialDate.getFullYear(),
    month: initialDate.getMonth(),
  });

  const [detail, setDetail] = useState<ChurchEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ChurchEvent | null>(null);
  const [form, setForm] = useState<EventInput>(emptyEvent(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const [eventRows, scheduleRows] = await Promise.all([
        listEvents(),
        listSchedules(),
      ]);
      setEvents(eventRows);
      setSchedules(scheduleRows);
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const param = searchParams.get("date");
    if (param) {
      setSelected(param);
      const d = fromISO(param);
      setView({ year: d.getFullYear(), month: d.getMonth() });
    }
  }, [searchParams]);

  const cells = useMemo(
    () => monthMatrix(view.year, view.month),
    [view.year, view.month],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ChurchEvent[]>();
    for (const event of events) {
      const list = map.get(event.event_date) ?? [];
      list.push(event);
      map.set(event.event_date, list);
    }
    return map;
  }, [events]);

  const selectedEvents = useMemo(
    () =>
      (eventsByDate.get(selected) ?? [])
        .slice()
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [eventsByDate, selected],
  );

  const detailSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.event_id === detail?.id),
    [schedules, detail],
  );

  const detailTeams = useMemo(() => {
    const map = new Map<
      string,
      { ministryId: string; color: string; name: string; people: ScheduleWithRelations[] }
    >();
    for (const schedule of detailSchedules) {
      const key = schedule.ministry_id;
      const ministry =
        schedule.ministry ?? ministries.find((item) => item.id === key);
      const entry = map.get(key) ?? {
        ministryId: key,
        color: ministry?.color ?? "var(--pine)",
        name: ministry?.name ?? "Ministério",
        people: [],
      };
      entry.people.push(schedule);
      map.set(key, entry);
    }
    return Array.from(map.values());
  }, [detailSchedules, ministries]);

  function chooseDay(iso: string) {
    setSelected(iso);
    const d = fromISO(iso);
    if (d.getMonth() !== view.month || d.getFullYear() !== view.year) {
      setView({ year: d.getFullYear(), month: d.getMonth() });
    }
    setSearchParams({ date: iso }, { replace: true });
  }

  function shiftMonth(delta: number) {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    setSelected(iso);
    setSearchParams({ date: iso }, { replace: true });
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyEvent(selected));
    setErrors({});
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(event: ChurchEvent) {
    setDetail(null);
    setEditing(event);
    setForm({
      title: event.title,
      description: event.description ?? "",
      event_date: event.event_date,
      start_time: event.start_time.slice(0, 5),
      end_time: event.end_time?.slice(0, 5) ?? "",
      location: event.location ?? "",
      kind: event.kind,
    });
    setErrors({});
    setFormError("");
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateEvent(form);
    setErrors(validation);
    if (hasErrors(validation)) return;
    setSaving(true);
    setFormError("");
    try {
      await saveEvent(
        {
          ...form,
          title: form.title.trim(),
          description: form.description?.trim(),
          location: form.location?.trim(),
          end_time: form.end_time || undefined,
        },
        editing?.id,
      );
      toast(editing ? "Encontro atualizado" : "Encontro criado", "success");
      setFormOpen(false);
      setEditing(null);
      setSelected(form.event_date);
      await load();
    } catch (error) {
      setFormError(friendlyError(error));
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent() {
    if (!editing) return;
    setDeleting(true);
    try {
      await deleteEvent(editing.id);
      toast("Encontro excluído");
      setConfirmDelete(false);
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setDeleting(false);
    }
  }

  function downloadSingle(event: ChurchEvent) {
    const names = new Map(directory.map((person) => [person.id, person.full_name]));
    const team = teamByEventFromSchedules(schedules, ministries, names);
    const content = buildICS([event], team);
    downloadTextFile(`escalajeru-${event.event_date}.ics`, content);
  }

  function downloadMonth() {
    const { from, to } = rangeForMonth(view.year, view.month);
    const monthEvents = events.filter(
      (event) => event.event_date >= from && event.event_date <= to,
    );
    if (monthEvents.length === 0) {
      toast("Nenhum encontro neste mês para exportar.");
      return;
    }
    const names = new Map(directory.map((person) => [person.id, person.full_name]));
    const team = teamByEventFromSchedules(schedules, ministries, names);
    downloadTextFile(
      `escalajeru-${view.year}-${String(view.month + 1).padStart(2, "0")}.ics`,
      buildICS(monthEvents, team),
    );
  }

  if (loading) {
    return (
      <div>
        <PageHeader eyebrow="Agenda" title="Calendário da igreja" />
        <LoadingBlock label="Carregando a agenda" />
      </div>
    );
  }

  const selectedDate = fromISO(selected);

  return (
    <div>
      <PageHeader
        eyebrow="Agenda"
        title="Calendário da igreja"
        subtitle="Cultos, ensaios e encontros. Toque em um dia para ver a equipe escalada."
        actions={
          <>
            <button className="btn btn-secondary" onClick={downloadMonth}>
              <Icon name="download" />
              <span className="optional-label">Exportar .ics</span>
            </button>
            {isLeader && (
              <button className="btn btn-primary" onClick={openCreate}>
                <Icon name="plus" />
                Novo encontro
              </button>
            )}
          </>
        }
      />

      <div className="agenda-grid stagger">
        <section className="card calendar-card" aria-label="Calendário mensal">
          <div className="cal-toolbar">
            <div>
              <div className="cal-month">{monthLabel(view.year, view.month)}</div>
            </div>
            <div className="cal-nav">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Mês anterior"
              >
                <Icon name="chevronLeft" />
              </button>
              <button
                type="button"
                onClick={() => chooseDay(todayISO())}
                aria-label="Ir para hoje"
                style={{ width: "auto", padding: "0 9px", fontSize: 10.5, fontWeight: 650 }}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Próximo mês"
              >
                <Icon name="chevronRight" />
              </button>
            </div>
          </div>

          <div className="cal-weekdays" aria-hidden="true">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
              <div className="cal-weekday" key={day}>
                {day}
              </div>
            ))}
          </div>

          <div className="cal-days">
            {cells.map((cell) => {
              const dayEvents = eventsByDate.get(cell.iso) ?? [];
              const isToday = cell.iso === todayISO();
              const isSelected = cell.iso === selected;
              return (
                <button
                  type="button"
                  key={cell.iso}
                  className={`cal-day ${cell.inMonth ? "" : "other"} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() => chooseDay(cell.iso)}
                  aria-label={`${weekdayLong(cell.iso)}, ${formatLongDate(cell.iso)}${dayEvents.length ? `, ${dayEvents.length} encontros` : ""}`}
                  aria-pressed={isSelected}
                >
                  <span className="cal-num">{cell.day}</span>
                  <span className="cal-marks">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        key={event.id}
                        className="cal-mark"
                        style={{ background: KIND_COLOR[event.kind] }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="row wrap"
            style={{ gap: 12, padding: "12px 2px 4px", borderTop: "1px solid var(--line)" }}
          >
            {(Object.keys(KIND_LABEL) as EventKind[]).map((kind) => (
              <span key={kind} className="row" style={{ gap: 5 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: KIND_COLOR[kind],
                  }}
                />
                <span className="tiny muted">{KIND_LABEL[kind]}</span>
              </span>
            ))}
          </div>
        </section>

        <aside className="stack-20">
          <section className="card day-card" aria-label="Encontros do dia">
            <div className="day-date">
              <span className="day-num">{selectedDate.getDate()}</span>
              <div>
                <div className="day-week">{weekdayLong(selected)}</div>
                <div className="day-month">
                  {monthName(selectedDate.getMonth())} de {selectedDate.getFullYear()}
                </div>
              </div>
            </div>
            <div className="day-list">
              {selectedEvents.length === 0 ? (
                <EmptyState
                  icon="calendar"
                  title="Dia livre"
                  text={
                    isLeader
                      ? "Nenhum encontro neste dia. Você pode criar um agora."
                      : "Nenhum encontro marcado para este dia."
                  }
                  action={
                    isLeader ? (
                      <button className="btn btn-secondary btn-sm" onClick={openCreate}>
                        <Icon name="plus" />
                        Criar encontro
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                selectedEvents.map((event) => {
                  const teams = schedules.filter(
                    (schedule) => schedule.event_id === event.id,
                  );
                  const ministryCount = new Set(
                    teams.map((schedule) => schedule.ministry_id),
                  ).size;
                  return (
                    <button
                      type="button"
                      key={event.id}
                      className="event-row"
                      onClick={() => setDetail(event)}
                    >
                      <div className="event-time">
                        {event.start_time.slice(0, 5)}
                        <span>{event.end_time?.slice(0, 5) ?? ""}</span>
                      </div>
                      <span
                        className="event-bar"
                        style={{ background: KIND_COLOR[event.kind] }}
                      />
                      <div className="event-main">
                        <div className="event-title">{event.title}</div>
                        <div className="event-meta">
                          <span>
                            <Icon name="pin" />
                            {event.location || "Local a definir"}
                          </span>
                          <span>{KIND_LABEL[event.kind]}</span>
                        </div>
                        {teams.length > 0 && (
                          <div className="event-team">
                            {Array.from(
                              new Map(
                                teams.map((schedule) => [
                                  schedule.profile_id,
                                  schedule,
                                ]),
                              ).values(),
                            )
                              .slice(0, 4)
                              .map((schedule) => {
                                const person = personById(schedule.profile_id);
                                return (
                                  <span className="chip" key={schedule.profile_id}>
                                    <span
                                      className="chip-dot"
                                      style={{ background: person?.avatar_color }}
                                    />
                                    {person?.full_name.split(" ")[0] ?? "Pessoa"}
                                  </span>
                                );
                              })}
                            <span className="chip" style={{ color: "var(--faint)" }}>
                              {ministryCount}{" "}
                              {ministryCount === 1 ? "ministério" : "ministérios"}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="event-chevron">
                        <Icon name="chevronRight" />
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title card-title-sm">Leve a agenda com você</h2>
                <p className="card-sub">Google Agenda, Apple Calendar e Outlook</p>
              </div>
            </div>
            <p className="tiny muted" style={{ lineHeight: 1.55 }}>
              Assine o calendário uma única vez e receba todos os encontros e
              escalas direto no seu celular, com lembrete de 24 horas.
            </p>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => navigate("/ajustes")}
            >
              <Icon name="link" />
              Pegar link da agenda
            </button>
          </section>

          {selectedEvents.length > 0 && (
            <section className="card card-pad-sm">
              <div className="row-between">
                <span className="tiny muted">
                  {selectedEvents.length}{" "}
                  {selectedEvents.length === 1 ? "encontro" : "encontros"} neste dia
                </span>
                <button
                  className="card-link"
                  onClick={() => downloadSingle(selectedEvents[0])}
                >
                  Baixar .ics <Icon name="download" />
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.title}
        subtitle={
          detail
            ? `${weekdayLong(detail.event_date)}, ${formatLongDate(detail.event_date)} · ${formatTime(detail.start_time)}`
            : undefined
        }
        wide
        footer={
          detail ? (
            <>
              {isLeader && (
                <button
                  className="btn btn-ghost"
                  onClick={() => openEdit(detail)}
                >
                  <Icon name="edit" />
                  Editar
                </button>
              )}
              <a
                className="btn btn-secondary"
                href={googleCalendarUrl(detail)}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="calendar" />
                Google Agenda
              </a>
              <button
                className="btn btn-primary"
                onClick={() => downloadSingle(detail)}
              >
                <Icon name="download" />
                Baixar .ics
              </button>
            </>
          ) : undefined
        }
      >
        {detail && (
          <>
            <div className="row wrap" style={{ gap: 7, marginBottom: 14 }}>
              <span
                className="badge"
                style={{
                  background: `color-mix(in srgb, ${KIND_COLOR[detail.kind]} 14%, var(--surface))`,
                  color: KIND_COLOR[detail.kind],
                }}
              >
                {KIND_LABEL[detail.kind]}
              </span>
              <span className="badge badge-neutral">
                <Icon name="clock" />
                {formatTime(detail.start_time)}
                {detail.end_time ? ` – ${formatTime(detail.end_time)}` : ""}
              </span>
              {detail.location && (
                <span className="badge badge-neutral">
                  <Icon name="pin" />
                  {detail.location}
                </span>
              )}
            </div>

            {detail.description && (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--ink-2)",
                  lineHeight: 1.6,
                  marginBottom: 8,
                }}
              >
                {detail.description}
              </p>
            )}

            <div className="form-section">
              <div className="row-between" style={{ marginBottom: 10 }}>
                <h3 className="form-section-title">Equipe escalada</h3>
                {isLeader && (
                  <button
                    className="card-link"
                    onClick={() =>
                      navigate(`/escalas?event=${detail.id}&nova=1`)
                    }
                  >
                    <Icon name="plus" />
                    Escalar
                  </button>
                )}
              </div>

              {detailTeams.length === 0 ? (
                <div className="empty" style={{ padding: "24px 10px" }}>
                  <div className="empty-icon">
                    <Icon name="scales" />
                  </div>
                  <div className="empty-title">Escala ainda não montada</div>
                  <p className="empty-text">
                    {isLeader
                      ? "Convide as pessoas e distribua os ministérios deste encontro."
                      : "A liderança ainda está organizando a equipe deste encontro."}
                  </p>
                  {isLeader && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        navigate(`/escalas?event=${detail.id}&nova=1`)
                      }
                    >
                      <Icon name="plus" />
                      Montar escala
                    </button>
                  )}
                </div>
              ) : (
                detailTeams.map((team) => (
                  <div className="team-block" key={team.ministryId}>
                    <div className="team-block-head">
                      <span
                        className="team-block-dot"
                        style={{ background: team.color }}
                      />
                      <span className="team-block-name">{team.name}</span>
                    </div>
                    <div className="team-people">
                      {team.people.map((schedule) => {
                        const person = personById(schedule.profile_id);
                        return (
                          <span
                            className={`person-chip ${schedule.status}`}
                            key={schedule.id}
                            title={person?.full_name}
                          >
                            <Avatar
                              name={person?.full_name ?? "?"}
                              color={person?.avatar_color}
                            />
                            {person?.full_name.split(" ")[0] ?? "Pessoa"}
                            <span className="status" />
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {detailTeams.length > 0 && (
              <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
                {(["pending", "confirmed", "declined"] as const).map((status) => {
                  const count = detailSchedules.filter(
                    (schedule) => schedule.status === status,
                  ).length;
                  if (count === 0) return null;
                  return (
                    <span key={status} className="row" style={{ gap: 6 }}>
                      <StatusBadge status={status} />
                      <span className="tiny faint">{count}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Editar encontro" : "Novo encontro"}
        subtitle={
          editing
            ? "Alterações na data também atualizam a escala."
            : "Agende um culto, ensaio ou reunião."
        }
        wide
        footer={
          <>
            {editing && (
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{ marginRight: "auto" }}
              >
                <Icon name="trash" />
                Excluir
              </button>
            )}
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setFormOpen(false)}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              form="event-form"
              disabled={saving}
            >
              {saving ? <span className="spinner" /> : editing ? "Salvar" : "Criar encontro"}
            </button>
          </>
        }
      >
        <form id="event-form" onSubmit={submit} noValidate>
          <Field label="Nome do encontro" error={errors.title} htmlFor="ev-title">
            <input
              id="ev-title"
              className="input"
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
              placeholder="Ex.: Culto da Família"
              data-autofocus
            />
          </Field>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <Field label="Tipo" htmlFor="ev-kind">
              <select
                id="ev-kind"
                className="select"
                value={form.kind}
                onChange={(event) =>
                  setForm({ ...form, kind: event.target.value as EventKind })
                }
              >
                {(Object.keys(KIND_LABEL) as EventKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABEL[kind]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Data" error={errors.event_date} htmlFor="ev-date">
              <input
                id="ev-date"
                className="input"
                type="date"
                value={form.event_date}
                onChange={(event) =>
                  setForm({ ...form, event_date: event.target.value })
                }
              />
            </Field>
            <Field label="Início" error={errors.start_time} htmlFor="ev-start">
              <input
                id="ev-start"
                className="input"
                type="time"
                value={form.start_time}
                onChange={(event) =>
                  setForm({ ...form, start_time: event.target.value })
                }
              />
            </Field>
            <Field label="Término" error={errors.end_time} htmlFor="ev-end">
              <input
                id="ev-end"
                className="input"
                type="time"
                value={form.end_time}
                onChange={(event) =>
                  setForm({ ...form, end_time: event.target.value })
                }
              />
            </Field>
          </div>

          <Field
            label="Local"
            error={errors.location}
            htmlFor="ev-location"
            className="mt-16"
          >
            <input
              id="ev-location"
              className="input"
              value={form.location}
              onChange={(event) =>
                setForm({ ...form, location: event.target.value })
              }
              placeholder="Ex.: Templo principal"
            />
          </Field>

          <Field
            label="Observações"
            hint="Opcional"
            error={errors.description}
            htmlFor="ev-desc"
            className="mt-16"
          >
            <textarea
              id="ev-desc"
              className="textarea"
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              placeholder="Informações úteis para a equipe"
              rows={3}
            />
          </Field>

          {formError && <FormError message={formError} />}
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir encontro"
        text="O encontro e todas as escalas ligadas a ele serão removidos. Essa ação não pode ser desfeita."
        confirmLabel="Excluir encontro"
        tone="danger"
        loading={deleting}
        onConfirm={() => void removeEvent()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
