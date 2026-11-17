import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  Field,
  FormError,
  LoadingBlock,
  Modal,
  PageHeader,
  RoleBadge,
  SearchField,
  Segmented,
  StatusBadge,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import {
  createPerson,
  deactivatePerson,
  deleteSchedule,
  friendlyError,
  listPeople,
  listSchedules,
  resetPersonPassword,
  roleLabel,
  updatePerson,
} from "@/lib/api";
import { AVATAR_COLORS } from "@/lib/config";
import { formatPhone, maskPhoneInput, normalizePhoneBR, whatsappLink } from "@/lib/phone";
import {
  formatFullDate,
  formatLongDate,
  formatTime,
  isEventPast,
} from "@/lib/dates";
import type {
  InviteResult,
  Person,
  PersonInput,
  Role,
  ScheduleWithRelations,
} from "@/lib/types";
import {
  hasErrors,
  normalizeName,
  validatePerson,
  type Errors,
} from "@/lib/validation";

type PersonLike = {
  id: string;
  full_name: string;
  role: Role;
  avatar_color: string;
  phone?: string;
  email?: string | null;
  birth_date?: string | null;
};

type RoleFilter = "all" | "leader" | "member";

const emptyForm = {
  full_name: "",
  phone: "",
  email: "",
  role: "member" as "leader" | "member",
  birth_date: "",
};

