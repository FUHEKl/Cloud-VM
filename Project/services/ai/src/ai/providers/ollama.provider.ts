import { Injectable } from "@nestjs/common";
import {
  ChatProvider,
  ProviderChatResult,
  ProviderMessage,
} from "./provider.interface";

@Injectable()
export class OllamaProvider implements ChatProvider {
  readonly name = "ollama";

  private readonly baseUrl =
    process.env.OLLAMA_BASE_URL || "http://ollama:11434";
  private readonly model = process.env.OLLAMA_MODEL || "mistral";
  private readonly visionModel = process.env.OLLAMA_VISION_MODEL || "";

  isAvailable(): boolean {
    return Boolean(this.baseUrl && this.model);
  }

  async chat(messages: ProviderMessage[]): Promise<ProviderChatResult> {
    const hasImages = messages.some(
      (message) => Boolean(message.images && message.images.length > 0),
    );

    if (hasImages && !this.visionModel) {
      throw new Error(
        "Vision model is not configured. Set OLLAMA_VISION_MODEL for image analysis.",
      );
    }

    const modelToUse = hasImages ? this.visionModel : this.model;

    const ollamaMessages = messages.map((message) => {
      if (!message.images || message.images.length === 0) {
        return {
          role: message.role,
          content: message.content,
        };
      }

      return {
        role: message.role,
        content: message.content,
        images: message.images
          .map((image) => {
            const marker = "base64,";
            const markerIndex = image.indexOf(marker);
            return markerIndex >= 0
              ? image.slice(markerIndex + marker.length)
              : image;
          })
          .filter(Boolean),
      };
    });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelToUse,
        stream: false,
        messages: ollamaMessages,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const normalized = errorBody.replace(/\s+/g, " ").trim();
      const detail = normalized ? `: ${normalized.slice(0, 300)}` : "";
      throw new Error(`Ollama request failed with status ${response.status}${detail}`);
    }

    const data = (await response.json()) as {
      message?: { content?: string };
      model?: string;
    };

    const content = data.message?.content?.trim();
    if (!content) {
      throw new Error("Ollama returned an empty response");
    }

    return {
      provider: this.name,
      model: data.model || modelToUse,
      content,
    };
  }
}
