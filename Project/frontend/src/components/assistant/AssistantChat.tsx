"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import Cookies from "js-cookie";
import { io, Socket } from "socket.io-client";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  AssistantConfirmActionResponse,
  AssistantConversation,
  AssistantMessage,
  AssistantPendingAction,
} from "@/types";

interface AssistantChatProps {
  mode?: "compact" | "full";
  onClose?: () => void;
}

const _rawApiUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3001");
const API_URL = _rawApiUrl.endsWith("/api") ? _rawApiUrl.slice(0, -4) : _rawApiUrl;

interface AiStreamMeta {
  requestId: string;
  conversationId: string;
  messageId?: string;
  provider?: string;
  model?: string;
  pendingAction?: AssistantPendingAction;
}

interface AiStreamChunk {
  requestId: string;
  token: string;
}

interface AiStreamDone {
  requestId: string;
}

interface AiStreamError {
  requestId: string;
  message?: string;
}

interface ActiveStreamState {
  requestId: string;
  assistantId: string;
  conversationId?: string;
  pendingAction?: AssistantPendingAction;
  timeoutId: number;
  resolve: (conversationId?: string) => void;
  reject: (error: Error) => void;
}

interface ChatUiMessage extends AssistantMessage {
  images?: string[];
}

const MAX_ATTACHED_IMAGES = 3;
const MAX_IMAGE_DIMENSION = 1280;
const MAX_IMAGE_BYTES = 1_500_000;
const MIN_IMAGE_QUALITY = 0.55;
const INITIAL_IMAGE_QUALITY = 0.82;

