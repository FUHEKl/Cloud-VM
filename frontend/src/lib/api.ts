import axios from "axios";
import {
  clearAuthCookies,
  isRememberMeEnabled,
  setAuthCookies,
} from "@/lib/session";
import { resolveApiOrigin } from "@/lib/runtime-urls";
import type {
  AssistantConfirmActionResponse,
  AssistantConversation,
  AssistantMessage,
} from "@/types";

const API_URL = resolveApiOrigin();

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        await axios.post(
          `${API_URL}/api/auth/refresh`,
          {},
          { withCredentials: true },
        );
        setAuthCookies({
          rememberMe: isRememberMeEnabled(),
        });
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
