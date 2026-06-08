"use client";

import Image from "next/image";
import type { PipMascotProps } from "@/components/brand/PipMascot";

type PipAvatarSize = "xs" | "sm" | "md" | "lg";

export type PipAvatarProps = {
  size?: PipAvatarSize;
  expression?: PipMascotProps["expression"];
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

export function PipAvatar({
  size = "sm",
  ariaLabel = "Pip",
  className,
}: PipAvatarProps) {
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
      <Image
        src="/brand/pip-profile-clean.png"
        alt=""
        aria-hidden="true"
        width={160}
        height={160}
        sizes="80px"
        className="h-full w-full scale-[1.12] rounded-full object-cover"
        draggable={false}
      />
    </span>
  );
}
