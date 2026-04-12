import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { AiChatGateway } from "./ai-chat.gateway";
import { OllamaProvider } from "./providers/ollama.provider";
import { OpenRouterProvider } from "./providers/openrouter.provider";
import { AiRateLimitGuard } from "../common/guards/ai-rate-limit.guard";

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
    AiRateLimitGuard,
  ],
})
export class AiModule {}
