export type ProviderRole = "system" | "user" | "assistant";

export interface ProviderMessage {
  role: ProviderRole;
  content: string;
  images?: string[];
}

export interface ProviderChatResult {
  provider: string;
  model: string;
  content: string;
}

export interface ChatProvider {
  readonly name: string;
  isAvailable(): boolean;
  chat(messages: ProviderMessage[]): Promise<ProviderChatResult>;
}
