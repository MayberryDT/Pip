import { useEffect, useRef } from "react";
import type { AgentResponse } from "@/lib/agent/card-types";
import { PipCharacter } from "@/components/brand/PipCharacter";
import { CardRenderer } from "@/components/cards/CardRenderer";

export type AgentThreadItem = {
  id: string;
  userText: string;
  response?: AgentResponse;
  errorText?: string;
  isPending?: boolean;
};

const defaultAgentErrorText = "I couldn’t answer that cleanly. Try again.";

export function AgentThread({
  thread,
  onSubmitPrompt,
  onSuppressMissingCard,
}: {
  thread: AgentThreadItem[];
  onSubmitPrompt?: (prompt: string) => void;
  onSuppressMissingCard?: (issuerName: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latestItemRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const latestItem = latestItemRef.current;

    if (!container || !latestItem) {
      return;
    }

    const targetTop = Math.max(
      0,
      latestItem.offsetTop - container.offsetTop + latestItem.offsetHeight - container.clientHeight + 12,
    );

    container.scrollTo({
      top: targetTop,
      behavior: "smooth",
    });
  }, [thread.length, thread.at(-1)?.response?.message, thread.at(-1)?.errorText, thread.at(-1)?.isPending]);

  if (thread.length === 0) {
    return <div className="min-h-0 flex-1" data-testid="agent-thread" />;
  }

  return (
    <div
      className="chat-thread-in min-h-0 flex-1 space-y-5 overflow-y-auto pb-4 pr-1"
      data-testid="agent-thread"
      ref={containerRef}
    >
      {thread.map((item, itemIndex) => (
        <article
          key={item.id}
          className="space-y-4"
          ref={itemIndex === thread.length - 1 ? latestItemRef : null}
        >
          <div className="chat-message-in ml-auto w-fit max-w-[86%] whitespace-pre-wrap break-words rounded-[1.25rem] border border-line bg-porcelain/60 px-4 py-3 text-sm font-medium text-ink/[0.82] shadow-[0_8px_18px_rgba(60,50,40,0.04)]">
            {item.userText}
          </div>
          {item.response ? (
            <div className="chat-message-in chat-message-in-delay flex items-start gap-3">
              <PipCharacter size="avatar" expression="happy" action="talking" />
              <div className="min-w-0 flex-1 space-y-3">
                <p className="glass-panel px-4 py-3 text-sm font-medium leading-6 text-ink/[0.82]">
                  {item.response.message}
                </p>
                {item.response.cards.map((card, index) => (
                  <CardRenderer
                    key={`${item.id}-${card.type}-${index}`}
                    card={card}
                    onSubmitPrompt={onSubmitPrompt}
                    onSuppressMissingCard={onSuppressMissingCard}
                  />
                ))}
                {item.errorText ? (
                  <p className="glass-panel border-red-200/80 bg-red-50/[0.84] px-4 py-3 text-sm font-medium leading-6 text-red-800">
                    {item.errorText}
                  </p>
                ) : null}
              </div>
            </div>
          ) : item.isPending ? (
            <ThinkingBubble />
          ) : (
            <div className="chat-message-in flex items-start gap-3">
              <PipCharacter size="avatar" expression="concerned" action="settle" />
              <p className="glass-panel border-red-200/80 bg-red-50/[0.84] px-4 py-3 text-sm font-medium leading-6 text-red-800">
                {item.errorText ?? defaultAgentErrorText}
              </p>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="chat-message-in chat-message-in-delay flex items-start gap-3">
      <PipCharacter size="avatar" expression="thinking" action="thinking" />
      <div
        className="glass-panel inline-flex items-center gap-3 px-5 py-4 text-sm font-semibold text-taupe"
        data-testid="agent-thinking"
        role="status"
        aria-live="polite"
      >
        <span>Thinking</span>
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          <span className="thinking-dot" />
          <span className="thinking-dot thinking-dot-delay-1" />
          <span className="thinking-dot thinking-dot-delay-2" />
        </span>
      </div>
    </div>
  );
}
