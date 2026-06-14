"use client";

import { PipCharacter, type PipCharacterExpression } from "@/components/brand/PipCharacter";

type PipAvatarSize = "xs" | "sm" | "md" | "lg";
type PipAvatarExpression =
  | PipCharacterExpression
  | "neutral"
  | "reassuring"
  | "careful"
  | "uncertain"
  | "sleepy"
  | "shortfall";

export type PipAvatarProps = {
  size?: PipAvatarSize;
  expression?: PipAvatarExpression;
  withSprig?: boolean;
  ariaLabel?: string;
  className?: string;
};

const avatarClassBySize = {
  xs: "h-10 w-10",
  sm: "h-14 w-14",
  md: "h-16 w-16",
  lg: "h-24 w-24",
} satisfies Record<PipAvatarSize, string>;

function mapAvatarExpression(expression: PipAvatarExpression | undefined): PipCharacterExpression {
  switch (expression) {
    case "happy":
      return "happy";
    case "thinking":
      return "thinking";
    case "concerned":
      return "concerned";
    case "normal":
    case "onboarding-wave":
    case "neutral":
    case "reassuring":
    case "careful":
    case "uncertain":
    case "sleepy":
    case "shortfall":
    case undefined:
    default:
      return "normal";
  }
}

export function PipAvatar({
  size = "sm",
  expression = "normal",
  ariaLabel = "Pip",
  className,
}: PipAvatarProps) {
  const pipExpression = mapAvatarExpression(expression);

  return (
    <span
      className={[
        avatarClassBySize[size],
        "grid shrink-0 overflow-hidden rounded-full bg-porcelain shadow-[0_10px_24px_rgba(60,50,40,0.08)]",
        className,
      ].filter(Boolean).join(" ")}
      role="img"
      aria-label={ariaLabel}
    >
      <PipCharacter
        size="avatar"
        expression={pipExpression}
        ariaLabel=""
        className="!h-full !w-full scale-[1.12] rounded-full object-cover"
      />
    </span>
  );
}
