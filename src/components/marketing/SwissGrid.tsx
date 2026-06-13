import type { ReactNode } from "react";
import type { MarketingAsset } from "@/lib/marketing/assets";

type Tone = "paper" | "porcelain" | "ink";
type FigureVariant = "hero" | "wide" | "portrait" | "square" | "short" | "poster" | "bleed";

export function SwissSection({
  children,
  className = "",
  folio,
  gridClassName = "",
  id,
  tone = "paper",
}: {
  children: ReactNode;
  className?: string;
  folio?: string;
  gridClassName?: string;
  id?: string;
  tone?: Tone;
}) {
  return (
    <section className={["editorial-spread", `editorial-spread-${tone}`, className].filter(Boolean).join(" ")} id={id}>
      <div className="editorial-wrap">
        {folio ? (
          <div className="editorial-folio" aria-hidden="true">
            <span>{folio}</span>
          </div>
        ) : null}
        <div className={["editorial-grid", gridClassName].filter(Boolean).join(" ")}>{children}</div>
      </div>
    </section>
  );
}

export function SwissKicker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={["editorial-kicker", className].filter(Boolean).join(" ")}>{children}</p>;
}

export function SwissTitle({
  children,
  className = "",
  level = 2,
  size = "section",
}: {
  children: ReactNode;
  className?: string;
  level?: 1 | 2 | 3;
  size?: "hero" | "page" | "section" | "compact";
}) {
  const Tag = `h${level}` as const;

  return <Tag className={["editorial-title", `editorial-title-${size}`, className].filter(Boolean).join(" ")}>{children}</Tag>;
}

export function SwissText({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={["editorial-text", className].filter(Boolean).join(" ")}>{children}</p>;
}

export function SwissFigure({
  asset,
  className = "",
  priority = false,
  variant = "wide",
}: {
  asset: MarketingAsset;
  className?: string;
  priority?: boolean;
  variant?: FigureVariant;
}) {
  return (
    <figure className={["editorial-figure", `editorial-figure-${variant}`, className].filter(Boolean).join(" ")}>
      <img
        alt={asset.alt}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        height={asset.height}
        loading={priority ? "eager" : "lazy"}
        src={asset.src}
        width={asset.width}
      />
    </figure>
  );
}

export function SwissNumber({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className={["editorial-number", className].filter(Boolean).join(" ")}>
      <p>{children}</p>
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function SwissRuleList({
  items,
  className = "",
}: {
  items: Array<string | { title: string; copy: string }>;
  className?: string;
}) {
  return (
    <div className={["editorial-rule-list", className].filter(Boolean).join(" ")}>
      {items.map((item, index) => {
        const title = typeof item === "string" ? item : item.title;
        const copy = typeof item === "string" ? null : item.copy;

        return (
          <article className="editorial-rule-item" key={`${title}-${index}`}>
            <p className="editorial-rule-index">{String(index + 1).padStart(2, "0")}</p>
            <h3>{title}</h3>
            {copy ? <p className="editorial-rule-copy">{copy}</p> : null}
          </article>
        );
      })}
    </div>
  );
}
