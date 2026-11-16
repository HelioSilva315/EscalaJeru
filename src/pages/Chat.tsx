import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";
import {
  Avatar,
  EmptyState,
  LoadingBlock,
  PageHeader,
  useToast,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "@/context/AppDataContext";
import {
  friendlyError,
  listChannels,
  listMessages,
  markChannelRead,
  sendMessage,
  subscribeToMessages,
} from "@/lib/api";
import {
  dayKey,
  formatClock,
  formatRelativeTime,
  friendlyDayLabel,
} from "@/lib/dates";
import type { Channel, Message } from "@/lib/types";

export default function Chat() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { personById, refreshChat } = useAppData();
  const { toast } = useToast();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === channelId) ?? null,
    [channels, channelId],
  );

  /* ---------------- Canais ---------------- */
  const loadChannels = useCallback(async () => {
    try {
      const rows = await listChannels();
      setChannels(rows);
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setLoadingChannels(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  /* Seleciona o primeiro canal quando nenhum foi escolhido */
  useEffect(() => {
    if (!loadingChannels && !channelId && channels.length > 0) {
      navigate(`/chat/${channels[0].id}`, { replace: true });
    }
  }, [loadingChannels, channelId, channels, navigate]);

  /* ---------------- Mensagens ---------------- */
  const loadMessages = useCallback(
    async (id: string) => {
      setLoadingMessages(true);
      try {
        const rows = await listMessages(id);
        setMessages(rows);
        await markChannelRead(id);
        setChannels((current) =>
          current.map((channel) =>
            channel.id === id ? { ...channel, unread_count: 0 } : channel,
          ),
        );
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        setLoadingMessages(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!channelId) {
      setMessages([]);
      return;
    }
    setDraft("");
    void loadMessages(channelId);
  }, [channelId, loadMessages]);

  /* Tempo real */
  useEffect(() => {
    if (!channelId) return;
    return subscribeToMessages(channelId, (incoming) => {
      setMessages((current) =>
        current.some((message) => message.id === incoming.id)
          ? current
          : [...current, incoming],
      );
      if (incoming.sender_id !== user?.id) {
        void markChannelRead(channelId).catch(() => undefined);
      }
    });
  }, [channelId, user?.id]);

  /* Rolagem para o fim */
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, channelId]);

  /* Altura do composer */
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
  }, [draft]);

  const grouped = useMemo(() => {
    const rows: { key: string; label: string; items: Message[] }[] = [];
    for (const message of messages) {
      const key = dayKey(message.created_at);
      const last = rows[rows.length - 1];
      if (last && last.key === key) last.items.push(message);
      else rows.push({ key, label: friendlyDayLabel(key), items: [message] });
    }
    return rows;
  }, [messages]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!channelId || !draft.trim() || sending) return;
    const body = draft.trim();
    setSending(true);
    try {
      const created = await sendMessage(channelId, body);
      setDraft("");
      setMessages((current) =>
        current.some((message) => message.id === created.id)
          ? current
          : [...current, created],
      );
      void refreshChat();
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  if (loadingChannels) {
    return (
      <div>
        <PageHeader eyebrow="Chat" title="Conversas da igreja" />
        <LoadingBlock label="Abrindo as conversas" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Chat"
        title="Conversas da igreja"
        subtitle="Um espaço para combinar detalhes, avisar imprevistos e cuidar uns dos outros."
      />

      <div className={`chat-shell ${channelId ? "thread-open" : ""}`}>
        <aside className="chat-side">
          <div className="chat-side-head">
            <div className="chat-side-title">Canais</div>
            <div className="chat-side-sub">
              {channels.length}{" "}
              {channels.length === 1 ? "conversa disponível" : "conversas disponíveis"}
            </div>
          </div>

          <div className="chat-list">
            {channels.length === 0 && (
              <div className="empty" style={{ padding: "28px 14px" }}>
                <div className="empty-icon">
                  <Icon name="chat" />
                </div>
                <div className="empty-title" style={{ fontSize: 15 }}>
                  Nenhum canal
                </div>
                <p className="empty-text">
                  A liderança ainda não abriu canais de conversa.
                </p>
              </div>
            )}

            {channels.map((channel) => {
              const isActive = channel.id === channelId;
              const preview = channel.last_message;
              const sender = preview ? personById(preview.sender_id) : undefined;
              return (
                <button
                  key={channel.id}
                  type="button"
                  className={`chat-item ${isActive ? "active" : ""}`}
                  onClick={() => navigate(`/chat/${channel.id}`)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span
                    className={`chat-avatar ${channel.kind === "ministry" ? "ministry" : ""}`}
                    style={
                      channel.ministry
                        ? {
                            background: `color-mix(in srgb, ${channel.ministry.color} 14%, var(--surface))`,
                            borderColor: "transparent",
                            color: channel.ministry.color,
                          }
                        : undefined
                    }
                  >
                    <Icon name={channel.kind === "ministry" ? "ministries" : "chat"} />
                  </span>
                  <span className="chat-item-main">
                    <span className="chat-item-name">
                      {channel.name}
                      {(channel.unread_count ?? 0) > 0 && (
                        <span className="nav-count" style={{ marginLeft: "auto" }}>
                          {(channel.unread_count ?? 0) > 9
                            ? "9+"
                            : channel.unread_count}
                        </span>
                      )}
                    </span>
                    <span className="chat-item-preview">
                      {preview
                        ? `${sender?.full_name.split(" ")[0] ?? "Alguém"}: ${preview.body}`
                        : "Sem mensagens ainda"}
                    </span>
                  </span>
                  {preview && (
                    <span className="chat-item-time">
                      {formatRelativeTime(preview.created_at)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="chat-main">
          {activeChannel ? (
            <>
              <header className="chat-head">
                <button
                  type="button"
                  className="chat-back"
                  onClick={() => navigate("/chat")}
                  aria-label="Voltar para os canais"
                >
                  <Icon name="arrowLeft" />
                </button>
                <span
                  className="chat-avatar"
                  style={
                    activeChannel.ministry
                      ? {
                          background: `color-mix(in srgb, ${activeChannel.ministry.color} 14%, var(--surface))`,
                          borderColor: "transparent",
                          color: activeChannel.ministry.color,
                        }
                      : undefined
                  }
                >
                  <Icon
                    name={activeChannel.kind === "ministry" ? "ministries" : "chat"}
                  />
                </span>
                <div className="chat-head-main">
                  <div className="chat-head-name">{activeChannel.name}</div>
                  <div className="chat-head-sub">
                    {activeChannel.kind === "ministry"
                      ? "Canal do ministério"
                      : "Avisos para toda a igreja"}
                  </div>
                </div>
              </header>

              <div className="chat-body" ref={bodyRef}>
                {loadingMessages && messages.length === 0 ? (
                  <LoadingBlock label="Carregando mensagens" />
                ) : messages.length === 0 ? (
                  <div className="chat-empty-thread">
                    <div>
                      <div className="empty-icon">
                        <Icon name="chat" />
                      </div>
                      <div className="empty-title">Comece a conversa</div>
                      <p className="empty-text">
                        Escreva a primeira mensagem para a equipe de{" "}
                        {activeChannel.name}.
                      </p>
                    </div>
                  </div>
                ) : (
                  grouped.map((group) => (
                    <div key={group.key}>
                      <div className="chat-day">{group.label}</div>
                      {group.items.map((message, index) => {
                        const mine = message.sender_id === user?.id;
                        const author = personById(message.sender_id);
                        const previous = group.items[index - 1];
                        const showAuthor =
                          !mine && (!previous || previous.sender_id !== message.sender_id);
                        return (
                          <div
                            key={message.id}
                            className={`msg-row ${mine ? "mine" : ""}`}
                          >
                            {!mine && (
                              <Avatar
                                name={author?.full_name ?? "?"}
                                color={author?.avatar_color}
                                style={
                                  showAuthor ? undefined : { visibility: "hidden" }
                                }
                              />
                            )}
                            <div className="msg-group">
                              {showAuthor && (
                                <div className="msg-author">
                                  {author?.full_name.split(" ")[0] ?? "Alguém"}
                                </div>
                              )}
                              <div className="bubble">{message.body}</div>
                              <div className="msg-time">
                                {formatClock(message.created_at)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              <form className="composer" onSubmit={submit}>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={`Mensagem para ${activeChannel.name}`}
                  rows={1}
                  maxLength={2000}
                  aria-label={`Mensagem para ${activeChannel.name}`}
                />
                <button
                  type="submit"
                  className="composer-send"
                  disabled={!draft.trim() || sending}
                  aria-label="Enviar mensagem"
                >
                  {sending ? <span className="spinner" /> : <Icon name="send" />}
                </button>
              </form>
            </>
          ) : (
            <div className="chat-empty-thread">
              <EmptyState
                icon="chat"
                title="Escolha uma conversa"
                text="Selecione um canal ao lado para ler e responder as mensagens."
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
