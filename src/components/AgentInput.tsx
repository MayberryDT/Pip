"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";

const composerMaxHeight = 216;
const keyboardInsetActivationThreshold = 120;
const composerViewportVarNames = [
  "--pip-chat-shell-height",
  "--pip-chat-shell-top",
  "--pip-keyboard-inset",
] as const;

type ComposerStyle = Pick<CSSStyleDeclaration, "height" | "overflowY">;
type ComposerInput = {
  blur: () => void;
  disabled: boolean;
  scrollHeight: number;
  style: ComposerStyle;
};
type ComposerForm = Pick<HTMLFormElement, "scrollIntoView">;
type MatchMedia = (query: string) => Pick<MediaQueryList, "matches">;
type FrameScheduler = (callback: () => void) => number | void;
type TimeoutScheduler = (callback: () => void, delay: number) => number | void;
type ViewportLike = Pick<VisualViewport, "height" | "offsetTop">;

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
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    resizeComposerInput(inputRef.current);
  }, [message]);

  useEffect(() => installComposerViewportSync(), []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();

    if (!trimmed || busy || disabled) {
      return;
    }

    const result = onSubmit(trimmed);
    setMessage("");
    settleComposerAfterSubmit(inputRef.current);
    void Promise.resolve(result).finally(() => scheduleComposerResize(inputRef.current));
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
      ref={formRef}
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
        onFocus={() => scheduleComposerIntoView(formRef.current)}
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

function resizeComposerInput(input: Pick<ComposerInput, "scrollHeight" | "style"> | null) {
  if (!input) {
    return;
  }

  input.style.height = "0px";
  input.style.height = `${Math.min(input.scrollHeight, composerMaxHeight)}px`;
  input.style.overflowY = input.scrollHeight > composerMaxHeight ? "auto" : "hidden";
}

function scheduleComposerResize(
  input: Pick<ComposerInput, "scrollHeight" | "style"> | null,
  schedule: FrameScheduler = getAnimationFrameScheduler(),
) {
  schedule(() => resizeComposerInput(input));
}

function settleComposerAfterSubmit(
  input: ComposerInput | null,
  options: {
    matchMedia?: MatchMedia;
    maxTouchPoints?: number;
    schedule?: FrameScheduler;
  } = {},
) {
  const schedule = options.schedule ?? getAnimationFrameScheduler();

  schedule(() => {
    resizeComposerInput(input);

    if (input && !input.disabled && shouldDismissKeyboardAfterSubmit(options)) {
      input.blur();
    }
  });
}

function shouldDismissKeyboardAfterSubmit({
  matchMedia = getMatchMedia(),
  maxTouchPoints = getMaxTouchPoints(),
}: {
  matchMedia?: MatchMedia;
  maxTouchPoints?: number;
} = {}) {
  if (matchMedia?.("(pointer: coarse)").matches || matchMedia?.("(hover: none)").matches) {
    return true;
  }

  return !matchMedia && maxTouchPoints > 0;
}

function scheduleComposerIntoView(
  form: ComposerForm | null,
  options: {
    matchMedia?: MatchMedia;
    schedule?: FrameScheduler;
    setTimeout?: TimeoutScheduler;
  } = {},
) {
  if (!form || typeof form.scrollIntoView !== "function") {
    return;
  }

  const scroll = () => {
    form.scrollIntoView({
      block: "end",
      behavior: getComposerScrollBehavior(options.matchMedia),
    });
  };
  const schedule = options.schedule ?? getAnimationFrameScheduler();
  const setTimeout = options.setTimeout ?? getTimeoutScheduler();

  schedule(scroll);
  setTimeout(scroll, 140);
}

function getComposerScrollBehavior(matchMedia: MatchMedia | undefined = getMatchMedia()): ScrollBehavior {
  return matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function installComposerViewportSync() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return undefined;
  }

  const root = document.documentElement;
  const sync = () => {
    const vars = getComposerViewportVars({
      innerHeight: window.innerHeight,
      viewport: window.visualViewport ?? null,
    });

    for (const [property, value] of Object.entries(vars)) {
      root.style.setProperty(property, value);
    }
  };
  const viewport = window.visualViewport;

  sync();
  window.addEventListener("resize", sync);
  viewport?.addEventListener("resize", sync);
  viewport?.addEventListener("scroll", sync);

  return () => {
    window.removeEventListener("resize", sync);
    viewport?.removeEventListener("resize", sync);
    viewport?.removeEventListener("scroll", sync);

    for (const property of composerViewportVarNames) {
      root.style.removeProperty(property);
    }
  };
}

function getComposerViewportVars({
  innerHeight,
  viewport,
}: {
  innerHeight: number;
  viewport?: ViewportLike | null;
}): Record<(typeof composerViewportVarNames)[number], string> {
  const viewportHeight = Math.max(0, viewport?.height ?? innerHeight);
  const viewportOffsetTop = Math.max(0, viewport?.offsetTop ?? 0);
  const rawKeyboardInset = viewport ? Math.max(0, innerHeight - viewportHeight - viewportOffsetTop) : 0;
  const keyboardInset = rawKeyboardInset > keyboardInsetActivationThreshold ? rawKeyboardInset : 0;

  return {
    "--pip-chat-shell-height": `${Math.max(0, viewportHeight + keyboardInset)}px`,
    "--pip-chat-shell-top": `${viewportOffsetTop}px`,
    "--pip-keyboard-inset": `${keyboardInset}px`,
  };
}

function getAnimationFrameScheduler(): FrameScheduler {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return (callback) => callback();
  }

  return (callback) => window.requestAnimationFrame(() => callback());
}

function getTimeoutScheduler(): TimeoutScheduler {
  if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
    return (callback) => callback();
  }

  return (callback, delay) => window.setTimeout(callback, delay);
}

function getMatchMedia(): MatchMedia | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return undefined;
  }

  return window.matchMedia.bind(window);
}

function getMaxTouchPoints(): number {
  if (typeof navigator === "undefined") {
    return 0;
  }

  return navigator.maxTouchPoints ?? 0;
}

export const __agentInputTestHooks = {
  getComposerScrollBehavior,
  getComposerViewportVars,
  resizeComposerInput,
  settleComposerAfterSubmit,
  shouldDismissKeyboardAfterSubmit,
};
