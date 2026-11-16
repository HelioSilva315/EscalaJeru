import { useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import { useTheme } from "@/context/ThemeContext";
import { APP_NAME, CHURCH_NAME } from "@/lib/config";
import { formatRelativeTime } from "@/lib/dates";
import { roleLabel } from "@/lib/api";
import type { AppNotification } from "@/lib/types";
import { Avatar, EmptyState, Modal } from "@/components/ui";
import { Icon, type IconName } from "@/components/Icon";

const MAIN_NAV: {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}[] = [
  { to: "/", label: "Painel", icon: "home", end: true },
  { to: "/agenda", label: "Agenda", icon: "calendar" },
  { to: "/escalas", label: "Escalas", icon: "scales" },
  { to: "/chat", label: "Chat", icon: "chat" },
];

const COMMUNITY_NAV: {
  to: string;
  label: string;
  icon: IconName;
}[] = [
  { to: "/pessoas", label: "Pessoas", icon: "people" },
  { to: "/ministerios", label: "Ministérios", icon: "ministries" },
];

const BOTTOM_NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "Início", icon: "home", end: true },
  { to: "/agenda", label: "Agenda", icon: "calendar" },
  { to: "/escalas", label: "Escalas", icon: "scales" },
  { to: "/chat", label: "Chat", icon: "chat" },
  { to: "/mais", label: "Mais", icon: "more" },
];

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true">
        <img src="/icons/logo.png" alt="" width={compact ? 26 : 30} height={compact ? 26 : 30} />
      </div>
      <div className="brand-text">
        <div className="brand-name">{APP_NAME}</div>
        <div className="brand-sub">{compact ? CHURCH_NAME : CHURCH_NAME}</div>
      </div>
    </div>
  );
}

function NotificationButton({
  count,
  onClick,
  className = "btn-icon",
}: {
  count: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${className} notif-bell`}
      onClick={onClick}
      aria-label={
        count > 0 ? `Notificações, ${count} não lidas` : "Notificações"
      }
    >
      <Icon name="bell" />
      {count > 0 && <span className="bell-dot" />}
    </button>
  );
}

export function Layout() {
  const { user, signOut, isDemo } = useAuth();
  const {
    notifications,
    unreadNotifications,
    unreadChat,
    readAllNotifications,
    readNotification,
  } = useAppData();
  const { resolved, toggle } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  if (!user) return null;

  const isMoreSection = ["/mais", "/pessoas", "/ministerios", "/ajustes"].includes(
    location.pathname,
  );

  async function openNotification(item: AppNotification) {
    setNotifOpen(false);
    try {
      await readNotification(item.id);
    } catch {
      /* silencioso */
    }
    if (item.link) navigate(item.link);
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

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Ir para o conteúdo
      </a>

      <aside className="rail">
        <Brand />
        <nav className="nav" aria-label="Navegação principal">
          {MAIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.to === "/chat" && unreadChat > 0 && (
                <span className="nav-count">{unreadChat > 9 ? "9+" : unreadChat}</span>
              )}
            </NavLink>
          ))}

          <div className="nav-label">Comunidade</div>
          {COMMUNITY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}

          <div className="nav-label">Conta</div>
          <NavLink
            to="/ajustes"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <Icon name="settings" />
            <span>Ajustes</span>
          </NavLink>
        </nav>

        <div className="rail-foot">
          <div className="rail-tools">
            <NotificationButton
              count={unreadNotifications}
              onClick={() => setNotifOpen(true)}
            />
            <button
              type="button"
              className="btn-icon"
              onClick={toggle}
              aria-label={resolved === "dark" ? "Usar tema claro" : "Usar tema escuro"}
            >
              <Icon name={resolved === "dark" ? "sun" : "moon"} />
            </button>
          </div>
          <button
            type="button"
            className="me-card"
            onClick={() => navigate("/ajustes")}
          >
            <Avatar name={user.full_name} color={user.avatar_color} />
            <div style={{ minWidth: 0 }}>
              <div className="me-name">{user.full_name}</div>
              <div className="me-role">
                {roleLabel(user.role)}
                {isDemo ? " · demonstração" : ""}
              </div>
            </div>
            <Icon name="chevronRight" />
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="content">
          <div className="mobilebar">
            <Brand compact />
            <div className="mobilebar-actions">
              <NotificationButton
                count={unreadNotifications}
                onClick={() => setNotifOpen(true)}
              />
              <button
                type="button"
                className="btn-icon"
                onClick={toggle}
                aria-label={resolved === "dark" ? "Usar tema claro" : "Usar tema escuro"}
              >
                <Icon name={resolved === "dark" ? "sun" : "moon"} />
              </button>
            </div>
          </div>

          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>

          <footer className="signature">
            <span>
              {APP_NAME} · {CHURCH_NAME}
            </span>
            <em>Servir com alegria.</em>
          </footer>
        </div>
      </div>

      <nav className="bottomnav" aria-label="Navegação rápida">
        {BOTTOM_NAV.map((item) => {
          const active =
            item.to === "/mais"
              ? isMoreSection
              : item.end
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);
          return (
            <button
              key={item.to}
              type="button"
              className={`bnav-item ${active ? "active" : ""}`}
              onClick={() => navigate(item.to)}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.to === "/chat" && unreadChat > 0 && (
                <span className="nav-count">{unreadChat > 9 ? "9+" : unreadChat}</span>
              )}
            </button>
          );
        })}
      </nav>

      <Modal
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        title="Notificações"
        subtitle={
          unreadNotifications > 0
            ? `${unreadNotifications} não ${unreadNotifications === 1 ? "lida" : "lidas"}`
            : "Tudo em dia por aqui."
        }
      >
        {notifications.length === 0 ? (
          <EmptyState
            icon="bell"
            title="Nenhuma notificação"
            text="Quando você for escalado ou receber uma mensagem importante, aparece aqui."
          />
        ) : (
          <>
            {unreadNotifications > 0 && (
              <div className="row-between" style={{ marginBottom: 8 }}>
                <span className="tiny muted">Recentes</span>
                <button
                  className="link"
                  style={{ fontSize: 11.5, background: "none" }}
                  onClick={() => void readAllNotifications()}
                >
                  Marcar todas como lidas
                </button>
              </div>
            )}
            <div className="notif-list">
              {notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="notif-item"
                  style={{ textAlign: "left", width: "100%" }}
                  onClick={() => void openNotification(item)}
                >
                  <span className="notif-icon">
                    <Icon
                      name={item.link?.includes("/chat") ? "chat" : "scales"}
                    />
                  </span>
                  <span className="notif-main">
                    <span className="notif-title" style={{ display: "block" }}>
                      {item.title}
                    </span>
                    {item.body && (
                      <span className="notif-text" style={{ display: "block" }}>
                        {item.body}
                      </span>
                    )}
                    <span className="notif-time" style={{ display: "block" }}>
                      {formatRelativeTime(item.created_at)}
                    </span>
                  </span>
                  {!item.read_at && <span className="notif-unread" />}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="form-actions">
          <button
            className="btn btn-ghost"
            onClick={async () => {
              setNotifOpen(false);
              await doSignOut();
            }}
            disabled={signingOut}
          >
            <Icon name="logout" />
            Sair da conta
          </button>
          <button className="btn btn-secondary" onClick={() => setNotifOpen(false)}>
            Fechar
          </button>
        </div>
      </Modal>
    </div>
  );
}
