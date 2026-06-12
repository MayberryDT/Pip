import type { ReactNode } from "react";

export function PipSays({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <aside
      className={[
        "flex gap-4 rounded-[0.5rem] border border-gold/40 bg-gold/10 text-ink shadow-[0_12px_28px_rgba(60,50,40,0.05)]",
        compact ? "p-4" : "p-5 sm:p-6",
      ].join(" ")}
    >
      <img
        src="/brand/pip-profile-clean.png"
        alt=""
        aria-hidden="true"
        width={64}
        height={64}
        loading="lazy"
        decoding="async"
        className={["shrink-0 rounded-full object-cover", compact ? "h-10 w-10" : "h-12 w-12"].join(" ")}
      />
      <div>
        <p className="text-xs font-bold uppercase tracking-normal text-moss">Pip says</p>
        <div className={["mt-1 text-ink/72", compact ? "text-sm leading-6" : "text-base leading-7"].join(" ")}>
          {children}
        </div>
      </div>
    </aside>
  );
}