export default function AssistantChat({
  mode = "full",
  onClose,
}: AssistantChatProps) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [confirmingForMessageId, setConfirmingForMessageId] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedImageNames, setAttachedImageNames] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const activeStreamRef = useRef<ActiveStreamState | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) || null,
    [conversations, activeConversationId],
  );

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    if (activeStreamRef.current) {
      return;
    }

    void loadMessages(activeConversationId);
  }, [activeConversationId]);

  useEffect(() => {
    const token = Cookies.get("accessToken");
    if (!token) return;

    const socket = io(`${API_URL}/ai-chat`, {
      transports: ["websocket"],
      path: "/ai-chat/socket.io",
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionAttempts: 20,
      secure:
        typeof window !== "undefined" && window.location.protocol === "https:",
    });

    socketRef.current = socket;

    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));

    socket.on("ai:meta", (meta: AiStreamMeta) => {
      const active = activeStreamRef.current;
      if (!active || meta.requestId !== active.requestId) return;

      if (meta.conversationId) {
        active.conversationId = meta.conversationId;
        setActiveConversationId(meta.conversationId);
      }

      if (meta.messageId && meta.messageId !== active.assistantId) {
        const previousId = active.assistantId;
        active.assistantId = meta.messageId;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === previousId
              ? {
                  ...msg,
                  id: meta.messageId as string,
                  provider: meta.provider,
                  model: meta.model,
                }
              : msg,
          ),
        );
      }

      if (meta.pendingAction) {
        active.pendingAction = meta.pendingAction;
      }
    });

    socket.on("ai:chunk", (chunk: AiStreamChunk) => {
      const active = activeStreamRef.current;
      if (!active || chunk.requestId !== active.requestId) return;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === active.assistantId
            ? { ...msg, content: `${msg.content}${chunk.token}` }
            : msg,
        ),
      );
    });

    socket.on("ai:done", (done: AiStreamDone) => {
      const active = activeStreamRef.current;
      if (!active || done.requestId !== active.requestId) return;

      if (active.pendingAction) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === active.assistantId
              ? { ...msg, pendingAction: active.pendingAction }
              : msg,
          ),
        );
      }

      window.clearTimeout(active.timeoutId);
      active.resolve(active.conversationId);
      activeStreamRef.current = null;
    });

    socket.on("ai:error", (event: AiStreamError) => {
      const active = activeStreamRef.current;
      if (!active || event.requestId !== active.requestId) return;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === active.assistantId
            ? {
                ...msg,
                content:
                  event.message ||
                  "The assistant stream failed before completing the answer.",
              }
            : msg,
        ),
      );

      window.clearTimeout(active.timeoutId);
      active.reject(new Error(event.message || "Stream failed"));
      activeStreamRef.current = null;
    });

    return () => {
      const active = activeStreamRef.current;
      if (active) {
        window.clearTimeout(active.timeoutId);
        active.reject(new Error("WebSocket disconnected"));
        activeStreamRef.current = null;
      }

      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.scrollTop = container.scrollHeight;
  }, [messages, loading]);

  async function loadConversations() {
    setLoadingHistory(true);
    try {
      const { data } = await api.get<AssistantConversation[]>("/ai/conversations");
      setConversations(data);
      setActiveConversationId((previous) => {
        if (previous && data.some((conversation) => conversation.id === previous)) {
          return previous;
        }
        return data.length > 0 ? data[0].id : null;
      });
    } catch {
      // silent for now; keeping dashboard smooth
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadMessages(conversationId: string) {
    setLoadingHistory(true);
    try {
      const { data } = await api.get<{ messages: AssistantMessage[] }>(
        `/ai/conversations/${conversationId}/messages`,
      );
      setMessages((data.messages || []).map((message) => ({ ...message, images: undefined })));
    } catch {
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function createConversationAndSelect(clearMessages = true) {
    const { data } = await api.post<AssistantConversation>("/ai/conversations", {
      title: "New conversation",
    });

    setConversations((prev) => [data, ...prev]);
    setActiveConversationId(data.id);
    if (clearMessages) {
      setMessages([]);
    }
    return data.id;
  }

  function getRequestId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function sendMessageViaWebSocket(payload: {
    message: string;
    conversationId: string;
    includeContext: boolean;
    images?: string[];
  }) {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      throw new Error("WebSocket not connected");
    }

    const requestId = getRequestId();
    const localAssistantId = `local-assistant-${requestId}`;

    setMessages((prev) => [
      ...prev,
      {
        id: localAssistantId,
        role: "ASSISTANT",
        content: "",
        createdAt: new Date().toISOString(),
      },
    ]);

    return new Promise<string | undefined>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        const active = activeStreamRef.current;
        if (!active || active.requestId !== requestId) return;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === active.assistantId
              ? {
                  ...msg,
                  content:
                    "The assistant took too long to respond. Please retry your message.",
                }
              : msg,
          ),
        );

        active.reject(new Error("Assistant stream timeout"));
        activeStreamRef.current = null;
      }, 45000);

      activeStreamRef.current = {
        requestId,
        assistantId: localAssistantId,
        conversationId: payload.conversationId,
        timeoutId,
        resolve,
        reject,
      };

      socket.emit("ai:chat", {
        requestId,
        ...payload,
      });
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    const hasImages = attachedImages.length > 0;
    if ((!value && !hasImages) || loading) return;

    const messageForAi = value || "Please analyze this image.";
    const userMessageContent = value || "[Image attached]";

    setLoading(true);
    setInput("");
    const imagesForRequest = [...attachedImages];
    setAttachedImages([]);
    setAttachedImageNames([]);

    const userMessage: ChatUiMessage = {
      id: `local-user-${Date.now()}`,
      role: "USER",
      content: userMessageContent,
      createdAt: new Date().toISOString(),
      images: imagesForRequest,
    };

    setMessages((prev) => [...prev, userMessage]);
    let conversationId = activeConversationId;

    try {
      if (!conversationId) {
        conversationId = await createConversationAndSelect(false);
      }

      if (socketConnected) {
        const resolvedConversationId = await sendMessageViaWebSocket({
          message: messageForAi,
          conversationId,
          includeContext: true,
          images: imagesForRequest,
        });

        if (resolvedConversationId) {
          conversationId = resolvedConversationId;
          setActiveConversationId(resolvedConversationId);
        }
      } else {
        throw new Error("WebSocket unavailable");
      }

      if (conversationId) {
        await loadMessages(conversationId);
      }
      await loadConversations();
    } catch {
      try {
        const { data } = await api.post<{
          conversationId: string;
          message: AssistantMessage;
          pendingAction?: AssistantPendingAction;
        }>(
          "/ai/chat",
          {
            message: messageForAi,
            conversationId,
            includeContext: true,
            images: imagesForRequest,
          },
        );

        setActiveConversationId(data.conversationId);
        setMessages((prev) => [
          ...prev,
          data.pendingAction
            ? { ...data.message, pendingAction: data.pendingAction }
            : data.message,
        ]);
        await loadConversations();
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `local-error-${Date.now()}`,
            role: "ASSISTANT",
            content:
              "I couldn't reach the AI providers right now. Please check Ollama/API key settings and try again.",
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function filesToDataUrls(files: File[]) {
    const readers = files.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
          reader.readAsDataURL(file);
        }),
    );

    return Promise.all(readers);
  }

  function estimateDataUrlBytes(dataUrl: string) {
    const base64 = dataUrl.split(",")[1] || "";
    return Math.ceil((base64.length * 3) / 4);
  }

  async function loadImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to decode image"));
      image.src = dataUrl;
    });
  }

  async function optimizeImageDataUrl(file: File, sourceDataUrl: string) {
    if (!file.type.startsWith("image/")) {
      return sourceDataUrl;
    }

    const image = await loadImage(sourceDataUrl);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      return sourceDataUrl;
    }

    const outputMime = file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const largestSide = Math.max(image.width, image.height);
    const baseScale = largestSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / largestSide : 1;

    let quality = INITIAL_IMAGE_QUALITY;
    let scale = baseScale;
    let best = sourceDataUrl;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const width = Math.max(1, Math.floor(image.width * scale));
      const height = Math.max(1, Math.floor(image.height * scale));

      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      const candidate = canvas.toDataURL(outputMime, quality);
      best = estimateDataUrlBytes(candidate) < estimateDataUrlBytes(best) ? candidate : best;

      if (estimateDataUrlBytes(best) <= MAX_IMAGE_BYTES) {
        break;
      }

      scale *= 0.85;
      quality = Math.max(MIN_IMAGE_QUALITY, quality - 0.07);
    }

    return estimateDataUrlBytes(best) <= estimateDataUrlBytes(sourceDataUrl)
      ? best
      : sourceDataUrl;
  }

  async function prepareImageDataUrls(files: File[]) {
    const rawDataUrls = await filesToDataUrls(files);
    const processed = await Promise.all(
      files.map(async (file, index) => {
        const source = rawDataUrls[index] || "";
        if (!source) return "";
        try {
          return await optimizeImageDataUrl(file, source);
        } catch {
          return source;
        }
      }),
    );

    return processed.filter(Boolean);
  }

  async function attachImageFiles(files: File[]) {
    const remainingSlots = Math.max(0, MAX_ATTACHED_IMAGES - attachedImages.length);
    if (remainingSlots === 0 || files.length === 0) return;

    const selected = files.slice(0, remainingSlots);
    try {
      const optimizedDataUrls = await prepareImageDataUrls(selected);

      setAttachedImages((prev) => [...prev, ...optimizedDataUrls]);
      setAttachedImageNames((prev) => [
        ...prev,
        ...selected.map((file, index) =>
          file.name || `pasted-image-${Date.now()}-${index + 1}.png`,
        ),
      ]);
    } catch {
      // keep previous attachments if paste/upload fails
    }
  }

  async function handleImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    await attachImageFiles(files);
    event.target.value = "";
  }

  function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (imageFiles.length === 0) return;

    event.preventDefault();
    void attachImageFiles(imageFiles);
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!loading && (input.trim() || attachedImages.length > 0)) {
        void handleSubmit(event as unknown as FormEvent<HTMLFormElement>);
      }
    }
  }

  function removeAttachedImage(indexToRemove: number) {
    setAttachedImages((prev) => prev.filter((_, index) => index !== indexToRemove));
    setAttachedImageNames((prev) => prev.filter((_, index) => index !== indexToRemove));
  }

  async function handleConfirmAction(messageId: string, pendingAction: AssistantPendingAction) {
    if (!activeConversationId) return;

    setConfirmingForMessageId(messageId);
    try {
      const { data } = await api.post<AssistantConfirmActionResponse>(
        "/ai/actions/confirm",
        {
          confirmationToken: pendingAction.confirmationToken,
          conversationId: activeConversationId,
        },
      );

      setMessages((prev) =>
        prev
          .map((msg) =>
            msg.id === messageId ? { ...msg, pendingAction: undefined } : msg,
          )
          .concat({
            id: `local-action-${Date.now()}`,
            role: "ASSISTANT",
            content: data.message,
            createdAt: new Date().toISOString(),
          }),
      );

      await loadConversations();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-action-error-${Date.now()}`,
          role: "ASSISTANT",
          content:
            "Action confirmation failed. The token may have expired or the VM no longer allows this action.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setConfirmingForMessageId(null);
    }
  }

  return (
    <div
      className={
        mode === "compact"
          ? "cyber-card h-[520px] w-full max-w-[420px] p-0 overflow-hidden"
          : "cyber-card h-[calc(100vh-11rem)] p-0 overflow-hidden"
      }
    >
      <div className="h-14 border-b border-cyber-border px-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-cyber-text">AI Assistant</div>
          <div className="text-xs text-cyber-text-dim">
            {activeConversation?.title || "CloudVM Copilot"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void createConversationAndSelect()}
            className="cyber-btn-secondary !px-3 !py-1.5 text-xs"
          >
            New Chat
          </button>
          {mode === "compact" && onClose && (
            <button
              onClick={onClose}
              className="text-cyber-text-dim hover:text-cyber-text text-sm"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 h-[calc(100%-3.5rem)]">
        {mode === "full" && (
          <aside className="col-span-3 border-r border-cyber-border p-3 overflow-y-auto hidden lg:block">
            <div className="text-xs uppercase tracking-wide text-cyber-text-dim mb-3">
              Conversations
            </div>
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => setActiveConversationId(conversation.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                    conversation.id === activeConversationId
                      ? "border-cyber-green/40 bg-cyber-green/10 text-cyber-green"
                      : "border-cyber-border text-cyber-text-dim hover:text-cyber-text hover:bg-cyber-border/30"
                  }`}
                >
                  <div className="text-sm truncate">{conversation.title || "Conversation"}</div>
                  <div className="text-xs opacity-70">{conversation._count?.messages || 0} msgs</div>
                </button>
              ))}
            </div>
          </aside>
        )}

        <section
          className={
            mode === "full"
              ? "col-span-12 lg:col-span-9 flex flex-col min-h-0"
              : "col-span-12 flex flex-col min-h-0"
          }
        >
          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3"
          >
            {loadingHistory ? (
              <div className="text-sm text-cyber-text-dim">Loading conversation...</div>
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center">
                <div>
                  <div className="text-cyber-text font-medium mb-2">Hi {user?.firstName}, ready to help ⚡</div>
                  <p className="text-sm text-cyber-text-dim max-w-md">
                    Ask me about your VMs, quotas, and best next actions. I can also suggest safe operations before execution.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.role === "USER";
                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap ${
                        isUser
                          ? "bg-cyber-green/15 border border-cyber-green/30 text-cyber-text"
                          : "bg-cyber-border/30 border border-cyber-border text-cyber-text"
                      }`}
                    >
                      {message.content}

                      {message.images && message.images.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {message.images.map((image, index) => (
                            <NextImage
                              key={`${message.id}-img-${index}`}
                              src={image}
                              alt={`attachment-${index + 1}`}
                              className="h-16 w-16 rounded-md border border-cyber-border object-cover"
                              width={64}
                              height={64}
                              unoptimized
                            />
                          ))}
                        </div>
                      )}

                      {!isUser && message.pendingAction && (
                        <div className="mt-3 p-3 rounded-lg border border-cyber-orange/30 bg-cyber-orange/10">
                          <div className="text-xs text-cyber-text-dim mb-2">
                            Pending safe action
                          </div>
                          <div className="text-sm text-cyber-text mb-2">
                            {message.pendingAction.action.toUpperCase()} → {message.pendingAction.vmName}
                          </div>
                          <button
                            onClick={() =>
                              handleConfirmAction(message.id, message.pendingAction as AssistantPendingAction)
                            }
                            className="cyber-btn-primary !px-3 !py-1.5 text-xs"
                            disabled={confirmingForMessageId === message.id}
                          >
                            {confirmingForMessageId === message.id
                              ? "Confirming..."
                              : "Confirm action"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-cyber-border p-2 flex items-end gap-2"
          >
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void handleImageSelection(event)}
            />

            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="cyber-btn-secondary !px-3 !py-2 h-10"
              disabled={loading}
              title="Attach screenshot"
            >
              📎
            </button>

            <div className="flex-1 flex flex-col gap-2">
              {attachedImages.length > 0 && (
                <div className="px-1">
                  <div className="text-xs text-cyber-text-dim mb-1">Attached images</div>
                  <div className="flex flex-wrap gap-2">
                    {attachedImages.map((image, index) => (
                      <div
                        key={`attached-image-${index}`}
                        className="relative h-14 w-14"
                        title={attachedImageNames[index] || `Image ${index + 1}`}
                      >
                        <NextImage
                          src={image}
                          alt={attachedImageNames[index] || `Image ${index + 1}`}
                          className="h-14 w-14 rounded-md border border-cyber-border object-cover"
                          width={56}
                          height={56}
                          unoptimized
                        />
                        <button
                          type="button"
                          onClick={() => removeAttachedImage(index)}
                          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-cyber-border text-cyber-text text-xs leading-none"
                          aria-label="Remove image"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onPaste={handleComposerPaste}
              onKeyDown={handleComposerKeyDown}
              className="cyber-input min-h-[44px] max-h-32 resize-none"
              placeholder="Ask the assistant... (Shift+Enter for new line)"
              disabled={loading}
              rows={1}
            />
            </div>

            <button
              type="submit"
              className="cyber-btn-primary !px-4 !py-2 h-10"
              disabled={loading || (!input.trim() && attachedImages.length === 0)}
            >
              {loading ? "Sending..." : "Send"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
