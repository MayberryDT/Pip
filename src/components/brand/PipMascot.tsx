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
  withSprig = false,
  ariaLabel,
  className,
}: PipMascotProps) {
  const id = useId().replace(/:/g, "");
  const bodyGlowId = `${id}-pip-body-glow`;
  const shadowId = `${id}-pip-shadow`;
  const isExpressive = variant === "expressive" || variant === "hero";
  const showArms = true;
  const smilePath = expression === "concerned"
    ? "M92 88 Q108 82 124 88"
    : expression === "reassuring"
      ? "M91 84 Q108 98 125 84"
      : "M93 82 Q108 94 123 82";

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
      <ellipse cx="108" cy="188" rx="58" ry="10" fill={`url(#${shadowId})`} />
      {showArms ? (
        <>
          <path
            d={isExpressive ? "M65 124C48 124 38 136 40 151C42 164 57 166 66 153" : "M65 127C51 128 42 139 44 151C46 164 59 165 68 153"}
            stroke="#9DAA8F"
            strokeWidth="9.4"
            strokeLinecap="round"
          />
          <path
            d={isExpressive ? "M151 123C168 112 181 117 183 132C185 147 170 154 153 144" : "M151 127C166 127 175 137 172 150C169 163 156 163 149 151"}
            stroke="#9DAA8F"
            strokeWidth="9.4"
            strokeLinecap="round"
          />
          <circle cx={isExpressive ? "40" : "45"} cy="151" r="6.6" fill="#B9C4AB" />
          <circle cx={isExpressive ? "183" : "172"} cy={isExpressive ? "132" : "150"} r="6.6" fill="#B9C4AB" />
        </>
      ) : null}
      <path
        d="M60 135C60 109 79 91 108 91C137 91 156 109 156 135V154C156 174 138 186 108 186C78 186 60 174 60 154V135Z"
        fill={`url(#${bodyGlowId})`}
      />
      <circle cx="108" cy="69" r="39" fill={`url(#${bodyGlowId})`} />
      <path
        d="M70 137C70 116 84 103 108 103C132 103 146 116 146 137V152C146 166 132 174 108 174C84 174 70 166 70 152V137Z"
        fill="#E3E8DA"
        opacity="0.18"
      />
      <circle cx="88" cy="72" r="5.6" fill="#252622" />
      <circle cx="127" cy="72" r="5.6" fill="#252622" />
      <path d={smilePath} stroke="#252622" strokeWidth="4.4" strokeLinecap="round" />
      <ellipse cx="83" cy="187" rx="16" ry="6.2" fill="#9EA98F" opacity="0.28" />
      <ellipse cx="133" cy="187" rx="16" ry="6.2" fill="#9EA98F" opacity="0.28" />

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
