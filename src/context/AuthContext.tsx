import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getMyProfile,
  getSessionUserId,
  onAuthChange,
  signOut as apiSignOut,
  IS_DEMO,
} from "@/lib/api";
import type { Person } from "@/lib/types";

interface AuthContextValue {
  loading: boolean;
  user: Person | null;
  isDemo: boolean;
  isLeader: boolean;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Person | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const id = await getSessionUserId();
      if (!id) {
        setUser(null);
        return;
      }
      const profile = await getMyProfile();
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await refreshUser();
      if (alive) setLoading(false);
    })();

    let unsubscribe: (() => void) | undefined;
    void onAuthChange(async () => {
      await refreshUser();
      if (alive) setLoading(false);
    }).then((fn) => {
      unsubscribe = fn;
    });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [refreshUser]);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        loading,
        user,
        isDemo: IS_DEMO,
        isLeader: user?.role === "leader",
        refreshUser,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
