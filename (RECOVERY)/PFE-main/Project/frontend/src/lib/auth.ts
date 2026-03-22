import { create } from "zustand";
import Cookies from "js-cookie";
import api from "./api";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
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

  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    Cookies.set("accessToken", data.accessToken, { expires: 1 });
    Cookies.set("refreshToken", data.refreshToken, { expires: 7 });
    set({ user: data.user, isAuthenticated: true, isLoading: false });
  },

  register: async (formData) => {
    const { data } = await api.post("/auth/register", formData);
    Cookies.set("accessToken", data.accessToken, { expires: 1 });
    Cookies.set("refreshToken", data.refreshToken, { expires: 7 });
    set({ user: data.user, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try {
      const refreshToken = Cookies.get("refreshToken");
      if (refreshToken) {
        await api.post("/auth/logout", { refreshToken });
      }
    } catch {
      // silent
    }
    Cookies.remove("accessToken");
    Cookies.remove("refreshToken");
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  fetchUser: async () => {
    try {
      const token = Cookies.get("accessToken");
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const { data } = await api.get("/auth/me");
      set({ user: data, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
