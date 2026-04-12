import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AiService } from "./ai.service";
import { ChatRequestDto } from "./dto/chat.dto";
import { ConfirmActionDto } from "./dto/confirm-action.dto";
import { CreateConversationDto } from "./dto/create-conversation.dto";

interface CurrentUserShape {
  userId: string;
  email: string;
  role: string;
}

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("conversations")
  createConversation(
    @CurrentUser() user: CurrentUserShape,
    @Body() dto: CreateConversationDto,
  ) {
    return this.aiService.createConversation(user, dto);
  }

  @Get("conversations")
  listConversations(@CurrentUser() user: CurrentUserShape) {
    return this.aiService.listConversations(user);
  }

  @Get("conversations/:conversationId/messages")
  getMessages(
    @CurrentUser() user: CurrentUserShape,
    @Param("conversationId") conversationId: string,
  ) {
    return this.aiService.getMessages(user, conversationId);
  }

  @Post("chat")
  chat(@CurrentUser() user: CurrentUserShape, @Body() dto: ChatRequestDto) {
    return this.aiService.chat(user, dto);
  }

  @Post("actions/confirm")
  confirmAction(
    @CurrentUser() user: CurrentUserShape,
    @Body() dto: ConfirmActionDto,
  ) {
    return this.aiService.confirmAction(user, dto);
  }

  @Post("chat/stream")
  async streamChat(
    @CurrentUser() user: CurrentUserShape,
    @Body() dto: ChatRequestDto,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const result = await this.aiService.chat(user, dto);
      const content = result.message.content;

      res.write(
        `event: meta\ndata: ${JSON.stringify({
          conversationId: result.conversationId,
          messageId: result.message.id,
          provider: result.message.provider,
          model: result.message.model,
          pendingAction: result.pendingAction,
        })}\n\n`,
      );

      for (const token of content.split(/(\s+)/).filter(Boolean)) {
        res.write(`data: ${JSON.stringify({ type: "chunk", token })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Streaming failed";
      res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
      res.end();
    }
  }
}
