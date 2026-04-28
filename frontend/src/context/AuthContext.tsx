import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { apiRequest } from "@/lib/api";
import { accountApi } from "@/services/account";
import { pushApi } from "@/services/push";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  defaultPlatform?: string | null;
};

type AuthContextType = {
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const REMEMBER_KEY = "auth_remember_me";

const getStoredValue = (key: string): string | null => {
  const local = localStorage.getItem(key);
  if (local !== null) return local;
  return sessionStorage.getItem(key);
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredValue(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = getStoredValue(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [rememberMe, setRememberMe] = useState<boolean>(() => localStorage.getItem(REMEMBER_KEY) === "true");

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

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const profile = await accountApi.getProfile(token);
    setUser({
      id: profile.user.id,
      email: profile.user.email,
      name: profile.user.name,
      phone: profile.user.phone,
      defaultPlatform: profile.user.defaultPlatform,
    });
  }, [token]);

  const value = useMemo<AuthContextType>(
    () => ({
      token,
      user,
      async login(email, password, remember = true) {
        const res = await apiRequest<{ token: string; user: AuthUser }>("/auth/login", "POST", { email, password });
        setRememberMe(remember);
        setToken(res.token);
        try {
          const profile = await accountApi.getProfile(res.token);
          setUser({
            id: profile.user.id,
            email: profile.user.email,
            name: profile.user.name,
            phone: profile.user.phone,
            defaultPlatform: profile.user.defaultPlatform,
          });
        } catch {
          setUser(res.user);
        }
      },
      async register(name, email, password) {
        await apiRequest("/auth/register", "POST", { name, email, password });
      },
      async logout() {
        const currentToken = token;
        const deviceToken = localStorage.getItem("push_device_token");
        if (Capacitor.isNativePlatform() && currentToken && deviceToken) {
          await pushApi.unregisterDevice(currentToken, deviceToken).catch(() => undefined);
        }
        setToken(null);
        setUser(null);
        setRememberMe(false);
        localStorage.removeItem(REMEMBER_KEY);
      },
      refreshProfile,
    }),
    [token, user, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
