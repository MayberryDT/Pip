"use client";

import type { ReactNode } from "react";
import { PipCharacter } from "@/components/brand/PipCharacter";

export function PipIntroScene({
  title,
  children,
  notice,
  actions,
  footer,
  className = "",
  messageClassName = "",
  priority = false,
}: {
  title: ReactNode;
  children?: ReactNode;
  notice?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  messageClassName?: string;
  priority?: boolean;
}) {
  return (
    <div className={`assistant-intro-stack ${className}`.trim()}>
      <section className={`glass-panel assistant-intro-message px-5 py-4 ${messageClassName}`.trim()}>
        {notice}
        <p className="font-display text-[1.28rem] leading-[1.32] text-ink max-[380px]:text-[1.16rem]">
          {title}
        </p>
        {children ? <div className="mt-3 text-sm leading-6 text-ink/[0.66]">{children}</div> : null}
        {actions ? <div className="mt-5">{actions}</div> : null}
      </section>
      <div className="assistant-intro-character">
        <PipCharacter
          size="medium"
          expression="onboarding-wave"
          action="wave"
          priority={priority}
          className="assistant-intro-character-image"
        />
      </div>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </div>
  );
}
