import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  EmptyState,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import {
  listEvents,
  listSchedules,
  respondSchedule,
  subscribeToSchedules,
} from "@/lib/api";
import { CHURCH_NAME, VERSE } from "@/lib/config";
import {
  addDaysISO,
  formatFullDate,
  formatLongDate,
  formatShortDate,
  formatTime,
  isEventPast,
  todayISO,
  weekdayInitial,
  weekdayShort,
} from "@/lib/dates";
import type {
  ChurchEvent,
  ScheduleStatus,
  ScheduleWithRelations,
} from "@/lib/types";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function eventAccent(kind: ChurchEvent["kind"]): string {
  switch (kind) {
    case "ensaio":
      return "#b96f4e";
    case "reuniao":
      return "#4c6d88";
    case "especial":
      return "#9b7a3f";
    default:
      return "#2c5a4b";
  }
}

export default function Dashboard() {
  const { user, isLeader } = useAuth();
  const {
    directory,
    ministries,
    ministryMembers,
    personById,
  } = useAppData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [schedules, setSchedules] = useState<ScheduleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [responded, setResponded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [eventRows, scheduleRows] = await Promise.all([
        listEvents(),
        listSchedules(),
      ]);
      setEvents(eventRows);
      setSchedules(scheduleRows);
    } catch {
      setEvents([]);
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeToSchedules(() => {
      void load();
    });
  }, [load]);

  const upcoming = useMemo(
    () =>
      events
        .filter((event) => !isEventPast(event.event_date, event.end_time))
        .slice()
        .sort((a, b) =>
          `${a.event_date}T${a.start_time}`.localeCompare(
            `${b.event_date}T${b.start_time}`,
          ),
        ),
    [events],
  );

  const nextEvent = upcoming[0];
  const nextSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.event_id === nextEvent?.id),
    [schedules, nextEvent],
  );

  const team = useMemo(() => {
    const seen = new Set<string>();
    const people: { id: string; name: string; color: string }[] = [];
    for (const schedule of nextSchedules) {
      if (seen.has(schedule.profile_id)) continue;
      const person = personById(schedule.profile_id);
      if (!person) continue;
      seen.add(schedule.profile_id);
      people.push({
        id: person.id,
        name: person.full_name,
        color: person.avatar_color,
      });
    }
    return people;
  }, [nextSchedules, personById]);

  const myUpcoming = useMemo(
    () =>
      schedules
        .filter(
          (schedule) =>
            schedule.profile_id === user?.id &&
            !isEventPast(schedule.event_date, schedule.event?.end_time),
        )
        .sort((a, b) =>
          `${a.event_date}T${a.event?.start_time ?? "00:00"}`.localeCompare(
            `${b.event_date}T${b.event?.start_time ?? "00:00"}`,
          ),
        ),
    [schedules, user?.id],
  );

  const pending = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          schedule.status === "pending" &&
          !isEventPast(schedule.event_date, schedule.event?.end_time),
      ),
    [schedules],
  );

  const myMinistries = useMemo(
    () =>
      ministryMembers
        .filter((member) => member.profile_id === user?.id)
        .map((member) => ministries.find((ministry) => ministry.id === member.ministry_id))
        .filter((ministry): ministry is NonNullable<typeof ministry> => Boolean(ministry)),
    [ministryMembers, ministries, user?.id],
  );

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysISO(todayISO(), index)),
    [],
  );

  const myNextAssignment = myUpcoming[0];

  async function respond(id: string, status: ScheduleStatus) {
    setResponded(id);
    try {
      await respondSchedule(id, status);
      toast(
        status === "confirmed" ? "Presença confirmada. Obrigado!" : "Avisamos a liderança.",
        "success",
      );
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível responder.", "error");
    } finally {
      setResponded(null);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader eyebrow="Painel" title="Preparando seu dia" />
        <LoadingBlock label="Organizando escalas e agenda" />
      </div>
    );
  }

  const firstName = user?.full_name.split(" ")[0] ?? "";
  const nextDay = nextEvent ? Number(nextEvent.event_date.slice(8, 10)) : 0;

  return (
    <div>
      <PageHeader
        eyebrow={formatFullDate(todayISO())}
        title={`${greeting()}, ${firstName}.`}
        subtitle={
          isLeader
            ? "Aqui está o pulso da igreja hoje: escalas, confirmações e próximos encontros."
            : "Sua escala, os próximos encontros e o que a equipe está organizando."
        }
        actions={
          <>
            <Link to="/agenda" className="btn btn-secondary">
              <Icon name="calendar" />
              <span className="optional-label">Ver agenda</span>
            </Link>
            {isLeader && (
              <Link to="/escalas?nova=1" className="btn btn-primary">
                <Icon name="plus" />
                Nova escala
              </Link>
            )}
          </>
        }
      />

      <div className="dash-grid stagger">
        <div className="dash-col">
          {nextEvent ? (
            <section className="next-card" aria-label="Próximo encontro">
              <div className="next-top">
                <span className="next-label">Próximo encontro</span>
                {myNextAssignment && myNextAssignment.event_id === nextEvent.id && (
                  <span className="next-pill">
                    <Icon name="check" />
                    Você está escalado
                  </span>
                )}
              </div>
              <div className="next-body">
                <div className="next-date">
                  <div className="next-day">{String(nextDay).padStart(2, "0")}</div>
                  <div className="next-month">
                    {new Date(`${nextEvent.event_date}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                      { month: "short" },
                    ).replace(".", "")}
                  </div>
                </div>
                <div>
                  <h2 className="next-title">{nextEvent.title}</h2>
                  <div className="next-meta">
                    <span>
                      <Icon name="clock" />
                      {formatTime(nextEvent.start_time)}
                      {nextEvent.end_time ? ` – ${formatTime(nextEvent.end_time)}` : ""}
                    </span>
                    {nextEvent.location && (
                      <span>
                        <Icon name="pin" />
                        {nextEvent.location}
                      </span>
                    )}
                    <span>
                      <Icon name="calendar" />
                      {weekdayShort(nextEvent.event_date)}, {formatShortDate(nextEvent.event_date)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="next-foot">
                <div className="next-team">
                  <div className="avatar-stack">
                    {team.slice(0, 4).map((person) => (
                      <Avatar
                        key={person.id}
                        name={person.name}
                        color={person.color}
                        size="sm"
                      />
                    ))}
                    {team.length > 4 && (
                      <span className="avatar sm avatar-more">+{team.length - 4}</span>
                    )}
                  </div>
                  <div className="next-team-text">
                    <strong>
                      {team.length} {team.length === 1 ? "pessoa escalada" : "pessoas escaladas"}
                    </strong>
                    {nextSchedules.length > 0
                      ? `${new Set(nextSchedules.map((schedule) => schedule.ministry_id)).size} ministérios em ação`
                      : "Escala ainda não montada"}
                  </div>
                </div>
                <button
                  type="button"
                  className="next-cta"
                  onClick={() => navigate("/escalas")}
                >
                  Ver escala
                  <Icon name="arrowRight" />
                </button>
              </div>
            </section>
          ) : (
            <section className="card">
              <EmptyState
                icon="calendar"
                title="Nenhum encontro futuro"
                text={
                  isLeader
                    ? "Crie o próximo encontro na agenda para começar a montar a escala."
                    : "Assim que a liderança agendar o próximo encontro, ele aparece aqui."
                }
                action={
                  isLeader ? (
                    <Link to="/agenda" className="btn btn-primary btn-sm">
                      <Icon name="plus" />
                      Criar encontro
                    </Link>
                  ) : undefined
                }
              />
            </section>
          )}

          <div className="stats">
            {isLeader ? (
              <>
                <div className="stat">
                  <div className="stat-value">
                    {pending.length}
                    <small>pend.</small>
                  </div>
                  <div className="stat-label">Confirmações aguardando</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{directory.length}</div>
                  <div className="stat-label">Pessoas ativas na igreja</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{ministries.length}</div>
                  <div className="stat-label">Ministérios em atividade</div>
                </div>
              </>
            ) : (
              <>
                <div className="stat">
                  <div className="stat-value">{myUpcoming.length}</div>
                  <div className="stat-label">Minhas próximas escalas</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{myMinistries.length}</div>
                  <div className="stat-label">Ministérios que sirvo</div>
                </div>
                <div className="stat">
                  <div className="stat-value">
                    {upcoming.length}
                    <small>+</small>
                  </div>
                  <div className="stat-label">Encontros pela frente</div>
                </div>
              </>
            )}
          </div>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title">Sua semana</h2>
                <p className="card-sub">{CHURCH_NAME} · próximos 7 dias</p>
              </div>
              <Link to="/agenda" className="card-link">
                Agenda <Icon name="chevronRight" />
              </Link>
            </div>
            <div className="week-strip">
              {weekDays.map((iso) => {
                const dayEvents = events.filter(
                  (event) => event.event_date === iso,
                );
                const isToday = iso === todayISO();
                return (
                  <button
                    key={iso}
                    type="button"
                    className={`week-day ${isToday ? "today" : ""}`}
                    onClick={() => navigate(`/agenda?date=${iso}`)}
                    aria-label={`${weekdayShort(iso)}, ${formatShortDate(iso)}${dayEvents.length ? `, ${dayEvents.length} encontros` : ""}`}
                  >
                    <span className="week-name">
                      {isToday ? "hoje" : weekdayInitial(iso)}
                    </span>
                    <span className="week-num">{Number(iso.slice(8, 10))}</span>
                    <span className="week-dots">
                      {dayEvents.slice(0, 3).map((event) => (
                        <span
                          key={event.id}
                          className="week-dot"
                          style={{ background: isToday ? undefined : eventAccent(event.kind) }}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            {upcoming.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 4 }}>
                {upcoming.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="mini-event"
                    onClick={() => navigate(`/agenda?date=${event.event_date}`)}
                    style={{ width: "100%" }}
                  >
                    <div className="mini-date">
                      <div className="mini-date-day">
                        {String(Number(event.event_date.slice(8, 10))).padStart(2, "0")}
                      </div>
                      <div className="mini-date-month">
                        {new Date(`${event.event_date}T12:00:00`)
                          .toLocaleDateString("pt-BR", { month: "short" })
                          .replace(".", "")}
                      </div>
                    </div>
                    <div className="mini-main">
                      <div className="mini-title">{event.title}</div>
                      <div className="mini-sub">
                        {formatTime(event.start_time)} ·{" "}
                        {event.location || "Local a definir"}
                      </div>
                    </div>
                    <span className="mini-end">
                      {weekdayShort(event.event_date)}
                    </span>
                    <Icon name="chevronRight" size={15} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="verse-card">
            <p className="verse-text">“{VERSE.text}”</p>
            <p className="verse-ref">{VERSE.ref}</p>
          </section>
        </div>

        <div className="dash-col">
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title card-title-sm">Minha próxima escala</h2>
                <p className="card-sub">Confirme sua presença</p>
              </div>
              <Link to="/escalas" className="card-link">
                Todas <Icon name="chevronRight" />
              </Link>
            </div>

            {myNextAssignment ? (
              <div>
                <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                  <div
                    className="ministry-color"
                    style={{
                      background:
                        myNextAssignment.ministry?.color ?? "var(--pine)",
                      width: 4,
                      alignSelf: "stretch",
                      borderRadius: 4,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="small strong">
                      {myNextAssignment.ministry?.name ?? "Ministério"}
                    </div>
                    <div className="tiny muted">
                      {myNextAssignment.event?.title} ·{" "}
                      {formatLongDate(myNextAssignment.event_date)}
                    </div>
                  </div>
                  <div style={{ marginLeft: "auto" }}>
                    <StatusBadge status={myNextAssignment.status} />
                  </div>
                </div>

                {myNextAssignment.status === "pending" ? (
                  <div className="row" style={{ gap: 7 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() =>
                        void respond(myNextAssignment.id, "confirmed")
                      }
                      disabled={responded === myNextAssignment.id}
                    >
                      <Icon name="check" />
                      Confirmar
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() =>
                        void respond(myNextAssignment.id, "declined")
                      }
                      disabled={responded === myNextAssignment.id}
                    >
                      Não poderei
                    </button>
                  </div>
                ) : (
                  <div className="tiny muted">
                    {myNextAssignment.status === "confirmed"
                      ? "Tudo certo. Obrigado por servir!"
                      : "A liderança foi avisada. Se mudar, fale com o líder do ministério."}
                  </div>
                )}

                {myUpcoming.length > 1 && (
                  <div className="list" style={{ marginTop: 12 }}>
                    {myUpcoming.slice(1, 3).map((schedule) => (
                      <div className="list-row" key={schedule.id}>
                        <span
                          className="ministry-color"
                          style={{ background: schedule.ministry?.color }}
                        />
                        <div className="list-main">
                          <div className="list-title">
                            {schedule.ministry?.name} · {schedule.event?.title}
                          </div>
                          <div className="list-sub">
                            {formatLongDate(schedule.event_date)} ·{" "}
                            {formatTime(schedule.event?.start_time)}
                          </div>
                        </div>
                        <StatusBadge status={schedule.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon="scales"
                title="Nada marcado por enquanto"
                text="Quando você for escalado, a liderança avisa por aqui e por WhatsApp."
              />
            )}
          </section>

          {isLeader && (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title card-title-sm">A confirmar</h2>
                  <p className="card-sub">
                    {pending.length === 0
                      ? "Tudo confirmado"
                      : `${pending.length} ${pending.length === 1 ? "pessoa" : "pessoas"} para lembrar`}
                  </p>
                </div>
                <Link to="/escalas" className="card-link">
                  Escalas <Icon name="chevronRight" />
                </Link>
              </div>

              {pending.length === 0 ? (
                <p className="tiny muted" style={{ lineHeight: 1.5 }}>
                  Todas as escalas futuras já foram confirmadas. Bom trabalho,
                  liderança.
                </p>
              ) : (
                <div>
                  {pending.slice(0, 4).map((schedule) => {
                    const person = personById(schedule.profile_id);
                    return (
                      <button
                        key={schedule.id}
                        type="button"
                        className="pending-row"
                        style={{ width: "100%", textAlign: "left" }}
                        onClick={() => navigate("/escalas")}
                      >
                        <Avatar
                          name={person?.full_name ?? "?"}
                          color={person?.avatar_color}
                          size="sm"
                        />
                        <div className="pending-main">
                          <div className="pending-name">
                            {person?.full_name ?? "Pessoa"}
                          </div>
                          <div className="pending-sub">
                            {schedule.ministry?.name} · {schedule.event?.title}
                          </div>
                        </div>
                        <span className="pending-check" aria-hidden="true">
                          <Icon name="chevronRight" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title card-title-sm">Ministérios</h2>
                <p className="card-sub">{ministries.length} em atividade</p>
              </div>
              <Link to="/ministerios" className="card-link">
                Ver <Icon name="chevronRight" />
              </Link>
            </div>
            <div>
              {ministries.slice(0, 5).map((ministry) => {
                const count = ministryMembers.filter(
                  (member) => member.ministry_id === ministry.id,
                ).length;
                const leader = personById(ministry.leader_id);
                return (
                  <div className="ministry-line" key={ministry.id}>
                    <span
                      className="ministry-color"
                      style={{ background: ministry.color }}
                    />
                    <div className="ministry-line-main">
                      <div className="ministry-line-name">{ministry.name}</div>
                      <div className="ministry-line-sub">
                        {leader ? leader.full_name.split(" ")[0] : "Sem líder"} ·{" "}
                        {count} {count === 1 ? "pessoa" : "pessoas"}
                      </div>
                    </div>
                    <span className="ministry-line-count">{count}</span>
                  </div>
                );
              })}
              {ministries.length === 0 && (
                <p className="tiny muted">Nenhum ministério cadastrado ainda.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
