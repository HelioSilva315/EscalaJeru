import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  ConfirmDialog,
  CopyButton,
  Field,
  FormError,
  PageHeader,
  Switch,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import { useTheme, type ThemePreference } from "@/context/ThemeContext";
import {
  friendlyError,
  IS_DEMO,
  listDemoPersonas,
  regenerateCalendarToken,
  resetDemo,
  roleLabel,
  switchDemoPersona,
  updateMyProfile,
} from "@/lib/api";
import { CHURCH_NAME } from "@/lib/config";
import { formatPhone, maskPhoneInput, normalizePhoneBR } from "@/lib/phone";
import { calendarFeedUrl } from "@/lib/ics";
import { useInstallPrompt } from "@/lib/useInstall";
import type { DirectoryPerson } from "@/lib/types";
import { hasErrors, normalizeName, validatePerson, type Errors } from "@/lib/validation";

export default function Settings() {
  const { user, isDemo, isLeader, refreshUser, signOut } = useAuth();
  const { refresh } = useAppData();
  const { preference, setPreference } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { canInstall, installed, install } = useInstallPrompt();

  const [name, setName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(
    user?.phone ? maskPhoneInput(user.phone) : "",
  );
  const [birthDate, setBirthDate] = useState(user?.birth_date ?? "");
  const [whatsapp, setWhatsapp] = useState(user?.notify_whatsapp ?? true);
  const [sms, setSms] = useState(user?.notify_sms ?? false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [personas, setPersonas] = useState<DirectoryPerson[]>([]);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.full_name);
    setPhone(user.phone ? maskPhoneInput(user.phone) : "");
    setBirthDate(user.birth_date ?? "");
    setWhatsapp(user.notify_whatsapp);
    setSms(user.notify_sms);
  }, [user]);

  useEffect(() => {
    if (!IS_DEMO) return;
    void listDemoPersonas()
      .then(setPersonas)
      .catch(() => undefined);
  }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const validation = validatePerson({
      full_name: normalizeName(name),
      phone: normalizePhoneBR(phone) ?? phone,
      email: user.email ?? undefined,
      role: user.role === "leader" ? "leader" : "member",
      birth_date: birthDate || null,
    });
    setErrors(validation);
    if (hasErrors(validation)) return;

    setSaving(true);
    setFormError("");
    try {
      await updateMyProfile({
        full_name: normalizeName(name),
        phone: normalizePhoneBR(phone) ?? user.phone,
        birth_date: birthDate || null,
        notify_whatsapp: whatsapp,
        notify_sms: sms,
      });
      await Promise.all([refreshUser(), refresh()]);
      toast("Preferências salvas", "success");
    } catch (error) {
      setFormError(friendlyError(error));
    } finally {
      setSaving(false);
    }
  }

  async function changePersona(id: string) {
    try {
      await switchDemoPersona(id);
      await refreshUser();
      await refresh();
      toast("Persona alterada", "success");
      navigate("/");
    } catch (error) {
      toast(friendlyError(error), "error");
    }
  }

  async function doReset() {
    setResetting(true);
    try {
      await resetDemo();
      await refreshUser();
      await refresh();
      setResetOpen(false);
      toast("Dados de exemplo restaurados");
      navigate("/");
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setResetting(false);
    }
  }

  async function rotateToken() {
    setRotating(true);
    try {
      await regenerateCalendarToken();
      await refreshUser();
      setTokenOpen(false);
      toast("Novo link gerado. Atualize a assinatura no seu calendário.");
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setRotating(false);
    }
  }

  async function doSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  if (!user) return null;

  const feedUrl = calendarFeedUrl(user.calendar_token);
  const themes: { value: ThemePreference; label: string; icon: "sun" | "moon" | "settings" }[] = [
    { value: "light", label: "Claro", icon: "sun" },
    { value: "dark", label: "Escuro", icon: "moon" },
    { value: "system", label: "Sistema", icon: "settings" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Ajustes"
        title="Sua conta e preferências"
        subtitle="Mantenha seu contato em dia para receber os avisos da escala no tempo certo."
      />

      <div className="settings-grid stagger">
        <section className="card">
          <div className="profile-line">
            <Avatar name={user.full_name} color={user.avatar_color} size="lg" />
            <div className="profile-line-main">
              <div className="profile-line-name">{user.full_name}</div>
              <div className="profile-line-role">
                {roleLabel(user.role)} · {CHURCH_NAME}
              </div>
            </div>
          </div>

          <form onSubmit={saveProfile} noValidate>
            <Field label="Nome completo" error={errors.full_name} htmlFor="set-name">
              <input
                id="set-name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
              />
            </Field>

            <div className="form-grid" style={{ marginTop: 14 }}>
              <Field
                label="Celular com DDD"
                hint="Obrigatório"
                error={errors.phone}
                htmlFor="set-phone"
              >
                <input
                  id="set-phone"
                  className="input"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(maskPhoneInput(event.target.value))}
                  placeholder="(11) 91234-5678"
                  autoComplete="tel"
                />
              </Field>
              <Field
                label="Aniversário"
                hint="Opcional"
                error={errors.birth_date}
                htmlFor="set-birth"
              >
                <input
                  id="set-birth"
                  className="input"
                  type="date"
                  value={birthDate}
                  onChange={(event) => setBirthDate(event.target.value)}
                />
              </Field>
            </div>

            <div className="form-section">
              <div className="form-section-title">Como você quer ser avisado</div>
              <div className="form-section-sub">
                Enviamos o lembrete da escala com até 24 horas de antecedência.
              </div>

              <div className="setting-row">
                <div className="setting-main">
                  <div className="setting-title">WhatsApp</div>
                  <div className="setting-desc">
                    {formatPhone(normalizePhoneBR(phone) ?? user.phone)}
                  </div>
                </div>
                <Switch
                  checked={whatsapp}
                  onChange={setWhatsapp}
                  label={whatsapp ? "Ativo" : "Desligado"}
                />
              </div>

              <div className="setting-row">
                <div className="setting-main">
                  <div className="setting-title">SMS</div>
                  <div className="setting-desc">
                    Alternativa quando o WhatsApp não estiver disponível.
                  </div>
                </div>
                <Switch
                  checked={sms}
                  onChange={setSms}
                  label={sms ? "Ativo" : "Desligado"}
                />
              </div>
            </div>

            {formError && <FormError message={formError} />}

            <div className="form-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setName(user.full_name);
                  setPhone(maskPhoneInput(user.phone));
                  setBirthDate(user.birth_date ?? "");
                  setWhatsapp(user.notify_whatsapp);
                  setSms(user.notify_sms);
                  setErrors({});
                  setFormError("");
                }}
              >
                Desfazer
              </button>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? <span className="spinner" /> : <Icon name="check" />}
                Salvar alterações
              </button>
            </div>
          </form>
        </section>

        <div className="stack-20">
          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title card-title-sm">Aparência</h2>
                <p className="card-sub">Escolha como o app fica no seu aparelho</p>
              </div>
            </div>
            <div className="theme-options">
              {themes.map((theme) => (
                <button
                  key={theme.value}
                  type="button"
                  className={`theme-option ${preference === theme.value ? "active" : ""}`}
                  onClick={() => setPreference(theme.value)}
                  aria-pressed={preference === theme.value}
                >
                  <Icon name={theme.icon} />
                  {theme.label}
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title card-title-sm">Agenda no celular</h2>
                <p className="card-sub">Google Agenda, Apple Calendar e Outlook</p>
              </div>
            </div>
            <p className="tiny muted" style={{ lineHeight: 1.55 }}>
              Assine este endereço uma única vez para receber os encontros da{" "}
              {CHURCH_NAME} com lembrete de 24 horas.
            </p>
            {feedUrl ? (
              <>
                <div className="copy-box" style={{ marginTop: 12 }}>
                  <span>{feedUrl}</span>
                  <CopyButton value={feedUrl} label="Copiar" small />
                </div>
                <div className="row wrap" style={{ marginTop: 10, gap: 8 }}>
                  <a
                    className="btn btn-secondary btn-sm"
                    href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl.replace(/^https?:\/\//, "webcal://"))}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon name="calendar" />
                    Adicionar ao Google Agenda
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTokenOpen(true)}
                  >
                    <Icon name="refresh" />
                    Gerar novo link
                  </button>
                </div>
              </>
            ) : (
              <div className="demo-card" style={{ marginTop: 12 }}>
                <Icon name="info" />
                <p>
                  O link individual da agenda é gerado quando o app está conectado
                  ao servidor da igreja. No modo demonstração, use a exportação
                  .ics na tela de Agenda.
                </p>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h2 className="card-title card-title-sm">Aplicativo</h2>
                <p className="card-sub">Instale para abrir direto da tela inicial</p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={async () => {
                const ok = await install();
                if (!ok) {
                  toast(
                    "Se o botão não aparecer, use o menu do navegador e escolha “Instalar aplicativo”.",
                  );
                }
              }}
              disabled={!canInstall || installed}
            >
              <Icon name={installed ? "check" : "install"} />
              {installed ? "Já instalado neste aparelho" : "Instalar EscalaJeru"}
            </button>
            {!canInstall && !installed && (
              <p className="tiny faint" style={{ marginTop: 9, lineHeight: 1.5 }}>
                No iPhone: toque em Compartilhar → “Adicionar à Tela de Início”. No
                Android: menu ⋮ → “Instalar aplicativo”.
              </p>
            )}
          </section>
        </div>

        {(isDemo || isLeader) && (
          <section className="card full">
            <div className="card-head">
              <div>
                <h2 className="card-title card-title-sm">
                  {IS_DEMO ? "Modo demonstração" : "Privacidade e acesso"}
                </h2>
                <p className="card-sub">
                  {IS_DEMO
                    ? "Explore o app como líder ou membro, sem enviar dados para servidores."
                    : "O que acontece com os seus dados e como sair com segurança."}
                </p>
              </div>
            </div>

            {IS_DEMO && personas.length > 0 && (
              <div className="setting-row" style={{ alignItems: "flex-start" }}>
                <div className="setting-main">
                  <div className="setting-title">Ver como</div>
                  <div className="setting-desc">
                    Alterne entre as personas de exemplo para conhecer cada visão.
                  </div>
                </div>
                <div className="row wrap" style={{ justifyContent: "flex-end" }}>
                  {personas.map((persona) => (
                    <button
                      key={persona.id}
                      type="button"
                      className={`btn btn-sm ${
                        persona.id === user.id ? "btn-primary" : "btn-secondary"
                      }`}
                      onClick={() => void changePersona(persona.id)}
                    >
                      {persona.full_name.split(" ")[0]}
                      <span className="tiny">
                        {persona.role === "leader" ? "· líder" : "· membro"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {IS_DEMO && (
              <div className="setting-row">
                <div className="setting-main">
                  <div className="setting-title">Restaurar dados de exemplo</div>
                  <div className="setting-desc">
                    Volta ao estado inicial, descartando as alterações feitas na
                    demonstração.
                  </div>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setResetOpen(true)}
                >
                  <Icon name="refresh" />
                  Restaurar
                </button>
              </div>
            )}

            <div className="setting-row">
              <div className="setting-main">
                <div className="setting-title">Telefone e notificações</div>
                <div className="setting-desc">
                  Seu número é usado apenas para avisos da igreja. Você pode desligar
                  os avisos automáticos quando quiser.
                </div>
              </div>
              <span className="setting-value">
                {formatPhone(normalizePhoneBR(phone) ?? user.phone)}
              </span>
            </div>

            <div className="setting-row">
              <div className="setting-main">
                <div className="setting-title">Encerrar sessão</div>
                <div className="setting-desc">
                  Use um aparelho compartilhado? Saia ao terminar.
                </div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => void doSignOut()}
                disabled={signingOut}
              >
                <Icon name="logout" />
                Sair
              </button>
            </div>
          </section>
        )}

        <div className="full signature" style={{ marginTop: 4 }}>
          <span>
            EscalaJeru · {CHURCH_NAME}
          </span>
          <em>Feito para servir melhor.</em>
        </div>
      </div>

      <ConfirmDialog
        open={tokenOpen}
        title="Gerar um novo link da agenda"
        text="O endereço atual deixa de funcionar imediatamente. Será preciso assinar o novo link no Google Agenda, Apple Calendar ou Outlook."
        confirmLabel="Gerar novo link"
        loading={rotating}
        onConfirm={() => void rotateToken()}
        onClose={() => setTokenOpen(false)}
      />

      <ConfirmDialog
        open={resetOpen}
        title="Restaurar demonstração"
        text="Todas as alterações feitas no modo demonstração serão descartadas e o conteúdo de exemplo voltará ao início."
        confirmLabel="Restaurar"
        loading={resetting}
        onConfirm={() => void doReset()}
        onClose={() => setResetOpen(false)}
      />
    </div>
  );
}
