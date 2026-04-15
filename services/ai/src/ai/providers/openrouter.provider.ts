import { Injectable } from "@nestjs/common";
import {
  ChatProvider,
  ProviderChatResult,
  ProviderMessage,
} from "./provider.interface";

@Injectable()
export class OpenRouterProvider implements ChatProvider {
  readonly name = "openrouter";

  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private readonly baseUrl =
    process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  private readonly model =
    process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free";

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async chat(messages: ProviderMessage[]): Promise<ProviderChatResult> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key is not configured");
    }

    const payloadMessages = messages.map((message) => {
      if (!message.images || message.images.length === 0) {
        return {
          role: message.role,
          content: message.content,
        };
      }

      return {
        role: message.role,
        content: [
          {
            type: "text",
            text: message.content,
          },
          ...message.images.map((image) => ({
            type: "image_url",
            image_url: { url: image },
          })),
        ],
      };
    });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: payloadMessages,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenRouter request failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenRouter returned an empty response");
    }

    return {
      provider: this.name,
      model: data.model || this.model,
      content,
    };
  }
}
