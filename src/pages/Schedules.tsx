import { useCallback, useEffect, useMemo, useState } from "react";
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
  Segmented,
  StatusBadge,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import {
  createSchedule,
  deleteSchedule,
  friendlyError,
  listEvents,
  listSchedules,
  notifySchedules,
  replaceSchedulePerson,
  respondSchedule,
  setScheduleStatus,
  subscribeToSchedules,
} from "@/lib/api";
import {
  formatFullDate,
  formatLongDate,
  formatTime,
  isEventPast,
} from "@/lib/dates";
import type {
  ChurchEvent,
  ScheduleStatus,
  ScheduleWithRelations,
} from "@/lib/types";

type Period = "upcoming" | "past" | "all";

export default function Schedules() {
  const { user, isLeader } = useAuth();
  const { directory, ministries, ministryMembers, personById } = useAppData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [schedules, setSchedules] = useState<ScheduleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("upcoming");
  const [ministryFilter, setMinistryFilter] = useState("");

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEventId, setAssignEventId] = useState("");
  const [assignMinistryId, setAssignMinistryId] = useState("");
  const [assignPersonId, setAssignPersonId] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [assignSearch, setAssignSearch] = useState("");
  const [assignError, setAssignError] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [detail, setDetail] = useState<ScheduleWithRelations | null>(null);
  const [acting, setActing] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<ScheduleWithRelations | null>(null);
  const [removing, setRemoving] = useState(false);
  const [replaceId, setReplaceId] = useState("");
  const [replacing, setReplacing] = useState(false);

  const [notifying, setNotifying] = useState<string | null>(null);

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
    return subscribeToSchedules(() => {
      void load();
    });
  }, [load]);

  const openAssign = useCallback(
    (eventId?: string, ministryId?: string) => {
      const future = events
        .filter((event) => !isEventPast(event.event_date, event.end_time))
        .sort((a, b) =>
          `${a.event_date}T${a.start_time}`.localeCompare(
            `${b.event_date}T${b.start_time}`,
          ),
        );
      const nextId = eventId || future[0]?.id || events[0]?.id || "";
      setAssignEventId(nextId);
      setAssignMinistryId(ministryId || "");
      setAssignPersonId("");
      setAssignNote("");
      setAssignSearch("");
      setAssignError("");
      setAssignOpen(true);
    },
    [events],
  );

  useEffect(() => {
    if (loading) return;
    if (searchParams.get("nova") === "1" && isLeader) {
      openAssign(searchParams.get("event") || undefined);
      setSearchParams({}, { replace: true });
    }
  }, [loading, searchParams, isLeader, openAssign, setSearchParams]);

  const selectedEvent = events.find((event) => event.id === assignEventId);

  useEffect(() => {
    setReplaceId("");
  }, [detail]);

  const dayConflicts = useMemo(() => {
    if (!selectedEvent) return new Map<string, ScheduleWithRelations>();
    const map = new Map<string, ScheduleWithRelations>();
    for (const schedule of schedules) {
      if (
        schedule.event_date === selectedEvent.event_date &&
        schedule.status !== "declined"
      ) {
        map.set(schedule.profile_id, schedule);
      }
    }
    return map;
  }, [schedules, selectedEvent]);

  const alreadyInTeam = useMemo(() => {
    return new Set(
      schedules
        .filter(
          (schedule) =>
            schedule.event_id === assignEventId &&
            schedule.ministry_id === assignMinistryId,
        )
        .map((schedule) => schedule.profile_id),
    );
  }, [schedules, assignEventId, assignMinistryId]);

  const assignSelectedTeam = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          schedule.event_id === assignEventId &&
          schedule.ministry_id === assignMinistryId,
      ),
    [schedules, assignEventId, assignMinistryId],
  );

  const ministryMemberIds = useMemo(
    () =>
      new Set(
        ministryMembers
          .filter((member) => member.ministry_id === assignMinistryId)
          .map((member) => member.profile_id),
      ),
    [ministryMembers, assignMinistryId],
  );

  const pickerPeople = useMemo(() => {
    const term = assignSearch.trim().toLowerCase();
    return directory
      .filter((person) => person.full_name.toLowerCase().includes(term))
      .slice()
      .sort((a, b) => {
        const aMember = ministryMemberIds.has(a.id) ? 0 : 1;
        const bMember = ministryMemberIds.has(b.id) ? 0 : 1;
        if (aMember !== bMember) return aMember - bMember;
        return a.full_name.localeCompare(b.full_name, "pt-BR");
      });
  }, [directory, assignSearch, ministryMemberIds]);

  const assignPerson = directory.find((person) => person.id === assignPersonId);
  const assignConflict = assignPersonId ? dayConflicts.get(assignPersonId) : undefined;
  const assignBlocked =
    Boolean(assignPersonId) &&
    (Boolean(assignConflict) || alreadyInTeam.has(assignPersonId));

  async function submitAssign() {
    setAssignError("");
    if (!assignEventId || !assignMinistryId) {
      setAssignError("Escolha o encontro e o ministério.");
      return;
    }
    if (!assignPersonId) {
      setAssignError("Escolha quem vai servir.");
      return;
    }
    if (assignBlocked) {
      setAssignError(
        assignConflict
          ? "Esta pessoa já está escalada em outro ministério neste dia."
          : "Esta pessoa já está nesta equipe.",
      );
      return;
    }
    setAssigning(true);
    try {
      await createSchedule({
        event_id: assignEventId,
        ministry_id: assignMinistryId,
        profile_id: assignPersonId,
        note: assignNote,
      });
      toast("Pessoa adicionada à escala", "success");
      setAssignPersonId("");
      setAssignNote("");
      await load();
    } catch (error) {
      setAssignError(friendlyError(error));
    } finally {
      setAssigning(false);
    }
  }

  async function changeStatus(schedule: ScheduleWithRelations, status: ScheduleStatus) {
    setActing(true);
    try {
      if (schedule.profile_id === user?.id) {
        await respondSchedule(schedule.id, status);
      } else {
        await setScheduleStatus(schedule.id, status);
      }
      toast(
        status === "confirmed"
          ? "Presença confirmada"
          : status === "declined"
            ? "Ausência registrada"
            : "Status atualizado",
        "success",
      );
      setDetail(null);
      await load();
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setActing(false);
    }
  }

  async function replaceMember() {
    if (!detail || !replaceId) return;
    setReplacing(true);
    try {
      await replaceSchedulePerson(detail.id, replaceId);
      toast("Membro substituído na escala.", "success");
      setDetail(null);
      setReplaceId("");
      await load();
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setReplacing(false);
    }
  }

  async function removeSchedule() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await deleteSchedule(removeTarget.id);
      toast("Pessoa removida da escala");
      setRemoveTarget(null);
      setDetail(null);
      await load();
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setRemoving(false);
    }
  }

  async function sendReminders(event: ChurchEvent) {
    setNotifying(event.id);
    try {
      const count = await notifySchedules(event.id);
      toast(
        count > 0
          ? `${count} ${count === 1 ? "lembrete preparado" : "lembretes preparados"} para envio`
          : "Nenhum lembrete pendente para este encontro",
        "success",
      );
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setNotifying(null);
    }
  }

  const filteredEvents = useMemo(() => {
    const base = events.filter((event) => {
      const past = isEventPast(event.event_date, event.end_time);
      if (period === "upcoming") return !past;
      if (period === "past") return past;
      return true;
    });
    const sorted = base.slice().sort((a, b) => {
      const keyA = `${a.event_date}T${a.start_time}`;
      const keyB = `${b.event_date}T${b.start_time}`;
      return period === "past" ? keyB.localeCompare(keyA) : keyA.localeCompare(keyB);
    });
    if (!ministryFilter) return sorted;
    return sorted.filter((event) =>
      schedules.some(
        (schedule) =>
          schedule.event_id === event.id && schedule.ministry_id === ministryFilter,
      ),
    );
  }, [events, schedules, period, ministryFilter]);

  const groupsFor = useCallback(
    (event: ChurchEvent) => {
      const map = new Map<
        string,
        {
          ministryId: string;
          name: string;
          color: string;
          people: ScheduleWithRelations[];
        }
      >();
      for (const schedule of schedules) {
        if (schedule.event_id !== event.id) continue;
        if (ministryFilter && schedule.ministry_id !== ministryFilter) continue;
        const ministry =
          schedule.ministry ??
          ministries.find((item) => item.id === schedule.ministry_id);
        const entry = map.get(schedule.ministry_id) ?? {
          ministryId: schedule.ministry_id,
          name: ministry?.name ?? "Ministério",
          color: ministry?.color ?? "#2c5a4b",
          people: [],
        };
        entry.people.push(schedule);
        map.set(schedule.ministry_id, entry);
      }
      return Array.from(map.values()).sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR"),
      );
    },
    [schedules, ministries, ministryFilter],
  );

  if (loading) {
    return (
      <div>
        <PageHeader eyebrow="Escalas" title="Quem serve em cada encontro" />
        <LoadingBlock label="Carregando escalas" />
      </div>
    );
  }

  const upcomingEvents = events.filter(
    (event) => !isEventPast(event.event_date, event.end_time),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Escalas"
        title="Quem serve em cada encontro"
        subtitle="Cada pessoa serve em um único ministério por dia. A liderança monta e acompanha as confirmações."
        actions={
          isLeader ? (
            <button
              className="btn btn-primary"
              onClick={() => openAssign()}
              disabled={upcomingEvents.length === 0}
            >
              <Icon name="plus" />
              Nova escala
            </button>
          ) : undefined
        }
      />

      <div className="filters-bar">
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          ariaLabel="Período das escalas"
          options={[
            { value: "upcoming", label: "Próximas" },
            { value: "past", label: "Anteriores" },
            { value: "all", label: "Todas" },
          ]}
        />
        <select
          className="select"
          value={ministryFilter}
          onChange={(event) => setMinistryFilter(event.target.value)}
          aria-label="Filtrar por ministério"
        >
          <option value="">Todos os ministérios</option>
          {ministries.map((ministry) => (
            <option key={ministry.id} value={ministry.id}>
              {ministry.name}
            </option>
          ))}
        </select>
        <span className="tiny faint" style={{ marginLeft: "auto" }}>
          {filteredEvents.length}{" "}
          {filteredEvents.length === 1 ? "encontro" : "encontros"}
        </span>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="scales"
            title={
              events.length === 0
                ? "Nenhum encontro na agenda"
                : "Nada por aqui neste filtro"
            }
            text={
              events.length === 0
                ? "Crie o próximo encontro na agenda e depois distribua os ministérios."
                : "Ajuste o período ou o ministério para ver outras escalas."
            }
            action={
              events.length === 0 && isLeader ? (
                <button className="btn btn-primary btn-sm" onClick={() => navigate("/agenda")}>
                  <Icon name="calendar" />
                  Ir para a agenda
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="stagger">
          {filteredEvents.map((event) => {
            const groups = groupsFor(event);
            const all = schedules.filter((schedule) => schedule.event_id === event.id);
            const pending = all.filter((schedule) => schedule.status === "pending").length;
            const confirmed = all.filter(
              (schedule) => schedule.status === "confirmed",
            ).length;
            const totalPeople = new Set(all.map((schedule) => schedule.profile_id)).size;
            const isPast = isEventPast(event.event_date, event.end_time);

            return (
              <section className="card scale-card" key={event.id}>
                <div className="scale-head">
                  <div className="scale-date">
                    <div className="scale-date-day">
                      {String(Number(event.event_date.slice(8, 10))).padStart(2, "0")}
                    </div>
                    <div className="scale-date-month">
                      {new Date(`${event.event_date}T12:00:00`)
                        .toLocaleDateString("pt-BR", { month: "short" })
                        .replace(".", "")}
                    </div>
                  </div>
                  <div className="scale-info">
                    <div className="scale-title">{event.title}</div>
                    <div className="scale-meta">
                      <span>
                        <Icon name="calendar" />
                        {formatLongDate(event.event_date)} · {formatTime(event.start_time)}
                      </span>
                      {event.location && (
                        <span>
                          <Icon name="pin" />
                          {event.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="scale-count">
                    <strong>{all.length}</strong>
                    <span>{all.length === 1 ? "escalado" : "escalados"}</span>
                  </div>
                </div>

                <div className="scale-groups">
                  {groups.length === 0 ? (
                    <div
                      className="row-between"
                      style={{
                        padding: "14px",
                        borderRadius: 10,
                        background: "var(--surface-2)",
                      }}
                    >
                      <span className="small muted">Escala ainda não montada.</span>
                      {isLeader && !isPast && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openAssign(event.id)}
                        >
                          <Icon name="plus" />
                          Montar escala
                        </button>
                      )}
                    </div>
                  ) : (
                    groups.map((group) => {
                      const count = group.people.length;
                      return (
                        <div className="scale-group" key={group.ministryId}>
                          <span
                            className="scale-group-color"
                            style={{ background: group.color }}
                          />
                          <div className="scale-group-main">
                            <div className="scale-group-head">
                              <span className="scale-group-name">{group.name}</span>
                              <span className="badge badge-neutral">{count}</span>
                              {isLeader && !isPast && (
                                <div className="scale-group-actions">
                                  <button
                                    type="button"
                                    title={`Adicionar em ${group.name}`}
                                    aria-label={`Adicionar pessoa em ${group.name}`}
                                    onClick={() => openAssign(event.id, group.ministryId)}
                                  >
                                    <Icon name="plus" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="scale-people">
                              {group.people
                                .slice()
                                .sort((a, b) =>
                                  (personById(a.profile_id)?.full_name ?? "").localeCompare(
                                    personById(b.profile_id)?.full_name ?? "",
                                    "pt-BR",
                                  ),
                                )
                                .map((schedule) => {
                                  const person = personById(schedule.profile_id);
                                  return (
                                    <button
                                      type="button"
                                      key={schedule.id}
                                      className={`scale-person ${schedule.status === "declined" ? "is-declined" : ""}`}
                                      onClick={() => setDetail(schedule)}
                                      title={`${person?.full_name ?? "Pessoa"} · ${
                                        schedule.status === "confirmed"
                                          ? "confirmado"
                                          : schedule.status === "declined"
                                            ? "não poderá"
                                            : "pendente"
                                      }`}
                                    >
                                      <Avatar
                                        name={person?.full_name ?? "?"}
                                        color={person?.avatar_color}
                                      />
                                      {person?.full_name.split(" ")[0] ?? "Pessoa"}
                                      <span className={`status ${schedule.status}`} />
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="scale-card-foot">
                  <div className="scale-foot-note">
                    <Icon name="user" />
                    {all.length === 0
                      ? "Nenhuma pessoa escalada"
                      : `${totalPeople} ${totalPeople === 1 ? "pessoa" : "pessoas"} · ${confirmed} confirmados · ${pending} pendentes`}
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {isLeader && all.length > 0 && !isPast && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => void sendReminders(event)}
                        disabled={notifying === event.id}
                      >
                        {notifying === event.id ? (
                          <span className="spinner" />
                        ) : (
                          <Icon name="bell" />
                        )}
                        Lembretes
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/agenda?date=${event.event_date}`)}
                    >
                      <Icon name="calendar" />
                      Agenda
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Modal: adicionar pessoa */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Escalar pessoa"
        subtitle="Uma pessoa por ministério, por dia. O sistema verifica o conflito automaticamente."
        wide
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAssignOpen(false)}>
              Fechar
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void submitAssign()}
              disabled={assigning || assignBlocked || !assignPersonId}
            >
              {assigning ? <span className="spinner" /> : <Icon name="userPlus" />}
              Escalar pessoa
            </button>
          </>
        }
      >
        {(assignEventId || assignMinistryId) && (
          <div className="form-grid">
            <Field label="Encontro" htmlFor="assign-event" className="full">
              <select
                id="assign-event"
                className="select"
                value={assignEventId}
                onChange={(event) => {
                  setAssignEventId(event.target.value);
                  setAssignPersonId("");
                  setAssignError("");
                }}
              >
                <option value="">Escolha o encontro</option>
                {events
                  .filter((event) => !isEventPast(event.event_date, event.end_time))
                  .map((event) => (
                    <option key={event.id} value={event.id}>
                      {formatLongDate(event.event_date)} · {event.title}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Ministério" htmlFor="assign-ministry" className="full">
              <select
                id="assign-ministry"
                className="select"
                value={assignMinistryId}
                onChange={(event) => {
                  setAssignMinistryId(event.target.value);
                  setAssignPersonId("");
                  setAssignError("");
                }}
              >
                <option value="">Escolha o ministério</option>
                {ministries.map((ministry) => (
                  <option key={ministry.id} value={ministry.id}>
                    {ministry.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <Field label="Quem vai servir?" className="mt-16" htmlFor="assign-search">
          <input
            id="assign-search"
            className="input"
            value={assignSearch}
            onChange={(event) => setAssignSearch(event.target.value)}
            placeholder="Buscar pessoa pelo nome"
            disabled={!assignEventId || !assignMinistryId}
          />
        </Field>

        <div
          style={{
            maxHeight: 240,
            overflowY: "auto",
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            gap: 5,
            paddingRight: 2,
          }}
        >
          {pickerPeople.length === 0 ? (
            <p className="tiny muted" style={{ padding: 10 }}>
              Nenhuma pessoa encontrada.
            </p>
          ) : (
            pickerPeople.map((person) => {
              const conflict = dayConflicts.get(person.id);
              const inTeam = alreadyInTeam.has(person.id);
              const blocked = Boolean(conflict) || inTeam;
              const isSelected = person.id === assignPersonId;
              return (
                <button
                  key={person.id}
                  type="button"
                  className={`member-pick-row ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    if (blocked) return;
                    setAssignPersonId(isSelected ? "" : person.id);
                    setAssignError("");
                  }}
                  disabled={blocked || !assignEventId || !assignMinistryId}
                  style={{ opacity: blocked ? 0.55 : 1, cursor: blocked ? "not-allowed" : "pointer" }}
                >
                  <Avatar name={person.full_name} color={person.avatar_color} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      className="member-pick-name"
                      style={{ display: "block" }}
                    >
                      {person.full_name}
                    </span>
                    <span className="tiny faint" style={{ display: "block" }}>
                      {inTeam
                        ? "Já está nesta equipe"
                        : conflict
                          ? `Já serve em ${conflict.ministry?.name ?? "outro ministério"} neste dia`
                          : ministryMemberIds.has(person.id)
                            ? "Faz parte deste ministério"
                            : "Membro da igreja"}
                    </span>
                  </span>
                  {ministryMemberIds.has(person.id) && !blocked && (
                    <span className="badge badge-pine">No ministério</span>
                  )}
                  {isSelected && (
                    <span style={{ color: "var(--pine)" }}>
                      <Icon name="check" />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <Field
          label="Observação"
          hint="Opcional"
          className="mt-16"
          htmlFor="assign-note"
        >
          <input
            id="assign-note"
            className="input"
            value={assignNote}
            onChange={(event) => setAssignNote(event.target.value)}
            placeholder="Ex.: violão, projeção, recepção da porta"
            maxLength={120}
          />
        </Field>

        {assignSelectedTeam.length > 0 && (
          <div className="form-section">
            <h3 className="form-section-title" style={{ fontSize: 14 }}>
              Já nesta equipe
            </h3>
            <div className="scale-people" style={{ marginTop: 6 }}>
              {assignSelectedTeam.map((schedule) => {
                const person = personById(schedule.profile_id);
                return (
                  <span className="scale-person" key={schedule.id}>
                    <Avatar
                      name={person?.full_name ?? "?"}
                      color={person?.avatar_color}
                    />
                    {person?.full_name.split(" ")[0]}
                    <span className={`status ${schedule.status}`} />
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {assignConflict && assignPersonId && (
          <div className="form-error" style={{ marginTop: 14 }}>
            <Icon name="alert" />
            <span>
              {assignPerson?.full_name.split(" ")[0]} já está em{" "}
              {assignConflict.ministry?.name ?? "outro ministério"} no dia{" "}
              {formatFullDate(assignConflict.event_date)}. Cada pessoa pode servir
              em apenas um ministério por dia.
            </span>
          </div>
        )}

        {assignError && <FormError message={assignError} />}
      </Modal>

      {/* Modal: detalhe da escala */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? personById(detail.profile_id)?.full_name : undefined}
        subtitle={
          detail
            ? `${detail.ministry?.name ?? "Ministério"} · ${detail.event?.title ?? ""}`
            : undefined
        }
      >
        {detail && (
          <>
            <div className="row" style={{ gap: 12, marginBottom: 14 }}>
              <Avatar
                name={personById(detail.profile_id)?.full_name ?? "?"}
                color={personById(detail.profile_id)?.avatar_color}
                size="lg"
              />
              <div>
                <StatusBadge status={detail.status} />
                <div className="tiny muted" style={{ marginTop: 5 }}>
                  {formatFullDate(detail.event_date)} ·{" "}
                  {formatTime(detail.event?.start_time)}
                </div>
              </div>
            </div>

            {detail.note && (
              <div className="detail-block">
                <div className="detail-label">Observação</div>
                <div className="detail-value">{detail.note}</div>
              </div>
            )}

            <div className="detail-block">
              <div className="detail-label">Encontro</div>
              <div className="detail-value">
                {detail.event?.title} · {detail.event?.location}
              </div>
            </div>

            {isLeader && (
              <div className="detail-block">
                <div className="detail-label">Substituir membro</div>
                <div className="row" style={{ gap: 8, marginTop: 6 }}>
                  <select
                    className="select"
                    value={replaceId}
                    onChange={(event) => setReplaceId(event.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Escolha o novo membro</option>
                    {directory
                      .filter((person) => {
                        if (person.id === detail.profile_id) return false;
                        const alreadyScheduled = schedules.some(
                          (schedule) =>
                            schedule.event_date === detail.event_date &&
                            schedule.status !== "declined" &&
                            schedule.profile_id === person.id &&
                            schedule.id !== detail.id,
                        );
                        return !alreadyScheduled;
                      })
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.full_name}
                        </option>
                      ))}
                  </select>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => void replaceMember()}
                    disabled={!replaceId || replacing}
                  >
                    {replacing ? <span className="spinner" /> : <Icon name="refresh" />}
                    Substituir
                  </button>
                </div>
                <div className="tiny faint" style={{ marginTop: 6 }}>
                  A pessoa escolhida não pode já estar escalada neste dia.
                </div>
              </div>
            )}

            <div className="form-actions" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>
                Fechar
              </button>
              {isLeader && (
                <button
                  className="btn btn-danger"
                  onClick={() => setRemoveTarget(detail)}
                  disabled={acting}
                >
                  <Icon name="trash" />
                  Remover
                </button>
              )}
              {(detail.profile_id === user?.id || isLeader) && (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={() => void changeStatus(detail, "declined")}
                    disabled={acting || detail.status === "declined"}
                  >
                    Não poderá
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => void changeStatus(detail, "confirmed")}
                    disabled={acting || detail.status === "confirmed"}
                  >
                    <Icon name="check" />
                    Confirmar
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remover da escala"
        text={
          removeTarget
            ? `Remover ${personById(removeTarget.profile_id)?.full_name ?? "esta pessoa"} de ${removeTarget.ministry?.name ?? "este ministério"}? A pessoa será avisada.`
            : ""
        }
        confirmLabel="Remover"
        tone="danger"
        loading={removing}
        onConfirm={() => void removeSchedule()}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
