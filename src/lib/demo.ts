import { addDaysISO, nextWeekday, todayISO } from "./dates";
import type {
  AppNotification,
  Channel,
  ChannelRead,
  ChurchEvent,
  DirectoryPerson,
  EventInput,
  InviteResult,
  Message,
  Ministry,
  MinistryInput,
  MinistryMember,
  Person,
  PersonInput,
  Role,
  Schedule,
  ScheduleStatus,
  ScheduleWithRelations,
} from "./types";
import { normalizePhoneBR } from "./phone";

const STORE_KEY = "escalajeru.demo.v1";
const SESSION_KEY = "escalajeru.demo.session";
const VERSION = 3;

interface DemoStore {
  version: number;
  people: Person[];
  ministries: Ministry[];
  ministryMembers: MinistryMember[];
  events: ChurchEvent[];
  schedules: Schedule[];
  channels: Channel[];
  messages: Message[];
  reads: ChannelRead[];
  notifications: AppNotification[];
}

function nowMinus(minutes: number): string {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

function isoDay(minutes: number): string {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

function person(
  id: string,
  full_name: string,
  phone: string,
  email: string,
  role: Role,
  avatar_color: string,
  birth_date: string | null = null,
): Person {
  return {
    id,
    full_name,
    phone,
    email,
    role,
    avatar_color,
    birth_date,
    active: true,
    notify_whatsapp: true,
    notify_sms: false,
    calendar_token: `demo-${id}`,
    created_at: "2025-02-10T12:00:00.000Z",
  };
}

function seed(): DemoStore {
  const nextSunday = nextWeekday(0, true);
  const nextWednesday = nextWeekday(3, true);
  const nextSaturday = nextWeekday(6, true);
  const nextFriday = nextWeekday(5, true);
  const pastSunday = addDaysISO(nextSunday, -7);
  const secondSunday = addDaysISO(nextSunday, 7);

  const people: Person[] = [
    person("p-ana", "Ana Beatriz Ferreira", "+5511988124477", "ana@igrejajeru.org", "leader", "#2c5a4b", "1988-03-14"),
    person("p-carlos", "Carlos Eduardo Lima", "+5511992347788", "carlos@igrejajeru.org", "leader", "#b96f4e", "1985-09-02"),
    person("p-juliana", "Juliana Alves", "+5511977446621", "juliana@igrejajeru.org", "leader", "#9b7a3f", "1990-06-21"),
    person("p-mariana", "Mariana Souza", "+5511966554433", "mariana@igrejajeru.org", "member", "#4c6d88", "1996-01-18"),
    person("p-pedro", "Pedro Henrique Alves", "+5511955443322", "pedro@igrejajeru.org", "member", "#77556f", "1999-11-30"),
    person("p-beatriz", "Beatriz Nunes", "+5511944332211", "bia@igrejajeru.org", "member", "#5d7360", "1993-08-09"),
    person("p-rafael", "Rafael Lima", "+5511933221100", "rafael@igrejajeru.org", "member", "#8a5a44", "2001-04-27"),
    person("p-tiago", "Tiago Ferreira", "+5511922110099", "tiago@igrejajeru.org", "member", "#546b7c", "1992-12-05"),
    person("p-debora", "Débora Martins", "+5511911009988", "debora@igrejajeru.org", "member", "#2c5a4b", "1987-07-12"),
    person("p-samuel", "Samuel Rocha", "+5511900998877", "samuel@igrejajeru.org", "member", "#b96f4e", "1998-02-23"),
  ];

  const ministries: Ministry[] = [
    { id: "m-louvor", name: "Louvor", description: "Música, voz e instrumental dos encontros.", color: "#b96f4e", leader_id: "p-carlos", active: true, created_at: "2025-02-10T12:00:00.000Z" },
    { id: "m-recepcao", name: "Recepção", description: "Acolhimento, boas-vindas e organização.", color: "#2c5a4b", leader_id: "p-juliana", active: true, created_at: "2025-02-10T12:00:00.000Z" },
    { id: "m-infantil", name: "Infantil", description: "Cuidado e ensino das crianças.", color: "#4c6d88", leader_id: "p-beatriz", active: true, created_at: "2025-02-10T12:00:00.000Z" },
    { id: "m-midia", name: "Mídia", description: "Som, projeção e transmissão.", color: "#77556f", leader_id: "p-tiago", active: true, created_at: "2025-02-10T12:00:00.000Z" },
    { id: "m-intercessao", name: "Intercessão", description: "Oração pelos encontros e pelas famílias.", color: "#9b7a3f", leader_id: "p-ana", active: true, created_at: "2025-02-10T12:00:00.000Z" },
  ];

  const ministryMembers: MinistryMember[] = [
    { ministry_id: "m-louvor", profile_id: "p-carlos", role_in_ministry: "leader" },
    { ministry_id: "m-louvor", profile_id: "p-ana", role_in_ministry: "member" },
    { ministry_id: "m-louvor", profile_id: "p-mariana", role_in_ministry: "member" },
    { ministry_id: "m-louvor", profile_id: "p-tiago", role_in_ministry: "member" },
    { ministry_id: "m-recepcao", profile_id: "p-juliana", role_in_ministry: "leader" },
    { ministry_id: "m-recepcao", profile_id: "p-pedro", role_in_ministry: "member" },
    { ministry_id: "m-recepcao", profile_id: "p-debora", role_in_ministry: "member" },
    { ministry_id: "m-infantil", profile_id: "p-beatriz", role_in_ministry: "leader" },
    { ministry_id: "m-infantil", profile_id: "p-rafael", role_in_ministry: "member" },
    { ministry_id: "m-infantil", profile_id: "p-mariana", role_in_ministry: "member" },
    { ministry_id: "m-midia", profile_id: "p-tiago", role_in_ministry: "leader" },
    { ministry_id: "m-midia", profile_id: "p-samuel", role_in_ministry: "member" },
    { ministry_id: "m-intercessao", profile_id: "p-ana", role_in_ministry: "leader" },
    { ministry_id: "m-intercessao", profile_id: "p-debora", role_in_ministry: "member" },
    { ministry_id: "m-intercessao", profile_id: "p-samuel", role_in_ministry: "member" },
  ];

  const events: ChurchEvent[] = [
    {
      id: "e-culto",
      title: "Culto da Família",
      description: "Celebração com as famílias da igreja. Traga alguém para orar com você.",
      event_date: nextSunday,
      start_time: "18:30",
      end_time: "20:30",
      location: "Templo principal",
      kind: "culto",
      created_by: "p-ana",
      created_at: "2025-09-01T12:00:00.000Z",
    },
    {
      id: "e-oracao",
      title: "Culto de Oração",
      description: "Uma noite de intercessão pela cidade e pelas famílias.",
      event_date: nextWednesday,
      start_time: "19:30",
      end_time: "21:00",
      location: "Sala de oração",
      kind: "culto",
      created_by: "p-ana",
      created_at: "2025-09-01T12:00:00.000Z",
    },
    {
      id: "e-ensaio",
      title: "Ensaio do Louvor",
      description: "Ensaio aberto para toda a equipe de música.",
      event_date: nextSaturday,
      start_time: "19:00",
      end_time: "21:00",
      location: "Templo principal",
      kind: "ensaio",
      created_by: "p-carlos",
      created_at: "2025-09-01T12:00:00.000Z",
    },
    {
      id: "e-jovens",
      title: "Encontro de Jovens",
      description: "Café, conversa e uma palavra para a juventude.",
      event_date: nextFriday,
      start_time: "20:00",
      end_time: "22:00",
      location: "Salão social",
      kind: "especial",
      created_by: "p-ana",
      created_at: "2025-09-01T12:00:00.000Z",
    },
    {
      id: "e-pasado",
      title: "Culto da Família",
      description: "Celebração do domingo anterior.",
      event_date: pastSunday,
      start_time: "18:30",
      end_time: "20:30",
      location: "Templo principal",
      kind: "culto",
      created_by: "p-ana",
      created_at: "2025-08-25T12:00:00.000Z",
    },
    {
      id: "e-ceia",
      title: "Santa Ceia",
      description: "Celebração da Santa Ceia com toda a igreja.",
      event_date: secondSunday,
      start_time: "18:30",
      end_time: "20:30",
      location: "Templo principal",
      kind: "especial",
      created_by: "p-ana",
      created_at: "2025-09-01T12:00:00.000Z",
    },
  ];

  const schedule = (
    id: string,
    event: ChurchEvent,
    ministryId: string,
    profileId: string,
    status: ScheduleStatus,
    note: string | null = null,
  ): Schedule => ({
    id,
    event_id: event.id,
    ministry_id: ministryId,
    profile_id: profileId,
    event_date: event.event_date,
    status,
    note,
    notified_at: status === "confirmed" ? nowMinus(1200) : null,
    created_by: "p-ana",
    created_at: "2025-09-02T12:00:00.000Z",
  });

  const culto = events[0];
  const oracao = events[1];
  const passado = events[4];

  const schedules: Schedule[] = [
    schedule("s-1", culto, "m-louvor", "p-ana", "confirmed"),
    schedule("s-2", culto, "m-louvor", "p-carlos", "confirmed"),
    schedule("s-3", culto, "m-louvor", "p-mariana", "pending"),
    schedule("s-4", culto, "m-recepcao", "p-juliana", "confirmed"),
    schedule("s-5", culto, "m-recepcao", "p-pedro", "pending"),
    schedule("s-6", culto, "m-infantil", "p-beatriz", "confirmed"),
    schedule("s-7", culto, "m-infantil", "p-rafael", "confirmed"),
    schedule("s-8", culto, "m-midia", "p-tiago", "pending"),
    schedule("s-9", culto, "m-intercessao", "p-debora", "confirmed"),
    schedule("s-10", oracao, "m-intercessao", "p-ana", "confirmed"),
    schedule("s-11", oracao, "m-louvor", "p-mariana", "pending"),
    schedule("s-12", oracao, "m-recepcao", "p-juliana", "pending"),
    schedule("s-13", passado, "m-louvor", "p-ana", "confirmed"),
    schedule("s-14", passado, "m-louvor", "p-carlos", "confirmed"),
    schedule("s-15", passado, "m-recepcao", "p-juliana", "confirmed"),
    schedule("s-16", passado, "m-infantil", "p-beatriz", "confirmed"),
  ];

  const channels: Channel[] = [
    { id: "c-geral", name: "Geral", kind: "general", ministry_id: null },
    ...ministries.map((m) => ({
      id: `c-${m.id}`,
      name: m.name,
      kind: "ministry" as const,
      ministry_id: m.id,
    })),
  ];

  const messages: Message[] = [
    { id: "msg-1", channel_id: "c-geral", sender_id: "p-ana", body: "Bom dia, igreja! Já estão abertas as confirmações da escala deste domingo. Contamos com cada um de vocês. 🙏", created_at: nowMinus(220) },
    { id: "msg-2", channel_id: "c-geral", sender_id: "p-carlos", body: "Confirmado por aqui. O ensaio de sábado está mantido às 19h.", created_at: nowMinus(204) },
    { id: "msg-3", channel_id: "c-geral", sender_id: "p-juliana", body: "Recepção organizada. Se alguém puder chegar 18h para ajudar com os visitantes, me avisa.", created_at: nowMinus(150) },
    { id: "msg-4", channel_id: "c-m-louvor", sender_id: "p-carlos", body: "Equipe, o repertório desta semana está no grupo de ensaio. Vamos começar pontualmente.", created_at: nowMinus(190) },
    { id: "msg-5", channel_id: "c-m-louvor", sender_id: "p-mariana", body: "Estarei lá! Posso assumir a segunda voz no primeiro louvor?", created_at: nowMinus(160) },
    { id: "msg-6", channel_id: "c-m-louvor", sender_id: "p-carlos", body: "Perfeito, Mariana. Obrigado!", created_at: nowMinus(155) },
    { id: "msg-7", channel_id: "c-m-recepcao", sender_id: "p-juliana", body: "Pedro, você pode ficar na porta principal neste domingo?", created_at: nowMinus(120) },
    { id: "msg-8", channel_id: "c-m-recepcao", sender_id: "p-pedro", body: "Pode deixar, estarei lá às 18h.", created_at: nowMinus(110) },
    { id: "msg-9", channel_id: "c-m-infantil", sender_id: "p-beatriz", body: "Lembrete: neste domingo teremos a sala dos menores com duas turmas.", created_at: nowMinus(300) },
    { id: "msg-10", channel_id: "c-m-midia", sender_id: "p-tiago", body: "Teste de som feito. Microfones 3 e 4 precisam de pilha nova.", created_at: nowMinus(260) },
  ];

  const notifications: AppNotification[] = [
    {
      id: "n-1",
      profile_id: "p-ana",
      title: "Você está escalada no Louvor",
      body: `Culto da Família · ${nextSunday} · 18h30`,
      link: "/escalas",
      read_at: null,
      created_at: nowMinus(240),
    },
    {
      id: "n-2",
      profile_id: "p-ana",
      title: "3 confirmações pendentes",
      body: "A escala deste domingo ainda tem pessoas para confirmar.",
      link: "/escalas",
      read_at: null,
      created_at: nowMinus(180),
    },
    {
      id: "n-3",
      profile_id: "p-ana",
      title: "Novo aviso no chat Geral",
      body: "Carlos Eduardo: Confirmado por aqui. O ensaio de sábado está mantido às 19h.",
      link: "/chat/c-geral",
      read_at: nowMinus(100),
      created_at: nowMinus(204),
    },
  ];

  return {
    version: VERSION,
    people,
    ministries,
    ministryMembers,
    events,
    schedules,
    channels,
    messages,
    reads: [
      { channel_id: "c-geral", profile_id: "p-ana", last_read_at: nowMinus(210) },
      { channel_id: "c-m-louvor", profile_id: "p-ana", last_read_at: nowMinus(170) },
    ],
    notifications,
  };
}

let cache: DemoStore | null = null;

export function demoStore(): DemoStore {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoStore;
      if (parsed.version === VERSION) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    /* ignora */
  }
  cache = seed();
  saveDemoStore();
  return cache;
}

export function saveDemoStore() {
  if (!cache) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cache));
  } catch {
    /* ignora */
  }
}

