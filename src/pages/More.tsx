import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar, PageHeader, useToast } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import { roleLabel } from "@/lib/api";
import { APP_NAME, APP_VERSION, CHURCH_NAME, VERSE } from "@/lib/config";
import { useInstallPrompt } from "@/lib/useInstall";

interface LinkRow {
  to: string;
  icon: IconName;
  title: string;
  sub: string;
  leaderOnly?: boolean;
}

const LINKS: LinkRow[] = [
  {
    to: "/pessoas",
    icon: "people",
    title: "Pessoas",
    sub: "Líderes, membros e contatos",
  },
  {
    to: "/ministerios",
    icon: "ministries",
    title: "Ministérios",
    sub: "Equipes, líderes e canais de conversa",
  },
  {
    to: "/escalas",
    icon: "scales",
    title: "Escalas",
    sub: "Quem serve em cada encontro",
  },
  {
    to: "/agenda",
    icon: "calendar",
    title: "Agenda",
    sub: "Cultos, ensaios e reuniões",
  },
  {
    to: "/ajustes",
    icon: "settings",
    title: "Ajustes",
    sub: "Perfil, telefone, tema e instalação",
  },
];

export default function More() {
  const { user, isLeader, isDemo, signOut } = useAuth();
  const { ministries, directory, unreadChat } = useAppData();
  const { canInstall, installed, install } = useInstallPrompt();
  const navigate = useNavigate();
  const { toast } = useToast();

  if (!user) return null;

  return (
    <div>
      <PageHeader
        eyebrow="Mais"
        title="Tudo em um só lugar"
        subtitle="Atalhos para a comunidade, os ministérios e as configurações do app."
      />

      <div className="stack-16 stagger">
        <button
          type="button"
          className="card"
          style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 14 }}
          onClick={() => navigate("/ajustes")}
        >
          <Avatar name={user.full_name} color={user.avatar_color} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="strong" style={{ fontSize: 15 }}>
              {user.full_name}
            </div>
            <div className="tiny muted">
              {roleLabel(user.role)} · {CHURCH_NAME}
              {isDemo ? " · demonstração" : ""}
            </div>
          </div>
          <Icon name="chevronRight" />
        </button>

        <div className="stats">
          <div className="stat">
            <div className="stat-value">{directory.length}</div>
            <div className="stat-label">Pessoas na igreja</div>
          </div>
          <div className="stat">
            <div className="stat-value">{ministries.length}</div>
            <div className="stat-label">Ministérios ativos</div>
          </div>
          <div className="stat">
            <div className="stat-value">{unreadChat}</div>
            <div className="stat-label">Mensagens não lidas</div>
          </div>
        </div>

        <section className="card more-list">
          {LINKS.filter((link) => !link.leaderOnly || isLeader).map((link) => (
            <button
              key={link.to}
              type="button"
              className="more-row"
              onClick={() => navigate(link.to)}
            >
              <span className="more-row-icon">
                <Icon name={link.icon} />
              </span>
              <span className="more-row-main">
                <span className="more-row-title" style={{ display: "block" }}>
                  {link.title}
                </span>
                <span className="more-row-sub" style={{ display: "block" }}>
                  {link.sub}
                </span>
              </span>
              <Icon name="chevronRight" />
            </button>
          ))}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title card-title-sm">Instalar no celular</h2>
              <p className="card-sub">Abre como app, sem passar pela loja</p>
            </div>
          </div>
          <p className="tiny muted" style={{ lineHeight: 1.55 }}>
            {installed
              ? "Este aparelho já está usando o EscalaJeru instalado. Tudo pronto."
              : "Adicione à tela de início para receber os lembretes e abrir o app com um toque."}
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ marginTop: 12 }}
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
            {installed ? "Instalado" : "Instalar"}
          </button>
        </section>

        <section className="verse-card">
          <p className="verse-text">“{VERSE.text}”</p>
          <p className="verse-ref">{VERSE.ref}</p>
        </section>

        <section className="card">
          <button
            type="button"
            className="more-row"
            onClick={() => {
              void signOut().then(() => navigate("/login", { replace: true }));
            }}
          >
            <span className="more-row-icon">
              <Icon name="logout" />
            </span>
            <span className="more-row-main">
              <span className="more-row-title" style={{ display: "block" }}>
                Sair da conta
              </span>
              <span className="more-row-sub" style={{ display: "block" }}>
                Encerrar a sessão neste aparelho
              </span>
            </span>
            <Icon name="chevronRight" />
          </button>
        </section>

        <p className="tiny faint" style={{ textAlign: "center", lineHeight: 1.6 }}>
          {APP_NAME} {APP_VERSION} · {CHURCH_NAME}
          <br />
          Escalas com propósito.
        </p>
      </div>
    </div>
  );
}
