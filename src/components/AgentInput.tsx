"use client";

import { FormEvent, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";

export function AgentInput({
  busy,
  disabled,
  onSubmit,
  placeholder = "Ask anything...",
}: {
  busy?: boolean;
  disabled?: boolean;
  onSubmit: (message: string) => void | Promise<void>;
  placeholder?: string;
}) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();

    if (!trimmed || busy || disabled) {
      return;
    }

    const result = onSubmit(trimmed);
    setMessage("");
    requestAnimationFrame(() => inputRef.current?.focus());
    void Promise.resolve(result).finally(() => inputRef.current?.focus());
  }

  return (
    <form
      className="relative mt-auto pt-4"
      data-testid="agent-input"
      onSubmit={handleSubmit}
      aria-busy={busy}
    >
      <input
        ref={inputRef}
        className="focus-ring min-h-[4.05rem] w-full rounded-[1.55rem] border border-line bg-porcelain/[0.34] px-6 pr-16 text-[1.35rem] font-medium text-ink shadow-[0_14px_36px_rgba(60,50,40,0.04)] placeholder:text-taupe/[0.84] max-[380px]:min-h-[3.7rem] max-[380px]:text-[1.15rem]"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={placeholder}
        aria-label="Ask Spendable"
        disabled={disabled}
      />
      <button
        type="submit"
        className="focus-ring absolute right-2 top-6 grid h-12 w-12 place-items-center rounded-full bg-ink text-paper shadow-[0_12px_28px_rgba(43,42,39,0.16)] transition hover:bg-ink/[0.82] disabled:pointer-events-none disabled:opacity-0 max-[380px]:top-[1.35rem] max-[380px]:h-10 max-[380px]:w-10"
        disabled={disabled || busy || !message.trim()}
        aria-label="Send"
        title="Send"
      >
        <SendHorizontal aria-hidden="true" size={20} />
      </button>
    </form>
  );
}
