import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Field, FormError, useToast } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { changePassword, friendlyError } from "@/lib/api";
import { validatePassword } from "@/lib/validation";

export default function ChangePassword() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
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
      await changePassword(password);
      await refreshUser();
      toast("Senha alterada com sucesso.", "success");
      navigate("/", { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Segurança</div>
        <h1>Trocar senha</h1>
        <p className="page-sub">
          {user.must_change_password
            ? "Por segurança, defina uma nova senha para continuar usando o app."
            : "Atualize sua senha de acesso."}
        </p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Field label="Nova senha" htmlFor="cp-pass" hint="Mínimo 8 caracteres, com letra e número">
          <input
            id="cp-pass"
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Crie uma senha segura"
            data-autofocus
          />
        </Field>
        <Field label="Confirme a nova senha" htmlFor="cp-confirm">
          <input
            id="cp-confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Repita a senha"
          />
        </Field>

        {error && <FormError message={error} />}

        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 18 }}
          disabled={busy}
          type="submit"
        >
          {busy ? <span className="spinner" /> : <Icon name="check" />}
          Salvar nova senha
        </button>
      </form>
    </div>
  );
}