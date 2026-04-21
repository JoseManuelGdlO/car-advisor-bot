import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { accountApi } from "@/services/account";

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
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auth_token"));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("auth_user");
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (token) localStorage.setItem("auth_token", token);
    else localStorage.removeItem("auth_token");
  }, [token]);
  useEffect(() => {
    if (user) localStorage.setItem("auth_user", JSON.stringify(user));
    else localStorage.removeItem("auth_user");
  }, [user]);

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
      async login(email, password) {
        const res = await apiRequest<{ token: string; user: AuthUser }>("/auth/login", "POST", { email, password });
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
      logout() {
        setToken(null);
        setUser(null);
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