export function resetDemoStore() {
  cache = seed();
  saveDemoStore();
}

export function demoSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setDemoSession(id: string) {
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    /* ignora */
  }
}

export function clearDemoSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignora */
  }
}

export function currentDemoPerson(): Person {
  const store = demoStore();
  const id = demoSessionId();
  return store.people.find((p) => p.id === id && p.active) ?? store.people[0];
}

function directoryOf(store: DemoStore): DirectoryPerson[] {
  return store.people
    .filter((p) => p.active && p.role !== "pending")
    .map(({ id, full_name, role, avatar_color }) => ({
      id,
      full_name,
      role,
      avatar_color,
    }));
}

function hydrateSchedule(
  store: DemoStore,
  schedule: Schedule,
): ScheduleWithRelations {
  return {
    ...schedule,
    event: store.events.find((e) => e.id === schedule.event_id),
    ministry: store.ministries.find((m) => m.id === schedule.ministry_id),
    person: directoryOf(store).find((p) => p.id === schedule.profile_id),
  };
}

function channelUnread(store: DemoStore, channelId: string, profileId: string) {
  const read = store.reads.find(
    (r) => r.channel_id === channelId && r.profile_id === profileId,
  );
  const since = read?.last_read_at || "1970-01-01T00:00:00.000Z";
  return store.messages.filter(
    (m) => m.channel_id === channelId && m.sender_id !== profileId && m.created_at > since,
  ).length;
}

