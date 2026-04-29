"use client";

import AssistantChat from "@/components/assistant/AssistantChat";

export default function AssistantPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-cyber-text">AI Assistant</h1>
        <p className="text-cyber-text-dim mt-1">
          Ask questions, get VM guidance, and trigger safe actions with confirmation.
        </p>
      </div>
      <AssistantChat mode="full" />
    </div>
  );
}
