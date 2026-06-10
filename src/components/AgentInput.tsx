"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";

const composerMaxHeight = 216;

export function AgentInput({
  busy,
  disabled,
  onSubmit,
  placeholder = "Ask Pip anything...",
}: {
  busy?: boolean;
  disabled?: boolean;
  onSubmit: (message: string) => void | Promise<void>;
  placeholder?: string;
}) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.style.height = "0px";
    input.style.height = `${Math.min(input.scrollHeight, composerMaxHeight)}px`;
    input.style.overflowY = input.scrollHeight > composerMaxHeight ? "auto" : "hidden";
  }, [message]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();

    if (!trimmed || busy || disabled) {
      return;
    }

    const result = onSubmit(trimmed);
    setMessage("");
    resetComposerViewport(inputRef.current);
    void Promise.resolve(result).finally(() => resetComposerViewport(inputRef.current));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form
      className="relative mt-auto shrink-0 pt-4"
      data-testid="agent-input"
      onSubmit={handleSubmit}
      aria-busy={busy}
    >
      <textarea
        ref={inputRef}
        rows={1}
        className="focus-ring max-h-56 min-h-[3.55rem] w-full resize-none overflow-y-hidden rounded-[1.35rem] border border-line bg-porcelain/[0.34] px-5 py-4 pr-16 text-base font-medium leading-6 text-ink shadow-[0_14px_36px_rgba(60,50,40,0.04)] placeholder:text-taupe/[0.84] max-[380px]:min-h-[3.35rem] max-[380px]:text-[0.96rem]"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Ask Pip"
        disabled={disabled}
      />
      <button
        type="submit"
        className="focus-ring absolute bottom-2 right-2 grid h-11 w-11 place-items-center rounded-full bg-ink text-paper shadow-[0_12px_28px_rgba(43,42,39,0.16)] transition hover:bg-ink/[0.82] disabled:pointer-events-none disabled:opacity-0 max-[380px]:h-10 max-[380px]:w-10"
        disabled={disabled || busy || !message.trim()}
        aria-label="Send"
        title="Send"
      >
        <SendHorizontal aria-hidden="true" size={20} />
      </button>
    </form>
  );
}

function resetComposerViewport(input: HTMLTextAreaElement | null) {
  if (!input) {
    return;
  }

  requestAnimationFrame(() => {
    input.style.height = "0px";
    input.style.height = `${Math.min(input.scrollHeight, composerMaxHeight)}px`;
    input.style.overflowY = input.scrollHeight > composerMaxHeight ? "auto" : "hidden";

    if (!input.disabled) {
      input.focus({ preventScroll: true });
    }
  });
}