export const demoApi = {
  async getMyProfile(): Promise<Person> {
    return currentDemoPerson();
  },

  async listDirectory(): Promise<DirectoryPerson[]> {
    return directoryOf(demoStore());
  },

  async updateMyProfile(patch: Partial<Person>): Promise<Person> {
    const store = demoStore();
    const me = currentDemoPerson();
    const updated = { ...me, ...patch, id: me.id, role: me.role };
    store.people = store.people.map((p) => (p.id === me.id ? updated : p));
    saveDemoStore();
    return updated;
  },

  async listPeople(): Promise<Person[]> {
    return [...demoStore().people].sort((a, b) => {
      if (a.role !== b.role) return a.role === "leader" ? -1 : 1;
      return a.full_name.localeCompare(b.full_name, "pt-BR");
    });
  },

  async createPerson(input: PersonInput): Promise<InviteResult> {
    const store = demoStore();
    const phone = normalizePhoneBR(input.phone) || input.phone;
    const id = `p-${Date.now().toString(36)}`;
    const created: Person = {
      id,
      full_name: input.full_name.trim(),
      phone,
      email: input.email?.trim() || null,
      role: input.role,
      avatar_color: input.avatar_color || "#2c5a4b",
      birth_date: input.birth_date || null,
      active: true,
      must_change_password: true,
      notify_whatsapp: true,
      notify_sms: false,
      calendar_token: `demo-token-${id}`,
      created_at: new Date().toISOString(),
    };
    store.people.push(created);
    saveDemoStore();
    return { person: created, provisionalPassword: "Temp" + Math.random().toString(36).slice(2, 8) };
  },

  async updatePerson(id: string, patch: Partial<Person>): Promise<Person> {
    const store = demoStore();
    const existing = store.people.find((p) => p.id === id);
    if (!existing) throw new Error("Pessoa não encontrada.");
    const updated = { ...existing, ...patch, id };
    store.people = store.people.map((p) => (p.id === id ? updated : p));
    saveDemoStore();
    return updated;
  },

  async deactivatePerson(id: string): Promise<void> {
    const store = demoStore();
    store.people = store.people.map((p) =>
      p.id === id ? { ...p, active: false } : p,
    );
    store.schedules = store.schedules.filter(
      (s) => s.profile_id !== id || new Date(`${s.event_date}T23:59:00`).getTime() < Date.now(),
    );
    saveDemoStore();
  },

  async listMinistries(): Promise<Ministry[]> {
    return demoStore()
      .ministries.filter((m) => m.active)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  },

  async saveMinistry(input: MinistryInput, id?: string): Promise<Ministry> {
    const store = demoStore();
    if (id) {
      const existing = store.ministries.find((m) => m.id === id);
      if (!existing) throw new Error("Ministério não encontrado.");
      const updated: Ministry = {
        ...existing,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color,
        leader_id: input.leader_id || null,
      };
      store.ministries = store.ministries.map((m) => (m.id === id ? updated : m));
      if (input.leader_id) {
        const exists = store.ministryMembers.some(
          (mm) => mm.ministry_id === id && mm.profile_id === input.leader_id,
        );
        if (!exists) {
          store.ministryMembers.push({
            ministry_id: id,
            profile_id: input.leader_id,
            role_in_ministry: "leader",
          });
        }
      }
      saveDemoStore();
      return updated;
    }

    const newId = `m-${Date.now().toString(36)}`;
    const created: Ministry = {
      id: newId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      color: input.color,
      leader_id: input.leader_id || null,
      active: true,
      created_at: new Date().toISOString(),
    };
    store.ministries.push(created);
    store.channels.push({
      id: `c-${newId}`,
      name: created.name,
      kind: "ministry",
      ministry_id: newId,
    });
    if (created.leader_id) {
      store.ministryMembers.push({
        ministry_id: newId,
        profile_id: created.leader_id,
        role_in_ministry: "leader",
      });
    }
    saveDemoStore();
    return created;
  },

  async listMinistryMembers(): Promise<MinistryMember[]> {
    return demoStore().ministryMembers;
  },

  async deactivateMinistry(id: string): Promise<void> {
    const store = demoStore();
    store.ministries = store.ministries.map((ministry) =>
      ministry.id === id ? { ...ministry, active: false } : ministry,
    );
    saveDemoStore();
  },

  async addMinistryMember(
    ministryId: string,
    profileId: string,
    role: "leader" | "member" = "member",
  ): Promise<void> {
    const store = demoStore();
    if (
      store.ministryMembers.some(
        (m) => m.ministry_id === ministryId && m.profile_id === profileId,
      )
    ) {
      return;
    }
    store.ministryMembers.push({
      ministry_id: ministryId,
      profile_id: profileId,
      role_in_ministry: role,
    });
    saveDemoStore();
  },

  async removeMinistryMember(ministryId: string, profileId: string): Promise<void> {
    const store = demoStore();
    store.ministryMembers = store.ministryMembers.filter(
      (m) => !(m.ministry_id === ministryId && m.profile_id === profileId),
    );
    saveDemoStore();
  },

  async listEvents(range?: { from?: string; to?: string }): Promise<ChurchEvent[]> {
    return demoStore()
      .events.filter((e) => {
        if (range?.from && e.event_date < range.from) return false;
        if (range?.to && e.event_date > range.to) return false;
        return true;
      })
      .slice()
      .sort((a, b) =>
        `${a.event_date}T${a.start_time}`.localeCompare(`${b.event_date}T${b.start_time}`),
      );
  },

  async saveEvent(input: EventInput, id?: string): Promise<ChurchEvent> {
    const store = demoStore();
    if (id) {
      const existing = store.events.find((e) => e.id === id);
      if (!existing) throw new Error("Encontro não encontrado.");
      const updated: ChurchEvent = {
        ...existing,
        ...input,
        description: input.description?.trim() || null,
        location: input.location?.trim() || null,
        end_time: input.end_time || null,
      };
      store.events = store.events.map((e) => (e.id === id ? updated : e));
      store.schedules = store.schedules.map((s) =>
        s.event_id === id ? { ...s, event_date: updated.event_date } : s,
      );
      saveDemoStore();
      return updated;
    }
    const created: ChurchEvent = {
      id: `e-${Date.now().toString(36)}`,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      event_date: input.event_date,
      start_time: input.start_time,
      end_time: input.end_time || null,
      location: input.location?.trim() || null,
      kind: input.kind,
      created_by: currentDemoPerson().id,
      created_at: new Date().toISOString(),
    };
    store.events.push(created);
    saveDemoStore();
    return created;
  },

  async deleteEvent(id: string): Promise<void> {
    const store = demoStore();
    store.events = store.events.filter((e) => e.id !== id);
    store.schedules = store.schedules.filter((s) => s.event_id !== id);
    saveDemoStore();
  },

  async listSchedules(): Promise<ScheduleWithRelations[]> {
    const store = demoStore();
    return store.schedules
      .map((s) => hydrateSchedule(store, s))
      .sort((a, b) => {
        const da = `${a.event_date}T${a.event?.start_time || "00:00"}`;
        const db = `${b.event_date}T${b.event?.start_time || "00:00"}`;
        return da.localeCompare(db);
      });
  },

  async createSchedule(input: {
    event_id: string;
    ministry_id: string;
    profile_id: string;
    note?: string;
  }): Promise<Schedule> {
    const store = demoStore();
    const event = store.events.find((e) => e.id === input.event_id);
    if (!event) throw new Error("Encontro não encontrado.");
    const person = store.people.find((p) => p.id === input.profile_id);
    if (!person || !person.active) throw new Error("Pessoa indisponível.");
    const conflict = store.schedules.find(
      (s) =>
        s.profile_id === input.profile_id &&
        s.event_date === event.event_date &&
        s.status !== "declined",
    );
    if (conflict) {
      const otherEvent = store.events.find((e) => e.id === conflict.event_id);
      const otherMinistry = store.ministries.find((m) => m.id === conflict.ministry_id);
      throw new Error(
        `${person.full_name.split(" ")[0]} já está escalado(a) em ${otherMinistry?.name || "outro ministério"}${otherEvent ? ` no ${otherEvent.title}` : ""} neste dia. Cada pessoa pode servir em um ministério por dia.`,
      );
    }
    const duplicated = store.schedules.some(
      (s) =>
        s.event_id === input.event_id &&
        s.ministry_id === input.ministry_id &&
        s.profile_id === input.profile_id,
    );
    if (duplicated) throw new Error("Essa pessoa já está nesta equipe.");

    const created: Schedule = {
      id: `s-${Date.now().toString(36)}`,
      event_id: input.event_id,
      ministry_id: input.ministry_id,
      profile_id: input.profile_id,
      event_date: event.event_date,
      status: "pending",
      note: input.note?.trim() || null,
      notified_at: null,
      created_by: currentDemoPerson().id,
      created_at: new Date().toISOString(),
    };
    store.schedules.push(created);

    store.notifications.unshift({
      id: `n-${Date.now().toString(36)}`,
      profile_id: input.profile_id,
      title: "Você foi escalado(a)",
      body: `${event.title} · ${event.event_date.split("-").reverse().join("/")} · ${event.start_time}`,
      link: "/escalas",
      read_at: null,
      created_at: new Date().toISOString(),
    });
    saveDemoStore();
    return created;
  },

  async deleteSchedule(id: string): Promise<void> {
    const store = demoStore();
    store.schedules = store.schedules.filter((s) => s.id !== id);
    saveDemoStore();
  },

  async replaceSchedulePerson(id: string, profileId: string): Promise<void> {
    const store = demoStore();
    const schedule = store.schedules.find((s) => s.id === id);
    if (!schedule) throw new Error("Escala não encontrada.");
    const event = store.events.find((e) => e.id === schedule.event_id);
    if (!event) throw new Error("Encontro não encontrado.");
    const person = store.people.find((p) => p.id === profileId && p.active);
    if (!person) throw new Error("Pessoa indisponível.");
    const conflict = store.schedules.find(
      (s) =>
        s.id !== id &&
        s.profile_id === profileId &&
        s.event_date === event.event_date &&
        s.status !== "declined",
    );
    if (conflict) {
      const other = store.ministries.find((m) => m.id === conflict.ministry_id);
      throw new Error(
        `${person.full_name.split(" ")[0]} já está escalado(a) em ${other?.name || "outro ministério"} neste dia.`,
      );
    }
    schedule.profile_id = profileId;
    schedule.status = "pending";
    schedule.notified_at = null;
    saveDemoStore();
  },

  async respondSchedule(id: string, status: ScheduleStatus): Promise<void> {
    const store = demoStore();
    const schedule = store.schedules.find((s) => s.id === id);
    if (!schedule) throw new Error("Escala não encontrada.");
    schedule.status = status;
    saveDemoStore();
  },

  async listChannels(): Promise<Channel[]> {
    const store = demoStore();
    const me = currentDemoPerson();
    return store.channels
      .filter((channel) => {
        if (channel.kind === "general") return true;
        if (me.role === "leader") return true;
        return store.ministryMembers.some(
          (mm) => mm.ministry_id === channel.ministry_id && mm.profile_id === me.id,
        );
      })
      .map((channel) => {
        const channelMessages = store.messages.filter(
          (m) => m.channel_id === channel.id,
        );
        const last = channelMessages[channelMessages.length - 1] || null;
        return {
          ...channel,
          ministry: store.ministries.find((m) => m.id === channel.ministry_id) || null,
          last_message: last,
          unread_count: channelUnread(store, channel.id, me.id),
        };
      });
  },

  async listMessages(channelId: string): Promise<Message[]> {
    const store = demoStore();
    return store.messages
      .filter((m) => m.channel_id === channelId)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  async sendMessage(channelId: string, body: string): Promise<Message> {
    const store = demoStore();
    const created: Message = {
      id: `msg-${Date.now().toString(36)}`,
      channel_id: channelId,
      sender_id: currentDemoPerson().id,
      body: body.trim(),
      created_at: new Date().toISOString(),
    };
    store.messages.push(created);
    saveDemoStore();
    return created;
  },

  async markChannelRead(channelId: string): Promise<void> {
    const store = demoStore();
    const me = currentDemoPerson();
    const existing = store.reads.find(
      (r) => r.channel_id === channelId && r.profile_id === me.id,
    );
    if (existing) existing.last_read_at = new Date().toISOString();
    else
      store.reads.push({
        channel_id: channelId,
        profile_id: me.id,
        last_read_at: new Date().toISOString(),
      });
    saveDemoStore();
  },

  async listNotifications(): Promise<AppNotification[]> {
    const me = currentDemoPerson();
    return demoStore()
      .notifications.filter((n) => n.profile_id === me.id)
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async markNotificationsRead(): Promise<void> {
    const me = currentDemoPerson();
    const store = demoStore();
    const now = new Date().toISOString();
    store.notifications = store.notifications.map((n) =>
      n.profile_id === me.id && !n.read_at ? { ...n, read_at: now } : n,
    );
    saveDemoStore();
  },

  async markNotificationRead(id: string): Promise<void> {
    const store = demoStore();
    store.notifications = store.notifications.map((n) =>
      n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
    );
    saveDemoStore();
  },

  async switchDemoUser(id: string): Promise<void> {
    setDemoSession(id);
  },

  async listDemoPersonas(): Promise<DirectoryPerson[]> {
    const store = demoStore();
    return store.people
      .filter((p) => ["p-ana", "p-mariana", "p-carlos"].includes(p.id))
      .map(({ id, full_name, role, avatar_color }) => ({
        id,
        full_name,
        role,
        avatar_color,
      }));
  },

  async resetDemo(): Promise<void> {
    resetDemoStore();
  },

  todayISO,
  isoDay,
};
