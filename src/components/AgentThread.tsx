import { useEffect, useRef } from "react";
import type { AgentResponse } from "@/lib/agent/card-types";
import { CardRenderer } from "@/components/cards/CardRenderer";

export type AgentThreadItem = {
  id: string;
  userText: string;
  response?: AgentResponse;
  errorText?: string;
  isPending?: boolean;
};

export function AgentThread({
  thread,
  onSuppressMissingCard,
}: {
  thread: AgentThreadItem[];
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
          <div className="chat-message-in ml-auto w-fit max-w-[86%] rounded-[1.25rem] border border-line bg-porcelain/60 px-4 py-3 text-sm font-medium text-ink/[0.82] shadow-[0_8px_18px_rgba(60,50,40,0.04)]">
            {item.userText}
          </div>
          {item.response ? (
            <div className="chat-message-in chat-message-in-delay space-y-3">
              <p className="glass-panel font-display px-5 py-4 text-[1.35rem] leading-[1.32] text-ink max-[380px]:text-[1.18rem]">
                {item.response.message}
              </p>
              {item.response.cards.map((card, index) => (
                <CardRenderer
                  key={`${item.id}-${card.type}-${index}`}
                  card={card}
                  onSuppressMissingCard={onSuppressMissingCard}
                />
              ))}
            </div>
          ) : item.isPending ? (
            <ThinkingBubble />
          ) : (
            <p className="chat-message-in rounded-[1.25rem] border border-red-200 bg-red-50/[0.84] px-4 py-3 text-sm leading-6 text-red-800">
              {item.errorText ?? "AI request failed."}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div
      className="chat-message-in glass-panel inline-flex items-center gap-3 px-5 py-4 text-sm font-semibold text-taupe"
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
  );
}
