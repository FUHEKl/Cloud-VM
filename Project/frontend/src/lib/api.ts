import axios from "axios";
import Cookies from "js-cookie";
import {
  clearAuthCookies,
  isRememberMeEnabled,
  setAuthCookies,
} from "@/lib/session";
import type {
  AssistantConfirmActionResponse,
  AssistantConversation,
  AssistantMessage,
} from "@/types";

// NEXT_PUBLIC_API_URL may end with /api (when behind Nginx) or be the raw
// gateway origin (direct access). Normalize so we never double-add /api.
const normalizeApiOrigin = (value: string) =>
  value.endsWith("/api") ? value.slice(0, -4) : value;

const resolveApiOrigin = () => {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) {
    return normalizeApiOrigin(configured);
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3001";
};

const API_URL = resolveApiOrigin();

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = Cookies.get("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = Cookies.get("refreshToken");
        if (!refreshToken) throw new Error("No refresh token");
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {
          refreshToken,
        });
        setAuthCookies({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          rememberMe: isRememberMeEnabled(),
        });
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        clearAuthCookies();
        window.location.href = "/login";
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export default api;

export const assistantApi = {
  listConversations: async () => {
    const { data } = await api.get<AssistantConversation[]>("/ai/conversations");
    return data;
  },
  getMessages: async (conversationId: string) => {
    const { data } = await api.get<{ messages: AssistantMessage[] }>(
      `/ai/conversations/${conversationId}/messages`,
    );
    return data;
  },
  createConversation: async (title?: string) => {
    const { data } = await api.post<AssistantConversation>("/ai/conversations", {
      title,
    });
    return data;
  },
  chat: async (payload: {
    message: string;
    conversationId?: string;
    includeContext?: boolean;
  }) => {
    const { data } = await api.post<{
      conversationId: string;
      message: AssistantMessage;
    }>("/ai/chat", payload);
    return data;
  },
  confirmAction: async (payload: {
    confirmationToken: string;
    conversationId?: string;
  }) => {
    const { data } = await api.post<AssistantConfirmActionResponse>(
      "/ai/actions/confirm",
      payload,
    );
    return data;
  },
};
