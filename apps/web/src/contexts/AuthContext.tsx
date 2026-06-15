import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearToken, getToken, setToken } from "../lib/api";
import { queryClient } from "../lib/query-client";
import type { User } from "../types/api";

type LoginResponse = { token: string; user: User };

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateSession: (nextUser: User, token?: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) {
      setIsLoading(false);
      return;
    }
    api<{ user: User }>("/auth/me")
      .then((response) => setUser(response.user))
      .catch(() => clearToken())
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const unauthorized = () => {
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener("auth:unauthorized", unauthorized);
    return () => window.removeEventListener("auth:unauthorized", unauthorized);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login: async (email, password) => {
        const response = await api<LoginResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        setToken(response.token);
        setUser(response.user);
      },
      refreshUser: async () => {
        const response = await api<{ user: User }>("/auth/me");
        setUser(response.user);
      },
      updateSession: (nextUser, token) => {
        if (token) setToken(token);
        setUser(nextUser);
      },
      logout: () => {
        clearToken();
        setUser(null);
        queryClient.clear();
      }
    }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
