"use client";

import { useId } from "react";

export type PipMascotProps = {
  size?: "xs" | "sm" | "md" | "lg" | "hero";
  variant?: "avatar" | "small" | "card" | "hero" | "appIcon" | "expressive";
  expression?: "neutral" | "happy" | "concerned" | "reassuring";
  withSprig?: boolean;
  ariaLabel?: string;
  className?: string;
};

const sizeClassBySize = {
  xs: "h-9 w-9",
  sm: "h-12 w-12",
  md: "h-20 w-20",
  lg: "h-28 w-28",
  hero: "h-40 w-40",
} satisfies Record<NonNullable<PipMascotProps["size"]>, string>;

export function PipMascot({
  size = "md",
  variant = "avatar",
  expression = "happy",
  withSprig = true,
  ariaLabel,
  className,
}: PipMascotProps) {
  const id = useId().replace(/:/g, "");
  const bodyGlowId = `${id}-pip-body-glow`;
  const shadowId = `${id}-pip-shadow`;
  const isExpressive = variant === "expressive" || variant === "hero";
  const showArms = size === "md" || size === "lg" || size === "hero" || variant === "appIcon";
  const smilePath = expression === "concerned"
    ? "M92 110 Q108 102 124 110"
    : expression === "reassuring"
      ? "M91 104 Q108 118 125 104"
      : "M93 101 Q108 113 123 101";

  return (
    <svg
      className={[sizeClassBySize[size], "shrink-0", className].filter(Boolean).join(" ")}
      viewBox="0 0 216 216"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <defs>
        <radialGradient id={bodyGlowId} cx="0" cy="0" r="1" gradientTransform="matrix(64 82 -74 58 84 58)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E1E7D7" />
          <stop offset="0.72" stopColor="#BFC8AF" />
          <stop offset="1" stopColor="#AEB99F" />
        </radialGradient>
        <linearGradient id={shadowId} x1="48" x2="168" y1="182" y2="182" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D8CCBC" stopOpacity="0" />
          <stop offset="0.5" stopColor="#A99B89" stopOpacity="0.28" />
          <stop offset="1" stopColor="#D8CCBC" stopOpacity="0" />
        </linearGradient>
      </defs>

      {variant === "appIcon" ? (
        <rect x="16" y="16" width="184" height="184" rx="42" fill="#FBF7EF" />
      ) : null}
      <ellipse cx="108" cy="184" rx="60" ry="11" fill={`url(#${shadowId})`} />
      <path
        d="M50 131C50 82 73 38 111 38C148 38 169 84 166 132C164 168 142 185 108 185C75 185 50 167 50 131Z"
        fill={`url(#${bodyGlowId})`}
      />
      <path
        d="M56 131C56 87 76 47 110 47C144 47 162 90 159 132C157 162 139 177 108 177C79 177 56 161 56 131Z"
        fill="#D7DDCD"
        opacity="0.18"
      />
      {showArms ? (
        <>
          <path
            d="M56 126C43 128 39 139 43 149C47 160 58 156 62 146"
            stroke="#9DAA8F"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d={isExpressive ? "M158 126C174 119 180 126 177 139C174 151 163 151 158 140" : "M158 127C169 124 175 130 173 140C171 150 162 150 158 140"}
            stroke="#9DAA8F"
            strokeWidth="10"
            strokeLinecap="round"
          />
        </>
      ) : null}
      <circle cx="88" cy="88" r="5.6" fill="#252622" />
      <circle cx="127" cy="88" r="5.6" fill="#252622" />
      <path d={smilePath} stroke="#252622" strokeWidth="4.4" strokeLinecap="round" />

      {withSprig ? (
        <g stroke="#708165" strokeLinecap="round" strokeLinejoin="round">
          <path d="M150 136C154 117 163 101 177 87" strokeWidth="4.4" />
          <path d="M160 112C150 110 147 101 154 94C162 96 165 104 160 112Z" fill="#8E9C7F" strokeWidth="2.2" />
          <path d="M169 99C160 94 161 85 170 80C177 86 176 94 169 99Z" fill="#8E9C7F" strokeWidth="2.2" />
          <path d="M173 91C175 80 184 75 191 78C191 88 184 94 173 91Z" fill="#8E9C7F" strokeWidth="2.2" />
          <path d="M153 127C144 126 141 118 146 112C154 113 158 120 153 127Z" fill="#8E9C7F" strokeWidth="2.2" />
        </g>
      ) : null}
    </svg>
  );
}