export default function People() {
  const { user, isLeader } = useAuth();
  const {
    directory,
    ministries,
    ministryMembers,
    refresh,
  } = useAppData();
  const { toast } = useToast();

  const [people, setPeople] = useState<Person[]>([]);
  const [schedules, setSchedules] = useState<ScheduleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const [detail, setDetail] = useState<PersonLike | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PersonLike | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState<InviteResult | null>(null);

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [acting, setActing] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLSelectElement>(null);
  const birthRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [peopleRows, scheduleRows] = await Promise.all([
        isLeader ? listPeople() : Promise.resolve([]),
        listSchedules(),
      ]);
      setPeople(peopleRows);
      setSchedules(scheduleRows);
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setLoading(false);
    }
  }, [isLeader, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const list: PersonLike[] = useMemo(() => {
    if (isLeader) return people;
    return directory.map((person) => ({ ...person }));
  }, [isLeader, people, directory]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return list.filter((person) => {
      if (roleFilter !== "all" && person.role !== roleFilter) return false;
      if (person.role === "pending") return false;
      if (!term) return true;
      return (
        person.full_name.toLowerCase().includes(term) ||
        (person.phone ?? "").includes(term)
      );
    });
  }, [list, search, roleFilter]);

  const leaders = filtered.filter((person) => person.role === "leader");
  const members = filtered.filter((person) => person.role === "member");

  function ministriesOf(personId: string) {
    return ministries.filter((ministry) =>
      ministryMembers.some(
        (member) =>
          member.ministry_id === ministry.id && member.profile_id === personId,
      ),
    );
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(person: PersonLike) {
    setDetail(null);
    setEditing(person);
    setForm({
      full_name: person.full_name,
      phone: person.phone ? maskPhoneInput(person.phone) : "",
      email: person.email ?? "",
      role: person.role === "leader" ? "leader" : "member",
      birth_date: person.birth_date ?? "",
    });
    setErrors({});
    setFormError("");
    setFormOpen(true);
  }

  async function resetPassword(person: PersonLike) {
    setActing(true);
    try {
      const password = await resetPersonPassword(person.id);
      setInvite({ person: person as Person, provisionalPassword: password });
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setActing(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const input: PersonInput = {
      full_name: normalizeName(form.full_name),
      phone: normalizePhoneBR(form.phone) ?? form.phone,
      email: form.email.trim() || undefined,
      role: form.role,
      birth_date: form.birth_date || null,
      avatar_color:
        AVATAR_COLORS[
          Math.abs(form.full_name.length + form.phone.length) % AVATAR_COLORS.length
        ],
    };
    const validation = validatePerson(input);
    setErrors(validation);
    if (hasErrors(validation)) return;

    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        const updated = await updatePerson(editing.id, {
          full_name: input.full_name,
          phone: input.phone,
          email: input.email || null,
          role: input.role,
          birth_date: input.birth_date || null,
        });
        setDetail(updated);
        toast("Cadastro atualizado", "success");
        setFormOpen(false);
        setEditing(null);
      } else {
        const result = await createPerson(input);
        setInvite(result);
        toast("Cadastro criado. Compartilhe o convite.", "success");
        setFormOpen(false);
      }
      await Promise.all([load(), refresh()]);
    } catch (error) {
      setFormError(friendlyError(error));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeactivate() {
    if (!detail) return;
    setDeactivating(true);
    try {
      const future = schedules.filter(
        (schedule) =>
          schedule.profile_id === detail.id &&
          !isEventPast(schedule.event_date, schedule.event?.end_time),
      );
      for (const schedule of future) {
        await deleteSchedule(schedule.id);
      }
      await deactivatePerson(detail.id);
      toast("Cadastro desativado");
      setDeactivateOpen(false);
      setDetail(null);
      await Promise.all([load(), refresh()]);
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setDeactivating(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader eyebrow="Pessoas" title="A família da igreja" />
        <LoadingBlock label="Carregando cadastros" />
      </div>
    );
  }

  const detailMinistries = detail ? ministriesOf(detail.id) : [];
  const detailSchedules = detail
    ? schedules
        .filter(
          (schedule) =>
            schedule.profile_id === detail.id &&
            !isEventPast(schedule.event_date, schedule.event?.end_time),
        )
        .slice(0, 5)
    : [];
  const canSeeContact = Boolean(detail && (isLeader || detail.id === user?.id));

  return (
    <div>
      <PageHeader
        eyebrow="Pessoas"
        title="A família da igreja"
        subtitle={
          isLeader
            ? "Cadastre líderes e membros, mantenha os telefones atualizados e veja quem serve em cada ministério."
            : "Conheça quem serve com você. Os contatos são visíveis apenas para a liderança."
        }
        actions={
          isLeader ? (
            <button className="btn btn-primary" onClick={openCreate}>
              <Icon name="userPlus" />
              Nova pessoa
            </button>
          ) : undefined
        }
      />

      <div className="filters-bar">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nome ou telefone"
        />
        <Segmented<RoleFilter>
          value={roleFilter}
          onChange={setRoleFilter}
          ariaLabel="Filtrar por função"
          options={[
            { value: "all", label: "Todos" },
            { value: "leader", label: "Liderança" },
            { value: "member", label: "Membros" },
          ]}
        />
        <span className="tiny faint" style={{ marginLeft: "auto" }}>
          {filtered.length} {filtered.length === 1 ? "pessoa" : "pessoas"}
        </span>
      </div>

      <section className="card people-list">
        {leaders.length > 0 && (
          <>
            <div className="people-section-label">Liderança</div>
            {leaders.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                ministries={ministriesOf(person.id)}
                isLeader={isLeader}
                onOpen={() => setDetail(person)}
              />
            ))}
          </>
        )}

        {members.length > 0 && (
          <>
            <div className="people-section-label">Membros</div>
            {members.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                ministries={ministriesOf(person.id)}
                isLeader={isLeader}
                onOpen={() => setDetail(person)}
              />
            ))}
          </>
        )}

        {filtered.length === 0 && (
          <EmptyState
            icon="people"
            title="Nenhuma pessoa encontrada"
            text={
              search
                ? "Tente outro nome ou limpe a busca."
                : "Cadastre o primeiro líder ou membro da igreja."
            }
            action={
              isLeader && !search ? (
                <button className="btn btn-primary btn-sm" onClick={openCreate}>
                  <Icon name="userPlus" />
                  Cadastrar pessoa
                </button>
              ) : undefined
            }
          />
        )}
      </section>

      {/* Detalhe */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        wide
        footer={
          detail ? (
            <>
              {isLeader && detail.id !== user?.id && (
                <button
                  className="btn btn-danger"
                  style={{ marginRight: "auto" }}
                  onClick={() => setDeactivateOpen(true)}
                >
                  <Icon name="trash" />
                  Desativar
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>
                Fechar
              </button>
               {isLeader && (
                 <>
                   <button
                     className="btn btn-secondary"
                     onClick={() => void resetPassword(detail)}
                     disabled={acting}
                   >
                     <Icon name="refresh" />
                     Resetar senha
                   </button>
                   <button className="btn btn-primary" onClick={() => openEdit(detail)}>
                     <Icon name="edit" />
                     Editar cadastro
                   </button>
                 </>
               )}
            </>
          ) : undefined
        }
      >
        {detail && (
          <>
            <div className="person-hero">
              <Avatar
                name={detail.full_name}
                color={detail.avatar_color}
                size="xl"
              />
              <div className="person-hero-main">
                <div className="person-hero-name">{detail.full_name}</div>
                <div className="person-hero-meta">
                  <RoleBadge role={detail.role} />
                  <span>{roleLabel(detail.role)}</span>
                  {detail.role === "leader" && <span>·</span>}
                  {detail.role === "leader" && (
                    <span>{ministriesOf(detail.id).length} ministérios</span>
                  )}
                </div>
              </div>
            </div>

            {canSeeContact && detail.phone && (
              <div className="detail-block">
                <div className="detail-label">Celular</div>
                <div className="detail-value">
                  <Icon name="phone" />
                  <span className="mono">{formatPhone(detail.phone)}</span>
                </div>
                <div className="contact-actions">
                  <a
                    className="btn btn-secondary btn-sm"
                    href={whatsappLink(
                      detail.phone,
                      `Olá, ${detail.full_name.split(" ")[0]}! Falo da liderança da Igreja JERU.`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon name="whatsapp" />
                    WhatsApp
                  </a>
                  <a className="btn btn-ghost btn-sm" href={`tel:${detail.phone}`}>
                    <Icon name="phone" />
                    Ligar
                  </a>
                </div>
              </div>
            )}

            {detail.email && canSeeContact && (
              <div className="detail-block">
                <div className="detail-label">E-mail</div>
                <div className="detail-value">
                  <Icon name="mail" />
                  {detail.email}
                </div>
              </div>
            )}

            {detail.birth_date && (
              <div className="detail-block">
                <div className="detail-label">Aniversário</div>
                <div className="detail-value">
                  <Icon name="calendar" />
                  {formatFullDate(detail.birth_date)}
                </div>
              </div>
            )}

            <div className="detail-block">
              <div className="detail-label">Ministérios</div>
              {detailMinistries.length === 0 ? (
                <div className="detail-value muted">
                  Ainda não faz parte de um ministério.
                </div>
              ) : (
                <div className="row wrap" style={{ gap: 5 }}>
                  {detailMinistries.map((ministry) => (
                    <span className="chip" key={ministry.id}>
                      <span
                        className="chip-dot"
                        style={{ background: ministry.color }}
                      />
                      {ministry.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="detail-block">
              <div className="detail-label">Próximas escalas</div>
              {detailSchedules.length === 0 ? (
                <div className="detail-value muted">
                  Nenhuma escala futura no momento.
                </div>
              ) : (
                <div className="list">
                  {detailSchedules.map((schedule) => (
                    <div className="list-row" key={schedule.id}>
                      <span
                        className="ministry-color"
                        style={{ background: schedule.ministry?.color }}
                      />
                      <div className="list-main">
                        <div className="list-title">
                          {schedule.event?.title} · {schedule.ministry?.name}
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
          </>
        )}
      </Modal>

      {/* Criar/editar */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Editar cadastro" : "Nova pessoa"}
        subtitle={
          editing
            ? "Atualize os dados de contato e a função na igreja."
            : "O telefone é obrigatório e será usado nos avisos da escala."
        }
        wide
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
              form="person-form"
              disabled={saving}
            >
              {saving ? <span className="spinner" /> : editing ? "Salvar" : "Cadastrar e gerar convite"}
            </button>
          </>
        }
      >
        <form id="person-form" onSubmit={submit} noValidate>
          <Field
            label="Nome completo"
            error={errors.full_name}
            htmlFor="person-name"
          >
            <input
              id="person-name"
              ref={nameRef}
              className="input"
              defaultValue={form.full_name}
              onChange={(event) =>
                setForm({ ...form, full_name: event.target.value })
              }
              placeholder="Nome e sobrenome"
              autoComplete="name"
              data-autofocus
            />
          </Field>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <Field
              label="Celular com DDD"
              hint="Obrigatório"
              error={errors.phone}
              htmlFor="person-phone"
            >
              <input
                id="person-phone"
                ref={phoneRef}
                className="input"
                type="tel"
                inputMode="tel"
                defaultValue={form.phone}
                onChange={(event) => {
                  const raw = event.target.value;
                  const masked = maskPhoneInput(raw);
                  phoneRef.current!.value = masked;
                  setForm({ ...form, phone: masked });
                }}
                placeholder="(11) 91234-5678"
                autoComplete="tel"
              />
            </Field>
            <Field
              label="E-mail"
              hint="Opcional"
              error={errors.email}
              htmlFor="person-email"
            >
              <input
                id="person-email"
                ref={emailRef}
                className="input"
                type="email"
                defaultValue={form.email}
                onChange={(event) => {
                  emailRef.current!.value = event.target.value;
                  setForm({ ...form, email: event.target.value });
                }}
                placeholder="pessoa@email.com"
                autoComplete="email"
              />
            </Field>
            <Field label="Função" error={errors.role} htmlFor="person-role">
              <select
                id="person-role"
                ref={roleRef}
                className="select"
                defaultValue={form.role}
                onChange={(event) => {
                  roleRef.current!.value = event.target.value;
                  setForm({
                    ...form,
                    role: event.target.value as "leader" | "member",
                  });
                }}
              >
                <option value="member">Membro</option>
                <option value="leader">Líder</option>
              </select>
            </Field>
            <Field
              label="Aniversário"
              hint="Opcional"
              error={errors.birth_date}
              htmlFor="person-birth"
            >
              <input
                id="person-birth"
                ref={birthRef}
                className="input"
                type="date"
                defaultValue={form.birth_date}
                onChange={(event) => {
                  birthRef.current!.value = event.target.value;
                  setForm({ ...form, birth_date: event.target.value });
                }}
              />
            </Field>
          </div>

          {!editing && (
            <div className="demo-card" style={{ marginTop: 18 }}>
              <Icon name="shield" />
              <p>
                A senha provisória será gerada após o cadastro e aparece apenas
                uma vez. Compartilhe com a pessoa para o primeiro acesso.
              </p>
            </div>
          )}

          {formError && <FormError message={formError} />}
        </form>
      </Modal>

      {/* Convite gerado */}
      <Modal
        open={Boolean(invite)}
        onClose={() => setInvite(null)}
        title="Acesso criado"
        subtitle={
          invite
            ? `Compartilhe os dados com ${invite.person.full_name.split(" ")[0]} para o primeiro acesso.`
            : undefined
        }
        icon="userPlus"
      >
        {invite && (
          <>
            <div className="row" style={{ gap: 10, marginBottom: 16 }}>
              <Avatar
                name={invite.person.full_name}
                color={invite.person.avatar_color}
                size="lg"
              />
              <div>
                <div className="strong">{invite.person.full_name}</div>
                <div className="tiny muted">
                  {roleLabel(invite.person.role)} ·{" "}
                  {formatPhone(invite.person.phone)}
                </div>
              </div>
            </div>

            <div
              className="detail-block"
              style={{
                textAlign: "center",
                background: "var(--surface-2)",
                borderRadius: 12,
                padding: 18,
                marginBottom: 6,
              }}
            >
              <div className="detail-label">Senha provisória</div>
              <div
                className="display mono"
                style={{
                  fontSize: 26,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  marginTop: 4,
                }}
              >
                {invite.provisionalPassword}
              </div>
              <div className="tiny faint" style={{ marginTop: 6 }}>
                A pessoa deve trocar essa senha no primeiro acesso.
              </div>
            </div>

            <div className="row wrap" style={{ marginTop: 12 }}>
              <CopyButton value={invite.provisionalPassword} label="Copiar senha" />
              {invite.person.phone && (
                <a
                  className="btn btn-primary"
                  href={whatsappLink(
                    invite.person.phone,
                    `Olá, ${invite.person.full_name.split(" ")[0]}! Seu acesso ao EscalaJeru da Igreja JERU está pronto.\n\nE-mail: ${invite.person.email ?? "seu e-mail cadastrado"}\nSenha provisória: ${invite.provisionalPassword}\n\nAcesse ${window.location.origin}/login e troque a senha no primeiro acesso.`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="whatsapp" />
                  Enviar por WhatsApp
                </a>
              )}
            </div>

            <div className="demo-card" style={{ marginTop: 16 }}>
              <Icon name="info" />
              <p>
                A senha provisória aparece apenas uma vez. Se perder, use
                “Resetar senha” no cadastro da pessoa.
              </p>
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setInvite(null)}>
                Concluir
              </button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={deactivateOpen}
        title="Desativar cadastro"
        text={
          detail
            ? `Desativar ${detail.full_name}? A pessoa perde o acesso ao app e sai das escalas futuras. O histórico é mantido.`
            : ""
        }
        confirmLabel="Desativar"
        tone="danger"
        loading={deactivating}
        onConfirm={() => void confirmDeactivate()}
        onClose={() => setDeactivateOpen(false)}
      />
    </div>
  );
}

function PersonRow({
  person,
  ministries,
  isLeader,
  onOpen,
}: {
  person: PersonLike;
  ministries: { id: string; name: string; color: string }[];
  isLeader: boolean;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="person-row" onClick={onOpen}>
      <Avatar name={person.full_name} color={person.avatar_color} />
      <div className="person-main">
        <div className="person-name">
          {person.full_name}
          <RoleBadge role={person.role} />
        </div>
        <div className="person-meta">
          {ministries.length > 0
            ? ministries.map((ministry) => ministry.name).join(" · ")
            : "Sem ministério"}
        </div>
      </div>
      {isLeader && person.phone && (
        <span className="person-phone">{formatPhone(person.phone)}</span>
      )}
      <span className="person-ministries">
        {ministries.slice(0, 2).map((ministry) => (
          <span className="chip" key={ministry.id}>
            <span
              className="chip-dot"
              style={{ background: ministry.color }}
            />
            {ministry.name}
          </span>
        ))}
      </span>
      <span className="person-actions">
        <Icon name="chevronRight" />
      </span>
    </button>
  );
}
