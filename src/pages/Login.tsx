import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Field, FormError, useToast } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import {
  acceptInvite,
  demoSignIn,
  friendlyError,
  IS_DEMO,
  needsBootstrap,
  resetPassword,
  signIn,
  signUpFirstLeader,
} from "@/lib/api";
import { APP_NAME, CHURCH_NAME, VERSE } from "@/lib/config";
import { maskPhoneInput } from "@/lib/phone";
import { validatePassword } from "@/lib/validation";

type Mode = "login" | "invite" | "bootstrap" | "reset";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser, user } = useAuth();
  const { toast } = useToast();
  const { resolved, toggle } = useTheme();
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");

  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from !== "/login"
      ? (location.state as { from: string }).from
      : "/";

  useEffect(() => {
    let alive = true;
    if (!IS_DEMO) {
      void needsBootstrap().then((first) => {
        if (alive && first) setMode("bootstrap");
      });
    }
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setError("");
    setInfo("");
  }, [mode]);

  useEffect(() => {
    if (user?.role === "pending") {
      setError("Sua conta está aguardando a aprovação de um líder.");
    }
  }, [user]);

  function goHome() {
    navigate(from, { replace: true });
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim() || !password) {
      setError("Preencha e-mail e senha.");
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      await refreshUser();
      goHome();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleBootstrap(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    if (name.trim().split(/\s+/).length < 2) {
      setError("Informe seu nome completo.");
      return;
    }
    const passError = validatePassword(password);
    if (passError) {
      setError(passError);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Informe um e-mail válido.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Informe um celular com DDD.");
      return;
    }
    setBusy(true);
    try {
      const result = await signUpFirstLeader({
        full_name: name,
        phone,
        email,
        password,
      });
      if (result.needsConfirmation) {
        setInfo(
          "Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre com a senha.",
        );
        setMode("login");
      } else {
        await refreshUser();
        goHome();
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    if (code.trim().length < 6) {
      setError("Informe o código de convite que você recebeu.");
      return;
    }
    const passError = validatePassword(password);
    if (passError) {
      setError(passError);
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setBusy(true);
    try {
      const inviteEmail = await acceptInvite(code, password);
      await signIn(inviteEmail, password);
      await refreshUser();
      toast("Bem-vindo(a)! Sua conta está ativa.", "success");
      goHome();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Informe o e-mail da sua conta.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email.trim());
      setInfo("Se este e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function demoEnter(persona: string) {
    setBusy(true);
    setError("");
    try {
      await demoSignIn(persona);
      await refreshUser();
      navigate("/", { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, { title: string; sub: string }> = {
    login: {
      title: "Bem-vindo de volta",
      sub: "Entre para ver sua escala, a agenda da igreja e conversar com a equipe.",
    },
    bootstrap: {
      title: "Comece por aqui",
      sub: "Crie a conta do administrador principal. Depois, cadastre os líderes e membros.",
    },
    invite: {
      title: "Ative seu convite",
      sub: "Você recebeu um código de um líder. Escolha uma senha para ativar seu acesso.",
    },
    reset: {
      title: "Recuperar acesso",
      sub: "Informe o e-mail da sua conta e enviaremos um link seguro para redefinir a senha.",
    },
  };

  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">
            <img src="/icons/logo.png" alt="" width={40} height={40} />
          </div>
          <div>
            <div className="auth-brand-name">{APP_NAME}</div>
            <div className="auth-brand-sub">{CHURCH_NAME}</div>
          </div>
        </div>

        <div>
          <p className="auth-quote">
            Servi ao Senhor <em>com alegria</em>.
          </p>
          <p className="auth-ref">{VERSE.ref}</p>
        </div>

        <div className="auth-aside-foot">
          <span>Escalas com propósito</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <div className="brand-mark">
              <img src="/icons/logo.png" alt="" width={34} height={34} />
            </div>
            <div>
              <div className="brand-name">{APP_NAME}</div>
              <div className="brand-sub">{CHURCH_NAME}</div>
            </div>
            <button
              type="button"
              className="btn-icon"
              style={{ marginLeft: "auto" }}
              onClick={toggle}
              aria-label={resolved === "dark" ? "Usar tema claro" : "Usar tema escuro"}
            >
              <Icon name={resolved === "dark" ? "sun" : "moon"} />
            </button>
          </div>

          <h1 className="auth-title">{titles[mode].title}</h1>
          <p className="auth-sub">{titles[mode].sub}</p>

          {mode === "login" && (
            <form className="auth-form" onSubmit={handleLogin} noValidate>
              <Field label="E-mail" htmlFor="login-email">
                <input
                  id="login-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@email.com"
                  data-autofocus
                />
              </Field>
              <Field label="Senha" htmlFor="login-password">
                <input
                  id="login-password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Sua senha"
                />
              </Field>

              {error && <FormError message={error} />}
              {info && <div className="form-ok">{info}</div>}

              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 18 }}
                disabled={busy}
              >
                {busy ? <span className="spinner" /> : "Entrar"}
              </button>

              <div className="auth-links">
                <button
                  type="button"
                  className="link"
                  style={{ background: "none" }}
                  onClick={() => setMode("reset")}
                >
                  Esqueci minha senha
                </button>
                <button
                  type="button"
                  className="link"
                  style={{ background: "none" }}
                  onClick={() => setMode("invite")}
                >
                  Ativar convite
                </button>
              </div>
            </form>
          )}

          {mode === "bootstrap" && (
            <form className="auth-form" onSubmit={handleBootstrap} noValidate>
              <div className="demo-card" style={{ marginTop: 0, marginBottom: 16 }}>
                <Icon name="shield" />
                <p>
                  Este é o primeiro acesso ao sistema. A conta criada aqui será a
                  conta de <strong>líder principal</strong> e poderá cadastrar os
                  demais líderes e membros.
                </p>
              </div>
              <Field label="Nome completo" htmlFor="boot-name">
                <input
                  id="boot-name"
                  className="input"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Como no documento"
                  data-autofocus
                />
              </Field>
              <Field
                label="Celular com DDD"
                htmlFor="boot-phone"
                hint="Usado para avisos da escala"
              >
                <input
                  id="boot-phone"
                  className="input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(maskPhoneInput(event.target.value))}
                  placeholder="(11) 91234-5678"
                />
              </Field>
              <Field label="E-mail" htmlFor="boot-email">
                <input
                  id="boot-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@email.com"
                />
              </Field>
              <Field
                label="Senha"
                htmlFor="boot-pass"
                hint="Mínimo 8 caracteres, com letra e número"
              >
                <input
                  id="boot-pass"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Crie uma senha segura"
                />
              </Field>

              {error && <FormError message={error} />}
              {info && <div className="form-ok">{info}</div>}

              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 18 }}
                disabled={busy}
              >
                {busy ? <span className="spinner" /> : "Criar conta de administrador"}
              </button>

              <div className="auth-links">
                <button
                  type="button"
                  className="link"
                  style={{ background: "none" }}
                  onClick={() => setMode("login")}
                >
                  Já tenho uma conta
                </button>
              </div>
            </form>
          )}

          {mode === "invite" && (
            <form className="auth-form" onSubmit={handleInvite} noValidate>
              <Field
                label="Código do convite"
                htmlFor="invite-code"
                hint="Enviado pelo líder"
              >
                <input
                  id="invite-code"
                  className="input mono"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                  }
                  placeholder="Ex.: JERU7K2M"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  style={{ letterSpacing: "0.14em", fontWeight: 600 }}
                  data-autofocus
                />
              </Field>
              <Field
                label="Crie sua senha"
                htmlFor="invite-pass"
                hint="Mínimo 8 caracteres"
              >
                <input
                  id="invite-pass"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Senha com letra e número"
                />
              </Field>
              <Field label="Confirme a senha" htmlFor="invite-confirm">
                <input
                  id="invite-confirm"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Repita a senha"
                />
              </Field>

              {error && <FormError message={error} />}
              {info && <div className="form-ok">{info}</div>}

              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 18 }}
                disabled={busy}
              >
                {busy ? <span className="spinner" /> : "Ativar meu acesso"}
              </button>

              <div className="auth-links">
                <button
                  type="button"
                  className="link"
                  style={{ background: "none" }}
                  onClick={() => setMode("login")}
                >
                  Voltar para o login
                </button>
              </div>
            </form>
          )}

          {mode === "reset" && (
            <form className="auth-form" onSubmit={handleReset} noValidate>
              <Field label="E-mail da conta" htmlFor="reset-email">
                <input
                  id="reset-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@email.com"
                  data-autofocus
                />
              </Field>

              {error && <FormError message={error} />}
              {info && <div className="form-ok">{info}</div>}

              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 18 }}
                disabled={busy}
              >
                {busy ? <span className="spinner" /> : "Enviar link de recuperação"}
              </button>

              <div className="auth-links">
                <button
                  type="button"
                  className="link"
                  style={{ background: "none" }}
                  onClick={() => setMode("login")}
                >
                  Voltar para o login
                </button>
              </div>
            </form>
          )}

          {IS_DEMO && (
            <div className="demo-card">
              <Icon name="sparkle" />
              <div>
                <p>
                  <strong>Modo demonstração.</strong> Navegue com dados de exemplo.
                  Nada é enviado para servidores.
                </p>
                <div className="row wrap" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void demoEnter("p-ana")}
                    disabled={busy}
                  >
                    Entrar na demonstração
                  </button>
                </div>
              </div>
            </div>
          )}

          <p className="auth-note">
            Ao entrar, você concorda com o uso responsável dos dados da igreja.
            Telefones são usados apenas para avisos de escala e contato da liderança.
          </p>
        </div>
      </main>
    </div>
  );
}
