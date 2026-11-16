export type Role = "leader" | "member" | "pending";

export interface Person {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  role: Role;
  avatar_color: string;
  birth_date: string | null;
  active: boolean;
  must_change_password?: boolean;
  notify_whatsapp: boolean;
  notify_sms: boolean;
  calendar_token: string;
  created_at: string;
}

export type DirectoryPerson = Pick<
  Person,
  "id" | "full_name" | "role" | "avatar_color"
>;

export interface Ministry {
  id: string;
  name: string;
  description: string | null;
  color: string;
  leader_id: string | null;
  active: boolean;
  created_at: string;
}

export interface MinistryMember {
  ministry_id: string;
  profile_id: string;
  role_in_ministry: "leader" | "member";
}

export type EventKind = "culto" | "ensaio" | "reuniao" | "evento" | "especial";

export interface ChurchEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  kind: EventKind;
  created_by: string | null;
  created_at: string;
}

export type ScheduleStatus = "pending" | "confirmed" | "declined";

export interface Schedule {
  id: string;
  event_id: string;
  ministry_id: string;
  profile_id: string;
  event_date: string;
  status: ScheduleStatus;
  note: string | null;
  notified_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ScheduleWithRelations extends Schedule {
  event?: ChurchEvent;
  ministry?: Ministry;
  person?: DirectoryPerson;
}

export type ChannelKind = "general" | "ministry";

export interface Channel {
  id: string;
  name: string;
  kind: ChannelKind;
  ministry_id: string | null;
  ministry?: Ministry | null;
  last_message?: Message | null;
  unread_count?: number;
}

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: DirectoryPerson;
}

export interface AppNotification {
  id: string;
  profile_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ChannelRead {
  channel_id: string;
  profile_id: string;
  last_read_at: string;
}

export interface PersonInput {
  full_name: string;
  phone: string;
  email?: string;
  role: "leader" | "member";
  birth_date?: string | null;
  avatar_color?: string;
}

export interface MinistryInput {
  name: string;
  description?: string;
  color: string;
  leader_id?: string | null;
}

export interface EventInput {
  title: string;
  description?: string;
  event_date: string;
  start_time: string;
  end_time?: string;
  location?: string;
  kind: EventKind;
}

export interface ScheduleInput {
  event_id: string;
  ministry_id: string;
  profile_id: string;
  note?: string;
}

export interface InviteResult {
  person: Person;
  provisionalPassword: string;
}
