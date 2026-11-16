import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/context/AuthContext";
import { APP_NAME, CHURCH_NAME, IS_DEMO } from "@/lib/config";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Agenda from "@/pages/Agenda";
import Schedules from "@/pages/Schedules";
import People from "@/pages/People";
import Ministries from "@/pages/Ministries";
import Chat from "@/pages/Chat";
import Settings from "@/pages/Settings";
import More from "@/pages/More";

function BrandSplash() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--paper)",
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ textAlign: "center" }}>
        <div className="brand-mark" style={{ margin: "0 auto 12px" }}>
          J
        </div>
        <div className="brand-name" style={{ fontSize: 20 }}>
          {APP_NAME}
        </div>
        <div className="spinner" style={{ margin: "18px auto 0", color: "var(--pine)" }} />
      </div>
    </div>
  );
}

function AccountHold({ active }: { active: boolean }) {
  const { signOut, user } = useAuth();
  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">
            J
          </div>
          <div>
            <div className="auth-brand-name">{APP_NAME}</div>
            <div className="auth-brand-sub">{CHURCH_NAME}</div>
          </div>
        </div>
        <div>
          <p className="auth-quote">
            Um só corpo, <em>muitos dons</em>.
          </p>
          <p className="auth-ref">1 Coríntios 12:12</p>
        </div>
        <div className="auth-aside-foot">
          <span>Escalas com propósito</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <div className="brand-mark">J</div>
            <div>
              <div className="brand-name">{APP_NAME}</div>
              <div className="brand-sub">{CHURCH_NAME}</div>
            </div>
          </div>
          <div className="empty-icon" style={{ marginBottom: 16 }}>
            <Icon name="lock" />
          </div>
          <h1 className="auth-title">
            {active ? "Acesso em análise" : "Conta desativada"}
          </h1>
          <p className="auth-sub">
            {active
              ? "Seu cadastro foi recebido e está aguardando a aprovação de um líder. Assim que for liberado, você poderá ver escalas e conversar no chat."
              : "Esta conta foi desativada por um líder. Se precisar voltar a servir, fale com a liderança da igreja."}
          </p>
          {user && (
            <div className="demo-card" style={{ marginTop: 22 }}>
              <Icon name="user" />
              <p>
                Conectado como <strong>{user.full_name}</strong>
                {user.email ? ` · ${user.email}` : ""}
              </p>
            </div>
          )}
          <button
            className="btn btn-secondary btn-block"
            style={{ marginTop: 18 }}
            onClick={() => void signOut()}
          >
            <Icon name="logout" />
            Sair da conta
          </button>
          {IS_DEMO && (
            <p className="auth-note">
              Modo demonstração. Entre com uma persona de líder para explorar o app.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function Protected() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <BrandSplash />;
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  if (user.role === "pending" || !user.active) {
    return <AccountHold active={Boolean(user.active)} />;
  }
  return <Layout />;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <BrandSplash />;
  if (user && user.active && user.role !== "pending") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="card">
      <div className="empty" style={{ padding: "60px 20px" }}>
        <div className="empty-icon">
          <Icon name="search" />
        </div>
        <div className="empty-title">Página não encontrada</div>
        <p className="empty-text">
          O endereço que você abriu não existe ou foi movido.
        </p>
        <Link to="/" className="btn btn-primary">
          Voltar ao painel
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route element={<Protected />}>
        <Route index element={<Dashboard />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="escalas" element={<Schedules />} />
        <Route path="pessoas" element={<People />} />
        <Route path="ministerios" element={<Ministries />} />
        <Route path="chat" element={<Chat />} />
        <Route path="chat/:channelId" element={<Chat />} />
        <Route path="ajustes" element={<Settings />} />
        <Route path="mais" element={<More />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
