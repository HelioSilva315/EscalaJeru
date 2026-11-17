import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";
import type { ScheduleStatus } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */
type ToastKind = "default" | "error" | "success";
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<{
  toast: (message: string, kind?: ToastKind) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = "default") => {
    const id = ++counter.current;
    setItems((current) => [...current.slice(-2), { id, message, kind }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast ${item.kind}`}>
            <Icon
              name={item.kind === "error" ? "alert" : item.kind === "success" ? "check" : "info"}
              size={15}
            />
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast deve ser usado dentro de ToastProvider");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Modal / bottom sheet                                                */
/* ------------------------------------------------------------------ */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  icon?: IconName;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
  icon,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        panel.querySelector<HTMLElement>("[data-autofocus]") ||
        panel.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    }, 40);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((node) => node.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        {title && (
          <div className="modal-head">
            <div>
              <h2 className="modal-title" id={titleId}>
                {icon && (
                  <Icon
                    name={icon}
                    size={20}
                    style={{ display: "inline-block", verticalAlign: "-3px", marginRight: 8, color: "var(--pine)" }}
                  />
                )}
                {title}
              </h2>
              {subtitle && <p className="modal-sub">{subtitle}</p>}
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Fechar">
              <Icon name="x" />
            </button>
          </div>
        )}
        {children}
        {footer && <div className="form-actions">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Avatar({
  name,
  color = "#2c5a4b",
  size,
  className = "",
  style,
}: {
  name: string;
  color?: string;
  size?: "sm" | "lg" | "xl";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`avatar ${size ?? ""} ${className}`}
      aria-hidden="true"
      style={{
        background: `color-mix(in srgb, ${color} 16%, var(--surface))`,
        color: `color-mix(in srgb, ${color} 72%, var(--ink))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 22%, transparent)`,
        ...style,
      }}
    >
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */
export function StatusBadge({ status }: { status: ScheduleStatus }) {
  if (status === "confirmed") {
    return (
      <span className="badge badge-success badge-dot">Confirmado</span>
    );
  }
  if (status === "declined") {
    return <span className="badge badge-danger badge-dot">Não poderá</span>;
  }
  return <span className="badge badge-gold badge-dot">Pendente</span>;
}

export function RoleBadge({ role }: { role: string }) {
  if (role === "leader") {
    return <span className="role-tag">Líder</span>;
  }
  if (role === "pending") {
    return <span className="badge badge-neutral">Aguardando</span>;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Campos                                                              */
/* ------------------------------------------------------------------ */
export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className = "",
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={`field ${className}`}>
      <label htmlFor={htmlFor}>
        <span>{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </label>
      {children}
      {error && (
        <span className="field-error">
          <Icon name="alert" size={13} />
          {error}
        </span>
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="switch-track" />
      <span className="switch-label">{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control                                                   */
/* ------------------------------------------------------------------ */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "active" : ""}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cabeçalho                                                           */
/* ------------------------------------------------------------------ */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Estado vazio / carregamento                                         */
/* ------------------------------------------------------------------ */
export function EmptyState({
  icon = "sparkle",
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} />
      </div>
      <div className="empty-title">{title}</div>
      {text && <p className="empty-text">{text}</p>}
      {action}
    </div>
  );
}

export function LoadingBlock({ label = "Carregando" }: { label?: string }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <div className="spinner" style={{ color: "var(--pine)" }} />
      <p className="empty-text" style={{ marginTop: 12 }}>
        {label}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Busca                                                               */
/* ------------------------------------------------------------------ */
export function SearchField({
  value,
  onChange,
  placeholder = "Buscar",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-wrap">
      <Icon name="search" />
      <input
        className="input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Botão de copiar                                                     */
/* ------------------------------------------------------------------ */
export function CopyButton({
  value,
  label = "Copiar",
  small,
}: {
  value: string;
  label?: string;
  small?: boolean;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast("Copiado para a área de transferência", "success");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Não foi possível copiar. Selecione o texto manualmente.", "error");
    }
  }

  return (
    <button
      type="button"
      className={small ? "btn btn-secondary btn-sm" : "btn btn-secondary"}
      onClick={copy}
    >
      <Icon name={copied ? "check" : "copy"} />
      {copied ? "Copiado" : label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmação                                                         */
/* ------------------------------------------------------------------ */
export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = "Confirmar",
  tone = "primary",
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>{text}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Formulário auxiliar                                                 */
/* ------------------------------------------------------------------ */
export function FormError({ message }: { message: string }) {
  return (
    <div className="form-error" role="alert">
      <Icon name="alert" />
      <span>{message}</span>
    </div>
  );
}

export function SubmitButton({
  loading,
  children,
  className = "btn btn-primary",
  onClick,
  type = "submit",
  disabled,
}: {
  loading?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      className={className}
      type={type}
      disabled={loading || disabled}
      onClick={onClick}
    >
      {loading ? <span className="spinner" /> : children}
    </button>
  );
}

export function handleFormSubmit(
  handler: () => void | Promise<void>,
): (event: FormEvent) => void {
  return (event) => {
    event.preventDefault();
    void handler();
  };
}
