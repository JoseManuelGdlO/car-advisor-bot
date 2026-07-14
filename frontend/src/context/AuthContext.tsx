import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { apiRequest, setUnauthorizedHandler } from "@/lib/api";
import { accountApi } from "@/services/account";
import { pushApi } from "@/services/push";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  defaultPlatform?: string | null;
  calendarSchedulingUrl?: string;
};

type ClearSessionOptions = {
  /** `expired` = JWT inválido/caducado; `logout` = cierre voluntario. */
  reason?: "expired" | "logout";
};

type AuthContextType = {
  token: string | null;
  user: AuthUser | null;
  authReady: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (name: string, email: string, password: string, calendarSchedulingUrl?: string) => Promise<void>;
  logout: (options?: ClearSessionOptions) => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const REMEMBER_KEY = "auth_remember_me";
const LAST_EMAIL_KEY = "auth_last_email";
const SESSION_EXPIRED_FLAG = "auth_session_expired";

const getStoredValue = (key: string): string | null => {
  const local = localStorage.getItem(key);
  if (local !== null) return local;
  return sessionStorage.getItem(key);
};

/** Valores iniciales del formulario de login (email recordado + preferencia Recuérdame). */
export function readLoginFormDefaults(): { email: string; rememberMe: boolean; sessionExpired: boolean } {
  return {
    email: localStorage.getItem(LAST_EMAIL_KEY)?.trim() || "",
    rememberMe: localStorage.getItem(REMEMBER_KEY) !== "false",
    sessionExpired: sessionStorage.getItem(SESSION_EXPIRED_FLAG) === "true",
  };
}

const persistLastEmail = (email: string | null | undefined) => {
  const trimmed = email?.trim();
  if (trimmed) localStorage.setItem(LAST_EMAIL_KEY, trimmed);
};

const profileToAuthUser = (profile: Awaited<ReturnType<typeof accountApi.getProfile>>): AuthUser => ({
  id: profile.user.id,
  email: profile.user.email,
  name: profile.user.name,
  phone: profile.user.phone,
  defaultPlatform: profile.user.defaultPlatform,
  calendarSchedulingUrl: profile.user.calendarSchedulingUrl,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => getStoredValue(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = getStoredValue(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [rememberMe, setRememberMe] = useState<boolean>(() => localStorage.getItem(REMEMBER_KEY) !== "false");
  const [authReady, setAuthReady] = useState(false);
  const bootstrapStartedRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;

  const clearSession = useCallback((options?: ClearSessionOptions) => {
    persistLastEmail(userRef.current?.email);
    setToken(null);
    setUser(null);
    // Conservar preferencia "Recuérdame"; solo se limpia la sesión (token/usuario).
    if (options?.reason === "expired") {
      sessionStorage.setItem(SESSION_EXPIRED_FLAG, "true");
    } else {
      sessionStorage.removeItem(SESSION_EXPIRED_FLAG);
    }
  }, []);

  const logout = useCallback(
    async (options?: ClearSessionOptions) => {
      const currentToken = token;
      const deviceToken = localStorage.getItem("push_device_token");
      if (Capacitor.isNativePlatform() && currentToken && deviceToken) {
        await pushApi.unregisterDevice(currentToken, deviceToken).catch(() => undefined);
      }
      clearSession({ reason: options?.reason ?? "logout" });
    },
    [token, clearSession],
  );

  useEffect(() => {
    const store = rememberMe ? localStorage : sessionStorage;
    const otherStore = rememberMe ? sessionStorage : localStorage;
    if (token) {
      store.setItem(TOKEN_KEY, token);
      otherStore.removeItem(TOKEN_KEY);
      return;
    }
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }, [token, rememberMe]);

  useEffect(() => {
    const store = rememberMe ? localStorage : sessionStorage;
    const otherStore = rememberMe ? sessionStorage : localStorage;
    if (user) {
      persistLastEmail(user.email);
      store.setItem(USER_KEY, JSON.stringify(user));
      otherStore.removeItem(USER_KEY);
      return;
    }
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
  }, [user, rememberMe]);

  useEffect(() => {
    localStorage.setItem(REMEMBER_KEY, rememberMe ? "true" : "false");
  }, [rememberMe]);

  useEffect(() => {
    if (bootstrapStartedRef.current) return;
    bootstrapStartedRef.current = true;

    const bootstrap = async () => {
      if (!token) {
        setAuthReady(true);
        return;
      }

      try {
        const profile = await accountApi.getProfile(token, { suppressSessionExpiry: true });
        setUser(profileToAuthUser(profile));
      } catch {
        clearSession({ reason: "expired" });
      } finally {
        setAuthReady(true);
      }
    };

    void bootstrap();
  }, [token, clearSession]);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const profile = await accountApi.getProfile(token);
    setUser(profileToAuthUser(profile));
  }, [token]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.clear();
      void logout({ reason: "expired" });
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient, logout]);

  const value = useMemo<AuthContextType>(
    () => ({
      token,
      user,
      authReady,
      async login(email, password, remember = true) {
        const res = await apiRequest<{ token: string; user: AuthUser }>("/auth/login", "POST", { email, password });
        persistLastEmail(email);
        sessionStorage.removeItem(SESSION_EXPIRED_FLAG);
        setRememberMe(remember);
        setToken(res.token);
        try {
          const profile = await accountApi.getProfile(res.token);
          setUser(profileToAuthUser(profile));
        } catch {
          setUser(res.user);
        }
        setAuthReady(true);
      },
      async register(name, email, password, calendarSchedulingUrl) {
        const trimmedCalendarSchedulingUrl = calendarSchedulingUrl?.trim();
        await apiRequest("/auth/register", "POST", {
          name,
          email,
          password,
          ...(trimmedCalendarSchedulingUrl ? { calendarSchedulingUrl: trimmedCalendarSchedulingUrl } : {}),
        });
      },
      logout,
      refreshProfile,
    }),
    [token, user, authReady, refreshProfile, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
