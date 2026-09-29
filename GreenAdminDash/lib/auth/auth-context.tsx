"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ApiError,
  apiFetch,
  clearAccessToken,
  refreshSession,
  setAccessToken,
} from "@/lib/api/client";
import type { components } from "@/lib/api/types.gen";
import type { Capability } from "./capabilities";

export type AuthUser = components["schemas"]["AuthUser"];
type SessionResponse = components["schemas"]["SessionResponse"];

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthValue = {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /**
   * يعيد قراءة المستخدم من الخادم. القدرات تُحل على الخادم في كل طلب،
   * فتعديل دور يحمله المستخدم نفسه يسري فورًا هناك، وهذا يلحق الواجهة به.
   */
  reload: () => Promise<void>;
  can: (capability: Capability) => boolean;
  canAny: (...capabilities: Capability[]) => boolean;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  /**
   * الإقلاع الصامت: رمز الوصول يعيش في الذاكرة فيضيع بإعادة تحميل
   * الصفحة، لكن كوكي التحديث باقٍ. محاولة تدوير واحدة عند التحميل تعيد
   * الجلسة دون أن يرى المستخدم صفحة دخول في كل تحديث.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await refreshSession();

      if (cancelled) return;

      if (session) {
        setUser(session.user);
        setStatus("authenticated");
      } else {
        setStatus("anonymous");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await apiFetch<SessionResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      // فشل الدخول ليس انتهاء جلسة، فلا معنى لمحاولة التدوير بعده.
      skipRefresh: true,
    });

    setAccessToken(session.accessToken, session.expiresInSeconds);
    setUser(session.user);
    setStatus("authenticated");

    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>("/auth/logout", {
        method: "POST",
        skipRefresh: true,
      });
    } catch (error) {
      // الخروج لا يفشل من وجهة نظر المستخدم: الحالة المحلية تُمسح دائمًا.
      if (!(error instanceof ApiError)) throw error;
    } finally {
      clearAccessToken();
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const reload = useCallback(async () => {
    setUser(await apiFetch<AuthUser>("/auth/me"));
  }, []);

  const value = useMemo<AuthValue>(() => {
    const granted = new Set(user?.capabilities ?? []);

    return {
      status,
      user,
      login,
      logout,
      reload,
      can: (capability) => granted.has(capability),
      canAny: (...capabilities) =>
        capabilities.some((capability) => granted.has(capability)),
    };
  }, [status, user, login, logout, reload]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }

  return context;
}
