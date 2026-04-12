import { create } from "zustand";
import api from "./api";
import { clearAuthCookies, setAuthCookies } from "./session";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<{ mfaRequired?: boolean; challengeId?: string; devOtp?: string }>;
  verifyMfa: (
    challengeId: string,
    code: string,
  ) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password, rememberMe = true) => {
    const { data } = await api.post("/auth/login", { email, password, rememberMe });

    if (data?.mfaRequired) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return {
        mfaRequired: true,
        challengeId: data.challengeId,
        devOtp: data.devOtp,
      };
    }

    setAuthCookies({
      rememberMe,
    });
    set({ user: data.user, isAuthenticated: true, isLoading: false });

    return { mfaRequired: false };
  },

  verifyMfa: async (challengeId, code) => {
    const { data } = await api.post("/auth/mfa/verify", { challengeId, code });
    setAuthCookies({
      rememberMe: data.rememberMe === true,
    });
    set({ user: data.user, isAuthenticated: true, isLoading: false });
  },

  register: async (formData) => {
    const { data } = await api.post("/auth/register", formData);
    setAuthCookies({
      rememberMe: true,
    });
    set({ user: data.user, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // silent
    }
    clearAuthCookies();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  fetchUser: async () => {
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data, isAuthenticated: true, isLoading: false });
    } catch {
      clearAuthCookies();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
