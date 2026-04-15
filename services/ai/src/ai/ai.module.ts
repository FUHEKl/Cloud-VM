import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { AiChatGateway } from "./ai-chat.gateway";
import { OllamaProvider } from "./providers/ollama.provider";
import { OpenRouterProvider } from "./providers/openrouter.provider";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || "",
    }),
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AiChatGateway,
    OllamaProvider,
    OpenRouterProvider,
  ],
})
export class AiModule {}
