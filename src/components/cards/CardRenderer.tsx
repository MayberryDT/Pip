import {
  AlertTriangle,
  ArrowDownRight,
  Calculator,
  CalendarClock,
  CreditCard,
  EyeOff,
  Landmark,
  ListChecks,
  Repeat,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { AgentCard } from "@/lib/agent/card-types";
import { formatMoney, formatMoneyWithCents } from "@/lib/money";

export function CardRenderer({
  card,
  onSuppressMissingCard,
}: {
  card: AgentCard;
  onSuppressMissingCard?: (issuerName: string) => void;
}) {
  switch (card.type) {
    case "pip_cash_explanation":
      return (
        <CardShell icon={<ListChecks aria-hidden="true" size={18} />} title={card.title}>
          <div className="space-y-1.5">
            {card.drivers.slice(0, 5).map((driver) => (
              <MoneyRow
                key={driver.id}
                label={getCompactDriverLabel(driver.label)}
                value={driver.amountCents === 0 ? "Counted" : formatMoney(driver.amountCents)}
                tone={driver.amountCents < 0 ? "negative" : driver.amountCents > 0 ? "positive" : "neutral"}
              />
            ))}
          </div>
          {card.warnings.map((warning) => (
            <WarningBlock key={warning.id} detail={warning.detail} label={warning.label} />
          ))}
          {card.dataStates.map((state) => (
            <WarningBlock
              key={state.id}
              amountCents={state.amountCents}
              detail={state.detail}
              label={state.label}
            />
          ))}
        </CardShell>
      );

    case "purchase_simulation":
      return (
        <CardShell icon={<ArrowDownRight aria-hidden="true" size={18} />} title={card.title}>
          <div className="space-y-1.5">
            <MoneyRow
              label="Current Spendable Cash"
              value={formatMoney(card.beforeCents)}
              tone={card.beforeCents <= 0 ? "neutral" : "positive"}
            />
            <MoneyRow label="Purchase" value={formatMoney(-card.amountCents)} tone="negative" />
            <MoneyRow
              label="Spendable Cash after"
              value={formatMoney(card.todayRemainingCents)}
              tone={card.todayRemainingCents < 0 ? "warning" : "positive"}
              strong
            />
            {card.shortfallCents && card.shortfallCents > 0 ? (
              <MoneyRow
                label="Added shortfall"
                value={formatMoney(-card.shortfallCents)}
                tone="warning"
              />
            ) : null}
          </div>
        </CardShell>
      );

    case "true_balances":
      return (
        <CardShell icon={<Landmark aria-hidden="true" size={18} />} title={card.title}>
          <div className="space-y-2">
            {card.balances.map((balance) => (
              <div key={balance.accountId} className="flex items-center justify-between gap-3 rounded-[1rem] border border-line bg-porcelain/[0.45] px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{balance.name}</p>
                  <p className="text-xs text-ink/[0.52]">
                    {balance.institutionName} {balance.lastFour ? `...${balance.lastFour}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-ink">
                  {formatMoneyWithCents(balance.balanceCents)}
                </p>
              </div>
            ))}
          </div>
        </CardShell>
      );

    case "recent_transactions":
      return (
        <CardShell icon={<ListChecks aria-hidden="true" size={18} />} title={card.title}>
          <div className="space-y-2">
            {card.transactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between gap-3 rounded-[1rem] border border-line bg-porcelain/[0.45] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {transaction.merchantName ?? transaction.description}
                  </p>
                  <p className="text-xs text-ink/[0.52]">{transaction.date}</p>
                </div>
                <p className={transaction.amountCents < 0 ? "text-sm font-semibold text-coral" : "text-sm font-semibold text-moss"}>
                  {formatMoneyWithCents(transaction.amountCents)}
                </p>
              </div>
            ))}
          </div>
        </CardShell>
      );

    case "spending_breakdown":
      return (
        <CardShell icon={<Calculator aria-hidden="true" size={18} />} title={card.title}>
          <div className="space-y-2 text-sm">
            <FormulaRow label="Income" value={card.totals.incomeCents} />
            <FormulaRow label="Spending" value={-card.totals.spendingCents} />
            <FormulaRow label="Refunds" value={card.totals.refundCents} />
            <FormulaRow label="Card payments" value={-card.totals.cardPaymentCents} />
          </div>
          <GroupedMoneyList title="Top categories" groups={card.topCategories} />
          <GroupedMoneyList title="Top merchants" groups={card.topMerchants} />
        </CardShell>
      );

    case "recurring_activity":
      return (
        <CardShell icon={<Repeat aria-hidden="true" size={18} />} title={card.title}>
          {card.items.length > 0 ? (
            <div className="space-y-2">
              {card.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-[1rem] border border-line bg-porcelain/[0.45] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{item.label}</p>
                    <p className="text-xs text-ink/[0.52]">
                      {item.expectedDate} · {item.confidence} confidence
                    </p>
                  </div>
                  <p className={item.amountCents < 0 ? "text-sm font-semibold text-coral" : "text-sm font-semibold text-moss"}>
                    {formatMoneyWithCents(item.amountCents)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-ink/[0.66]">
              I do not see a clear repeating charge in the connected data yet.
            </p>
          )}
        </CardShell>
      );

    case "spendable_cash_forecast":
      return (
        <CardShell icon={<TrendingUp aria-hidden="true" size={18} />} title={card.title}>
          <div className="space-y-1.5">
            <MoneyRow
              label="Now"
              value={formatMoney(card.currentSpendableCashCents)}
              tone={card.currentSpendableCashCents < 0 ? "negative" : "positive"}
            />
            <MoneyRow
              label={`${card.horizonDays} days`}
              value={formatMoney(card.projectedSpendableCashCents)}
              tone={card.projectedSpendableCashCents < 0 ? "negative" : "positive"}
              strong
            />
          </div>
          <div className="mt-4 space-y-2">
            {card.points.slice(0, 5).map((point) => (
              <div key={point.date} className="flex items-center justify-between gap-3 rounded-[1rem] border border-line bg-porcelain/[0.45] px-3 py-2">
                <div className="flex items-center gap-2">
                  <CalendarClock aria-hidden="true" className="text-taupe" size={15} />
                  <span className="text-sm font-semibold text-ink">{point.date}</span>
                </div>
                <span className={point.projectedSpendableCashCents < 0 ? "text-sm font-semibold text-coral" : "text-sm font-semibold text-moss"}>
                  {formatMoney(point.projectedSpendableCashCents)}
                </span>
              </div>
            ))}
          </div>
          {card.recurringItems.length > 0 ? (
            <p className="mt-4 text-sm leading-6 text-ink/[0.62]">
              Includes {card.recurringItems.slice(0, 2).map((item) => item.label).join(", ")} if those repeat.
            </p>
          ) : null}
          <p className="mt-3 text-xs font-semibold uppercase tracking-normal text-taupe">
            {card.disclaimer}
          </p>
        </CardShell>
      );

    case "missing_card_nudge":
      return (
        <CardShell icon={<CreditCard aria-hidden="true" size={18} />} title={card.title}>
          <p className="text-sm leading-6 text-ink/[0.68]">{card.detail}</p>
          {card.issuerName && onSuppressMissingCard ? (
            <button
              type="button"
              className="focus-ring mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-porcelain/[0.58] px-4 text-sm font-semibold text-ink"
              onClick={() => onSuppressMissingCard(card.issuerName as string)}
            >
              <EyeOff aria-hidden="true" size={16} />
              Hide nudge
            </button>
          ) : null}
        </CardShell>
      );

    case "math_breakdown":
      return (
        <CardShell icon={<Calculator aria-hidden="true" size={18} />} title={card.title}>
          <div className="space-y-2 text-sm">
            {card.spendableCashTodayCents !== undefined ? (
              <>
                <FormulaRow label="Spendable today" value={card.spendableCashTodayCents} strong />
                <FormulaRow label="Normal room" value={card.baselineDailyAllowanceCents ?? 0} />
                <FormulaRow label="Recent spending" value={card.behaviorAdjustmentCents ?? 0} />
                <FormulaRow label="Cash guardrail" value={-(card.cashRealityAdjustmentCents ?? 0)} />
              </>
            ) : (
              <>
                <FormulaRow label="Income" value={card.incomeTotalCents} />
                <FormulaRow label="Spending" value={-card.spendingTotalCents} />
                <FormulaRow label="Protected savings" value={-card.protectedSavingsMonthlyCents} />
                <FormulaRow label="Rolling net" value={card.rollingNetCents} strong />
              </>
            )}
          </div>
          <p className="mt-4 text-sm text-ink/[0.62]">
            {card.spendableCashTodayCents !== undefined
              ? `Legacy rolling surplus is ${formatMoney(card.legacyRollingDailySurplusCents ?? Math.round(card.rollingNetCents / card.dayCount))} per day.`
              : `${formatMoney(card.rollingNetCents)} divided by ${card.dayCount} days equals ${formatMoney(Math.round(card.rollingNetCents / card.dayCount))}.`}
          </p>
        </CardShell>
      );

    case "insight_card":
      return (
        <CardShell icon={<Sparkles aria-hidden="true" size={18} />} title={card.title}>
          <p className="text-sm leading-6 text-ink/[0.68]">{card.summary}</p>
          <div className="mt-3 space-y-2">
            {card.rows.map((row) => (
              <InsightRow key={row.id} row={row} />
            ))}
          </div>
          {card.footer ? (
            <p className="mt-3 text-xs font-semibold uppercase leading-5 tracking-normal text-taupe">
              {card.footer}
            </p>
          ) : null}
        </CardShell>
      );

    case "guidance_card":
      return (
        <CardShell icon={<Sparkles aria-hidden="true" size={18} />} title={card.title}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="min-w-0 text-sm leading-6 text-ink/[0.72]">{card.summary}</p>
            <span className={["shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-normal", stanceClass(card.stance)].join(" ")}>
              {stanceLabel(card.stance)}
            </span>
          </div>
          <div className="space-y-2">
            {card.rows.map((row) => (
              <GuidanceRow key={`${row.label}-${row.evidenceIds.join("-")}`} row={row} />
            ))}
          </div>
          {card.footer ? (
            <p className="mt-3 text-xs font-semibold uppercase leading-5 tracking-normal text-taupe">
              {card.footer}
            </p>
          ) : null}
        </CardShell>
      );

    case "connect_account":
      return (
        <CardShell icon={<CreditCard aria-hidden="true" size={18} />} title={card.title}>
          <p className="text-sm leading-6 text-ink/[0.66]">{card.detail}</p>
        </CardShell>
      );
  }
}

function CardShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full border border-moss/15 bg-moss/[0.08] text-moss">
          {icon}
        </span>
        <h3 className="text-[0.72rem] font-bold uppercase leading-none tracking-normal text-taupe">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function InsightRow({
  row,
}: {
  row: Extract<AgentCard, { type: "insight_card" }>["rows"][number];
}) {
  const value = typeof row.amountCents === "number"
    ? formatMoney(row.amountCents)
    : row.valueText ?? "Included";

  return (
    <div className="flex min-h-12 items-center justify-between gap-4 rounded-[0.9rem] border border-line bg-porcelain/[0.42] px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{row.label}</p>
        {row.detail ? (
          <p className="mt-0.5 text-xs leading-5 text-ink/[0.56]">{row.detail}</p>
        ) : null}
      </div>
      <span className={["shrink-0 text-sm font-bold", toneClass(row.tone)].join(" ")}>
        {value}
      </span>
    </div>
  );
}

function GuidanceRow({
  row,
}: {
  row: Extract<AgentCard, { type: "guidance_card" }>["rows"][number];
}) {
  return (
    <div className="rounded-[0.9rem] border border-line bg-porcelain/[0.42] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{row.label}</p>
        <span className={["h-2.5 w-2.5 shrink-0 rounded-full", dotToneClass(row.tone)].join(" ")} />
      </div>
      <p className="mt-1 text-xs leading-5 text-ink/[0.58]">{row.detail}</p>
    </div>
  );
}

function toneClass(tone: "positive" | "negative" | "neutral" | "warning"): string {
  if (tone === "positive") {
    return "text-moss";
  }

  if (tone === "negative") {
    return "text-coral";
  }

  if (tone === "warning") {
    return "text-gold";
  }

  return "text-ink/[0.58]";
}

function dotToneClass(tone: "positive" | "negative" | "neutral" | "warning"): string {
  if (tone === "positive") {
    return "bg-moss";
  }

  if (tone === "negative") {
    return "bg-coral";
  }

  if (tone === "warning") {
    return "bg-gold";
  }

  return "bg-taupe/50";
}

function stanceLabel(stance: Extract<AgentCard, { type: "guidance_card" }>["stance"]): string {
  switch (stance) {
    case "stable":
      return "Stable";
    case "watch":
      return "Watch";
    case "tight":
      return "Tight";
    case "shortfall":
      return "Shortfall";
    case "uncertain":
      return "Uncertain";
  }
}

function stanceClass(stance: Extract<AgentCard, { type: "guidance_card" }>["stance"]): string {
  switch (stance) {
    case "stable":
      return "border-moss/20 bg-moss/[0.08] text-moss";
    case "watch":
      return "border-gold/25 bg-gold/[0.09] text-gold";
    case "tight":
      return "border-coral/20 bg-coral/[0.08] text-coral";
    case "shortfall":
      return "border-coral/25 bg-coral/[0.1] text-coral";
    case "uncertain":
      return "border-taupe/20 bg-taupe/[0.08] text-taupe";
  }
}

function MoneyRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral" | "warning";
  strong?: boolean;
}) {
  const valueClass = toneClass(tone);

  return (
    <div className="flex min-h-10 items-center justify-between gap-4 rounded-[0.9rem] border border-line bg-porcelain/[0.42] px-3 py-2">
      <span className={strong ? "text-sm font-semibold text-ink" : "text-sm font-medium text-ink/[0.68]"}>
        {label}
      </span>
      <span className={[strong ? "text-base font-bold" : "text-sm font-semibold", valueClass].join(" ")}>
        {value}
      </span>
    </div>
  );
}

function getCompactDriverLabel(label: string): string {
  return label
    .replace("Rent is included", "Rent included")
    .replace("Pending card spend included", "Pending card spend")
    .replace("Card payment deduped", "Card payment deduped");
}

function WarningBlock({
  amountCents,
  detail,
  label,
}: {
  amountCents?: number;
  detail: string;
  label?: string;
}) {
  return (
    <div className="mt-3 flex gap-3 rounded-[0.9rem] border border-gold/15 bg-gold/[0.08] px-3 py-2.5 text-sm leading-5 text-ink/[0.68]">
      <AlertTriangle aria-hidden="true" className="mt-1 shrink-0 text-gold" size={17} />
      <div>
        {label ? (
          <p className="font-semibold text-ink">
            {label}
            {typeof amountCents === "number" ? ` ${formatMoney(amountCents)}` : ""}
          </p>
        ) : null}
        <p>{detail}</p>
      </div>
    </div>
  );
}

function FormulaRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[1rem] border border-line bg-porcelain/[0.45] px-3 py-2">
      <span className={strong ? "font-semibold text-ink" : "text-ink/[0.66]"}>{label}</span>
      <span className={strong ? "font-semibold text-ink" : value < 0 ? "font-semibold text-coral" : "font-semibold text-moss"}>
        {formatMoney(value)}
      </span>
    </div>
  );
}

function GroupedMoneyList({
  title,
  groups,
}: {
  title: string;
  groups: Array<{
    id: string;
    label: string;
    amountCents: number;
    transactionCount: number;
  }>;
}) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-normal text-taupe">{title}</p>
      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.id} className="flex items-center justify-between gap-3 rounded-[1rem] border border-line bg-porcelain/[0.45] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{group.label}</p>
              <p className="text-xs text-ink/[0.52]">
                {group.transactionCount} {group.transactionCount === 1 ? "item" : "items"}
              </p>
            </div>
            <p className={group.amountCents < 0 ? "text-sm font-semibold text-coral" : "text-sm font-semibold text-moss"}>
              {formatMoneyWithCents(group.amountCents)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
