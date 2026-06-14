"use client";

import { useEffect, useState } from "react";

export type PipCharacterSize = "avatar" | "medium";

export type PipCharacterExpression =
  | "normal"
  | "happy"
  | "thinking"
  | "concerned"
  | "onboarding-wave";

export type PipCharacterAction =
  | "idle"
  | "thinking"
  | "talking"
  | "notice"
  | "celebrate"
  | "settle"
  | "wave";

export type PipCharacterMood =
  | "normal"
  | "happy"
  | "careful"
  | "concerned"
  | "uncertain"
  | "sleepy";

export type PipCharacterProps = {
  size?: PipCharacterSize;
  expression?: PipCharacterExpression;
  action?: PipCharacterAction;
  priority?: boolean;
  className?: string;
  ariaLabel?: string;
  mood?: PipCharacterMood;
  intensity?: 0 | 1 | 2 | 3;
};

const avatarAssetPaths = {
  normal: "/brand/pip-character/v001/avatar/normal.png",
  happy: "/brand/pip-character/v001/avatar/happy.png",
  thinking: "/brand/pip-character/v001/avatar/thinking.png",
  concerned: "/brand/pip-character/v001/avatar/concerned.png",
} satisfies Record<Exclude<PipCharacterExpression, "onboarding-wave">, string>;

const exactAssetPaths: Partial<Record<`${PipCharacterSize}/${PipCharacterExpression}`, string>> = {
  "avatar/normal": avatarAssetPaths.normal,
  "avatar/happy": avatarAssetPaths.happy,
  "avatar/thinking": avatarAssetPaths.thinking,
  "avatar/concerned": avatarAssetPaths.concerned,
  "medium/onboarding-wave": "/brand/pip-character/v001/medium/onboarding-wave.png",
};

const legacyPipFallbackPath = "/brand/pip-profile-clean.png";

export function getPipCharacterAssetSources(
  size: PipCharacterSize,
  expression: PipCharacterExpression,
): string[] {
  return [
    exactAssetPaths[`${size}/${expression}`],
    avatarAssetPaths.normal,
    legacyPipFallbackPath,
  ].filter((source, index, sources): source is string => {
    return Boolean(source) && sources.indexOf(source) === index;
  });
}

export function getPipCharacterAssetPath(
  size: PipCharacterSize,
  expression: PipCharacterExpression,
): string {
  return getPipCharacterAssetSources(size, expression)[0] ?? legacyPipFallbackPath;
}

function expressionFromMood(mood: PipCharacterMood): PipCharacterExpression {
  switch (mood) {
    case "happy":
      return "happy";
    case "careful":
    case "concerned":
    case "uncertain":
      return "concerned";
    case "normal":
    case "sleepy":
    default:
      return "normal";
  }
}

export function PipCharacter({
  size = "avatar",
  expression,
  action = "idle",
  priority = false,
  className,
  ariaLabel = "Pip",
  mood = "normal",
}: PipCharacterProps) {
  const resolvedExpression = expression ?? expressionFromMood(mood);
  const sources = getPipCharacterAssetSources(size, resolvedExpression);
  const [sourceIndex, setSourceIndex] = useState(0);
  const src = sources[Math.min(sourceIndex, sources.length - 1)] ?? legacyPipFallbackPath;

  useEffect(() => {
    setSourceIndex(0);
  }, [size, resolvedExpression]);

  return (
    <img
      src={src}
      alt={ariaLabel}
      aria-label={ariaLabel || undefined}
      width={size === "medium" ? 640 : 160}
      height={size === "medium" ? 640 : 160}
      className={[
        "pip-character",
        `pip-character-${size}`,
        className,
      ].filter(Boolean).join(" ")}
      data-action={action}
      data-expression={resolvedExpression}
      data-size={size}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      draggable={false}
      onError={() => {
        setSourceIndex((currentIndex) => Math.min(currentIndex + 1, sources.length - 1));
      }}
    />
  );
}
