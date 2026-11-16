import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  listChannels,
  listDirectory,
  listMinistries,
  listMinistryMembers,
  listNotifications,
  markNotificationsRead,
  markNotificationRead,
  subscribeToSchedules,
} from "@/lib/api";
import { IS_DEMO } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import type {
  AppNotification,
  Channel,
  DirectoryPerson,
  Ministry,
  MinistryMember,
} from "@/lib/types";
import { useAuth } from "./AuthContext";

interface AppDataContextValue {
  directory: DirectoryPerson[];
  ministries: Ministry[];
  ministryMembers: MinistryMember[];
  channels: Channel[];
  notifications: AppNotification[];
  unreadNotifications: number;
  unreadChat: number;
  loading: boolean;
  refresh: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshChat: () => Promise<void>;
  readAllNotifications: () => Promise<void>;
  readNotification: (id: string) => Promise<void>;
  personById: (id: string | null | undefined) => DirectoryPerson | undefined;
  ministryById: (id: string | null | undefined) => Ministry | undefined;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [directory, setDirectory] = useState<DirectoryPerson[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [ministryMembers, setMinistryMembers] = useState<MinistryMember[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setNotifications(await listNotifications());
    } catch {
      /* silencioso */
    }
  }, [user]);

  const refreshChat = useCallback(async () => {
    if (!user) return;
    try {
      setChannels(await listChannels());
    } catch {
      /* silencioso */
    }
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const results = await Promise.allSettled([
      listDirectory(),
      listMinistries(),
      listMinistryMembers(),
      listChannels(),
      listNotifications(),
    ]);
    if (results[0].status === "fulfilled") setDirectory(results[0].value);
    if (results[1].status === "fulfilled") setMinistries(results[1].value);
    if (results[2].status === "fulfilled") setMinistryMembers(results[2].value);
    if (results[3].status === "fulfilled") setChannels(results[3].value);
    if (results[4].status === "fulfilled") setNotifications(results[4].value);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user || user.role === "pending") {
      setLoading(false);
      return;
    }
    void refresh();
  }, [user, refresh]);

  useEffect(() => {
    if (!user) return;
    if (IS_DEMO || !supabase) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${user.id}`,
        },
        () => {
          void refreshNotifications();
        },
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [user, refreshNotifications]);

  useEffect(() => {
    if (!user || user.role === "pending") return;
    return subscribeToSchedules(() => {
      void refreshNotifications();
    });
  }, [user, refreshNotifications]);

  const readAllNotifications = useCallback(async () => {
    await markNotificationsRead();
    setNotifications((current) =>
      current.map((item) => ({
        ...item,
        read_at: item.read_at ?? new Date().toISOString(),
      })),
    );
  }, []);

  const readNotification = useCallback(async (id: string) => {
    await markNotificationRead(id);
    setNotifications((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, read_at: item.read_at ?? new Date().toISOString() }
          : item,
      ),
    );
  }, []);

  const personById = useCallback(
    (id: string | null | undefined) =>
      id ? directory.find((person) => person.id === id) : undefined,
    [directory],
  );

  const ministryById = useCallback(
    (id: string | null | undefined) =>
      id ? ministries.find((ministry) => ministry.id === id) : undefined,
    [ministries],
  );

  const unreadNotifications = notifications.filter((item) => !item.read_at).length;
  const unreadChat = channels.reduce(
    (total, channel) => total + (channel.unread_count ?? 0),
    0,
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      directory,
      ministries,
      ministryMembers,
      channels,
      notifications,
      unreadNotifications,
      unreadChat,
      loading,
      refresh,
      refreshNotifications,
      refreshChat,
      readAllNotifications,
      readNotification,
      personById,
      ministryById,
    }),
    [
      directory,
      ministries,
      ministryMembers,
      channels,
      notifications,
      unreadNotifications,
      unreadChat,
      loading,
      refresh,
      refreshNotifications,
      refreshChat,
      readAllNotifications,
      readNotification,
      personById,
      ministryById,
    ],
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData deve ser usado dentro de AppDataProvider");
  return ctx;
}
