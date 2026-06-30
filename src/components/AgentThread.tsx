import { useEffect, useRef, useState } from "react";
import { Flag } from "lucide-react";
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

export type AgentReportReason =
  | "inaccurate_financial_explanation"
  | "unsafe_or_offensive"
  | "privacy_concern"
  | "confusing_or_misleading"
  | "other";

export type AgentReportInput = {
  messageId: string;
  reason: AgentReportReason;
  details?: string;
  responseExcerpt?: string;
};

const defaultAgentErrorText = "I need another pass at that. Please ask again.";
type MatchMedia = (query: string) => { matches: boolean };

export function AgentThread({
  thread,
  onSubmitPrompt,
  onSuppressMissingCard,
  onReportResponse,
}: {
  thread: AgentThreadItem[];
  onSubmitPrompt?: (prompt: string) => void;
  onSuppressMissingCard?: (issuerName: string) => void;
  onReportResponse?: (input: AgentReportInput) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const latestItemRef = useRef<HTMLElement | null>(null);

  function scrollNodeIntoThread(node: HTMLElement | null) {
    if (!node) {
      return;
    }

    window.requestAnimationFrame(() => {
      node.scrollIntoView({
        block: "end",
        behavior: getThreadScrollBehavior(),
      });
    });
  }

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
      behavior: getThreadScrollBehavior(),
    });
  }, [thread.length, thread.at(-1)?.response?.message, thread.at(-1)?.errorText, thread.at(-1)?.isPending]);

  if (thread.length === 0) {
    return (
      <div
        className="min-h-0 flex-1"
        data-testid="agent-thread"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        ref={containerRef}
      />
    );
  }

  return (
    <div
      className="chat-thread-in min-h-0 flex-1 space-y-4 overflow-y-auto pb-2 pr-1"
      data-testid="agent-thread"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      ref={containerRef}
    >
      {thread.map((item, itemIndex) => (
        <article
          key={item.id}
          className="space-y-3"
          ref={itemIndex === thread.length - 1 ? latestItemRef : null}
        >
          <div className="pip-wrap-anywhere pip-user-bubble chat-message-in ml-auto w-fit max-w-[86%] whitespace-pre-wrap break-words rounded-[1.25rem] border border-line bg-porcelain/60 px-4 py-3 text-sm font-medium text-ink/[0.82] shadow-[0_8px_18px_rgba(60,50,40,0.04)]">
            {item.userText}
          </div>
          {item.response ? (
            <div className="pip-assistant-row chat-message-in chat-message-in-delay flex items-start gap-2.5">
              <PipCharacter size="avatar" expression="happy" action="talking" />
              <div className="min-w-0 flex-1 space-y-3">
                <p className="pip-wrap-anywhere pip-assistant-bubble glass-panel px-4 py-3 text-sm font-medium leading-6 text-ink/[0.82]">
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
                {onReportResponse ? (
                  <ReportResponseControl
                    messageId={item.id}
                    responseExcerpt={item.response.message}
                    onReportResponse={onReportResponse}
                    onOpen={scrollNodeIntoThread}
                  />
                ) : null}
                {item.errorText ? (
                  <p className="pip-wrap-anywhere pip-error-bubble glass-panel border-red-200/80 bg-red-50/[0.84] px-4 py-3 text-sm font-medium leading-6 text-red-800">
                    {item.errorText}
                  </p>
                ) : null}
              </div>
            </div>
          ) : item.isPending ? (
            <ThinkingBubble />
          ) : (
            <div className="pip-assistant-row chat-message-in flex items-start gap-2.5">
              <PipCharacter size="avatar" expression="concerned" action="settle" />
              <p className="pip-wrap-anywhere pip-error-bubble glass-panel border-red-200/80 bg-red-50/[0.84] px-4 py-3 text-sm font-medium leading-6 text-red-800">
                {item.errorText ?? defaultAgentErrorText}
              </p>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

export function ReportResponseControl({
  messageId,
  responseExcerpt,
  onReportResponse,
  initialOpen = false,
  onOpen,
}: {
  messageId: string;
  responseExcerpt: string;
  onReportResponse: (input: AgentReportInput) => Promise<void>;
  initialOpen?: boolean;
  onOpen?: (node: HTMLElement | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [reason, setReason] = useState<AgentReportReason>("inaccurate_financial_explanation");
  const [details, setDetails] = useState("");
  const [statusText, setStatusText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      onOpen?.(panelRef.current);
    }
  }, [isOpen, onOpen]);

  async function submitReport() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setStatusText("");

    try {
      await onReportResponse({
        messageId,
        reason,
        details: details.trim() || undefined,
        responseExcerpt: responseExcerpt.slice(0, 1200),
      });
      setStatusText("Report sent.");
      setDetails("");
      setIsOpen(false);
    } catch (error) {
      setStatusText(getReportErrorText(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="focus-ring ui-pressable inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-[0.68rem] font-semibold text-taupe/75 hover:text-ink"
        onClick={() => {
          setIsOpen((current) => !current);
          setStatusText("");
        }}
      >
        <Flag aria-hidden="true" size={11} strokeWidth={2.3} />
        <span>{isOpen ? "Close" : "Report"}</span>
      </button>
      {isOpen ? (
        <div className="glass-panel space-y-3 rounded-[0.9rem] px-3 py-3" ref={panelRef}>
          <p className="text-xs font-bold uppercase tracking-normal text-taupe" id={`report-reason-${messageId}`}>
            Reason
          </p>
          <div className="flex flex-wrap gap-2" aria-labelledby={`report-reason-${messageId}`}>
            {reportReasonOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={[
                  "focus-ring ui-pressable min-h-11 rounded-full border px-3 text-xs font-semibold",
                  reason === option.value
                    ? "border-moss bg-moss text-paper"
                    : "border-line bg-white/55 text-ink/75 hover:border-moss",
                ].join(" ")}
                aria-pressed={reason === option.value}
                onClick={() => setReason(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="block text-xs font-bold uppercase tracking-normal text-taupe" htmlFor={`report-details-${messageId}`}>
            Details
          </label>
          <textarea
            id={`report-details-${messageId}`}
            className="focus-ring min-h-[5rem] w-full resize-y rounded-[0.75rem] border border-line bg-white/80 px-3 py-2 text-sm leading-6 text-ink"
            maxLength={1000}
            placeholder="What looked wrong?"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="focus-ring ui-pressable inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-3 text-xs font-bold text-paper disabled:bg-ink/35"
              disabled={isSubmitting}
              onClick={submitReport}
            >
              {isSubmitting ? "Sending..." : "Send"}
            </button>
            <button
              type="button"
              className="focus-ring ui-pressable inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white/55 px-3 text-xs font-semibold text-ink/75"
              onClick={() => {
                setIsOpen(false);
                setStatusText("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {statusText ? (
        <p className="text-xs font-semibold text-taupe" role="status">
          {statusText}
        </p>
      ) : null}
    </div>
  );
}

const reportReasonOptions: Array<{
  value: AgentReportReason;
  label: string;
}> = [
  {
    value: "inaccurate_financial_explanation",
    label: "Inaccurate",
  },
  {
    value: "unsafe_or_offensive",
    label: "Unsafe",
  },
  {
    value: "privacy_concern",
    label: "Privacy",
  },
  {
    value: "confusing_or_misleading",
    label: "Confusing",
  },
  {
    value: "other",
    label: "Other",
  },
];

function getThreadScrollBehavior(matchMedia: MatchMedia | undefined = getMatchMedia()): ScrollBehavior {
  return matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function getMatchMedia(): MatchMedia | undefined {
  return typeof window === "undefined" ? undefined : window.matchMedia?.bind(window);
}

function getReportErrorText(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "I couldn’t send that report.";
}

export const __agentThreadTestHooks = {
  getReportErrorText,
  getThreadScrollBehavior,
  reportReasonOptions,
};

function ThinkingBubble() {
  return (
    <div className="pip-assistant-row chat-message-in chat-message-in-delay flex items-start gap-2.5">
      <PipCharacter size="avatar" expression="thinking" action="thinking" />
      <div
        className="pip-thinking-bubble glass-panel inline-flex items-center gap-3 px-5 py-4 text-sm font-semibold text-taupe"
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
