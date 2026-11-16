import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  ConfirmDialog,
  EmptyState,
  Field,
  FormError,
  Modal,
  PageHeader,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import {
  addMinistryMember,
  deactivateMinistry,
  deleteSchedule,
  friendlyError,
  listSchedules,
  removeMinistryMember,
  saveMinistry,
} from "@/lib/api";
import { MINISTRY_COLORS } from "@/lib/config";
import { formatLongDate, isEventPast } from "@/lib/dates";
import type {
  Ministry,
  MinistryInput,
  ScheduleWithRelations,
} from "@/lib/types";
import { hasErrors, validateMinistry, type Errors } from "@/lib/validation";

const emptyForm: MinistryInput = {
  name: "",
  description: "",
  color: MINISTRY_COLORS[0],
  leader_id: "",
};

export default function Ministries() {
  const { isLeader } = useAuth();
  const {
    ministries,
    ministryMembers,
    directory,
    refresh,
    personById,
  } = useAppData();
  const { toast } = useToast();

  const [schedules, setSchedules] = useState<ScheduleWithRelations[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Ministry | null>(null);
  const [form, setForm] = useState<MinistryInput>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [addMemberId, setAddMemberId] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const loadSchedules = useCallback(async () => {
    try {
      setSchedules(await listSchedules());
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const detail = detailId
    ? ministries.find((ministry) => ministry.id === detailId) ?? null
    : null;

  const detailMembers = useMemo(() => {
    if (!detail) return [];
    return ministryMembers
      .filter((member) => member.ministry_id === detail.id)
      .map((member) => ({
        membership: member,
        person: personById(member.profile_id),
      }))
      .filter((entry) => entry.person)
      .sort((a, b) =>
        (a.person?.full_name ?? "").localeCompare(b.person?.full_name ?? "", "pt-BR"),
      );
  }, [detail, ministryMembers, personById]);

  const availablePeople = useMemo(() => {
    if (!detail) return [];
    const memberIds = new Set(detailMembers.map((entry) => entry.person?.id));
    return directory.filter((person) => !memberIds.has(person.id));
  }, [detail, detailMembers, directory]);

  const nextByMinistry = useMemo(() => {
    const map = new Map<string, ScheduleWithRelations>();
    for (const schedule of schedules) {
      if (isEventPast(schedule.event_date, schedule.event?.end_time)) continue;
      const current = map.get(schedule.ministry_id);
      if (
        !current ||
        `${schedule.event_date}T${schedule.event?.start_time ?? "00:00"}` <
          `${current.event_date}T${current.event?.start_time ?? "00:00"}`
      ) {
        map.set(schedule.ministry_id, schedule);
      }
    }
    return map;
  }, [schedules]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(ministry: Ministry) {
    setEditing(ministry);
    setForm({
      name: ministry.name,
      description: ministry.description ?? "",
      color: ministry.color,
      leader_id: ministry.leader_id ?? "",
    });
    setErrors({});
    setFormError("");
    setFormOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateMinistry(form);
    setErrors(validation);
    if (hasErrors(validation)) return;
    setSaving(true);
    setFormError("");
    try {
      await saveMinistry(form, editing?.id);
      toast(editing ? "Ministério atualizado" : "Ministério criado", "success");
      setFormOpen(false);
      setEditing(null);
      await Promise.all([refresh(), loadSchedules()]);
    } catch (error) {
      setFormError(friendlyError(error));
    } finally {
      setSaving(false);
    }
  }

  async function addMember() {
    if (!detail || !addMemberId) return;
    try {
      await addMinistryMember(detail.id, addMemberId, "member");
      toast("Pessoa adicionada ao ministério", "success");
      setAddMemberId("");
      await refresh();
    } catch (error) {
      toast(friendlyError(error), "error");
    }
  }

  async function removeMember() {
    if (!detail || !removeTarget) return;
    setRemoving(true);
    try {
      await removeMinistryMember(detail.id, removeTarget);
      toast("Pessoa removida do ministério");
      setRemoveTarget(null);
      await refresh();
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setRemoving(false);
    }
  }

  async function deactivate() {
    if (!detail) return;
    setDeactivating(true);
    try {
      const future = schedules.filter(
        (schedule) =>
          schedule.ministry_id === detail.id &&
          !isEventPast(schedule.event_date, schedule.event?.end_time),
      );
      for (const schedule of future) {
        await deleteSchedule(schedule.id);
      }
      await deactivateMinistry(detail.id);
      toast("Ministério desativado");
      setDeactivateOpen(false);
      setDetailId(null);
      await Promise.all([refresh(), loadSchedules()]);
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Ministérios"
        title="Times que servem juntos"
        subtitle="Cada ministério tem um líder, uma equipe e um canal de conversa próprio."
        actions={
          isLeader ? (
            <button className="btn btn-primary" onClick={openCreate}>
              <Icon name="plus" />
              Novo ministério
            </button>
          ) : undefined
        }
      />

      {ministries.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="ministries"
            title="Nenhum ministério ainda"
            text="Crie os ministérios da igreja para organizar as escalas e abrir os canais de conversa."
            action={
              isLeader ? (
                <button className="btn btn-primary btn-sm" onClick={openCreate}>
                  <Icon name="plus" />
                  Criar ministério
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="ministry-grid stagger">
          {ministries.map((ministry) => {
            const members = ministryMembers.filter(
              (member) => member.ministry_id === ministry.id,
            );
            const leader = personById(ministry.leader_id);
            const next = nextByMinistry.get(ministry.id);
            return (
              <button
                key={ministry.id}
                type="button"
                className="ministry-card"
                onClick={() => setDetailId(ministry.id)}
              >
                <div className="ministry-card-top">
                  <div>
                    <div className="ministry-card-name">{ministry.name}</div>
                    <p className="ministry-card-desc">
                      {ministry.description || "Sem descrição."}
                    </p>
                  </div>
                  <span
                    className="ministry-swatch"
                    style={{ background: ministry.color }}
                  />
                </div>

                {next && (
                  <div className="tiny muted" style={{ marginBottom: 4 }}>
                    Próxima escala · {formatLongDate(next.event_date)}
                  </div>
                )}

                <div className="ministry-card-foot">
                  <span className="ministry-leader">
                    {leader ? (
                      <>
                        <Avatar
                          name={leader.full_name}
                          color={leader.avatar_color}
                        />
                        <span>
                          Líder <strong>{leader.full_name.split(" ")[0]}</strong>
                        </span>
                      </>
                    ) : (
                      <span>Sem líder definido</span>
                    )}
                  </span>
                  <span className="ministry-count">
                    {members.length} {members.length === 1 ? "pessoa" : "pessoas"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detalhe do ministério */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetailId(null)}
        title={detail?.name}
        subtitle={detail?.description || "Equipe e líder do ministério"}
        footer={
          detail ? (
            <>
              {isLeader && (
                <button
                  className="btn btn-danger"
                  style={{ marginRight: "auto" }}
                  onClick={() => setDeactivateOpen(true)}
                >
                  <Icon name="trash" />
                  Desativar
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setDetailId(null)}>
                Fechar
              </button>
              {isLeader && (
                <button className="btn btn-primary" onClick={() => openEdit(detail)}>
                  <Icon name="edit" />
                  Editar
                </button>
              )}
            </>
          ) : undefined
        }
      >
        {detail && (
          <>
            <div className="detail-block">
              <div className="detail-label">Líder do ministério</div>
              {detail.leader_id && personById(detail.leader_id) ? (
                <div className="row" style={{ gap: 9 }}>
                  <Avatar
                    name={personById(detail.leader_id)?.full_name ?? "?"}
                    color={personById(detail.leader_id)?.avatar_color}
                  />
                  <div>
                    <div className="strong small">
                      {personById(detail.leader_id)?.full_name}
                    </div>
                    <div className="tiny muted">Líder</div>
                  </div>
                </div>
              ) : (
                <div className="detail-value muted">
                  Nenhum líder definido ainda.
                </div>
              )}
            </div>

            <div className="detail-block">
              <div className="row-between" style={{ marginBottom: 8 }}>
                <div className="detail-label" style={{ marginBottom: 0 }}>
                  Equipe · {detailMembers.length}{" "}
                  {detailMembers.length === 1 ? "pessoa" : "pessoas"}
                </div>
                <span
                  className="chip"
                  style={{
                    background: `color-mix(in srgb, ${detail.color} 12%, var(--surface))`,
                    borderColor: "transparent",
                  }}
                >
                  <span
                    className="chip-dot"
                    style={{ background: detail.color }}
                  />
                  {detail.name}
                </span>
              </div>

              <div className="list">
                {detailMembers.map(({ membership, person }) => (
                  <div className="list-row" key={membership.profile_id}>
                    <Avatar
                      name={person?.full_name ?? "?"}
                      color={person?.avatar_color}
                    />
                    <div className="list-main">
                      <div className="list-title">{person?.full_name}</div>
                      <div className="list-sub">
                        {membership.role_in_ministry === "leader"
                          ? "Líder do ministério"
                          : "Membro"}
                      </div>
                    </div>
                    {isLeader && membership.role_in_ministry !== "leader" && (
                      <button
                        type="button"
                        className="btn-icon"
                        style={{ width: 30, height: 30 }}
                        onClick={() => setRemoveTarget(person?.id ?? null)}
                        aria-label={`Remover ${person?.full_name}`}
                      >
                        <Icon name="x" />
                      </button>
                    )}
                  </div>
                ))}
                {detailMembers.length === 0 && (
                  <p className="tiny muted" style={{ padding: "8px 0" }}>
                    Ninguém na equipe ainda.
                  </p>
                )}
              </div>

              {isLeader && availablePeople.length > 0 && (
                <div className="form-row" style={{ marginTop: 12 }}>
                  <select
                    className="select"
                    value={addMemberId}
                    onChange={(event) => setAddMemberId(event.target.value)}
                    aria-label="Escolher pessoa para adicionar"
                  >
                    <option value="">Adicionar pessoa à equipe...</option>
                    {availablePeople.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-secondary"
                    onClick={() => void addMember()}
                    disabled={!addMemberId}
                    style={{ flex: "none" }}
                  >
                    <Icon name="plus" />
                    Adicionar
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* Formulário */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Editar ministério" : "Novo ministério"}
        subtitle="Defina o nome, a cor e quem lidera o time."
        footer={
          <>
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
              form="ministry-form"
              disabled={saving}
            >
              {saving ? <span className="spinner" /> : editing ? "Salvar" : "Criar ministério"}
            </button>
          </>
        }
      >
        <form id="ministry-form" onSubmit={submit} noValidate>
          <Field label="Nome" error={errors.name} htmlFor="min-name">
            <input
              id="min-name"
              className="input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ex.: Louvor"
              data-autofocus
            />
          </Field>

          <Field
            label="Descrição"
            hint="Opcional"
            error={errors.description}
            htmlFor="min-desc"
            className="mt-16"
          >
            <input
              id="min-desc"
              className="input"
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              placeholder="O que este ministério faz"
              maxLength={160}
            />
          </Field>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <Field label="Líder" error={errors.leader_id} htmlFor="min-leader">
              <select
                id="min-leader"
                className="select"
                value={form.leader_id ?? ""}
                onChange={(event) =>
                  setForm({ ...form, leader_id: event.target.value })
                }
              >
                <option value="">Definir depois</option>
                {directory
                  .filter((person) => person.role === "leader")
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Cor" error={errors.color} htmlFor="min-color">
              <div className="color-swatches" id="min-color">
                {MINISTRY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${form.color === color ? "selected" : ""}`}
                    style={{ background: color }}
                    onClick={() => setForm({ ...form, color })}
                    aria-label={`Cor ${color}`}
                    aria-pressed={form.color === color}
                  />
                ))}
              </div>
            </Field>
          </div>

          {formError && <FormError message={formError} />}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remover do ministério"
        text="A pessoa deixa a equipe e o canal do ministério. As escalas futuras dela neste ministério não são alteradas automaticamente."
        confirmLabel="Remover"
        tone="danger"
        loading={removing}
        onConfirm={() => void removeMember()}
        onClose={() => setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={deactivateOpen}
        title="Desativar ministério"
        text={
          detail
            ? `Desativar ${detail.name}? As escalas futuras deste ministério serão removidas e o canal deixa de aparecer. O histórico é mantido.`
            : ""
        }
        confirmLabel="Desativar ministério"
        tone="danger"
        loading={deactivating}
        onConfirm={() => void deactivate()}
        onClose={() => setDeactivateOpen(false)}
      />
    </div>
  );
}
