import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  Calculator,
  CalendarClock,
  CreditCard,
  EyeOff,
  Landmark,
  ListChecks,
  Repeat,
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
    case "free_cash_explanation":
      return (
        <CardShell icon={<ListChecks aria-hidden="true" size={18} />} title={card.title}>
          <p className="text-sm leading-6 text-ink/[0.68]">{card.summary}</p>
          <div className="mt-4 space-y-2">
            {card.drivers.slice(0, 5).map((driver) => (
              <div key={driver.id} className="flex items-start justify-between gap-4 rounded-[1rem] border border-line bg-porcelain/[0.45] px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-ink">{driver.label}</p>
                  <p className="text-xs leading-5 text-ink/[0.55]">{driver.detail}</p>
                </div>
                <p className={driver.amountCents < 0 ? "text-sm font-semibold text-coral" : "text-sm font-semibold text-moss"}>
                  {driver.amountCents === 0 ? "OK" : formatMoney(driver.amountCents)}
                </p>
              </div>
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
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <MoneyBlock label="Now" value={formatMoney(card.beforeCents)} />
            <ArrowRight aria-hidden="true" className="text-ink/[0.36]" size={20} />
            <MoneyBlock label="After" value={formatMoney(card.afterTodayCents)} danger={card.afterTodayCents < 0} />
          </div>
          <p className="mt-4 text-sm leading-6 text-ink/[0.62]">
            A {formatMoney(card.amountCents)} purchase would leave Spendable Cash at{" "}
            <strong className={card.afterTodayCents < 0 ? "text-coral" : "text-moss"}>
              {formatMoney(card.afterTodayCents)}
            </strong>
            . The rolling-window average would become {formatMoney(card.monthlyAverageAfterCents)}.
          </p>
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
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <MoneyBlock label="Now" value={formatMoney(card.currentSpendableCashCents)} />
            <ArrowRight aria-hidden="true" className="text-ink/[0.36]" size={20} />
            <MoneyBlock
              label={`${card.horizonDays} days`}
              value={formatMoney(card.projectedSpendableCashCents)}
              danger={card.projectedSpendableCashCents < 0}
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
          <WarningBlock detail={card.detail} label={card.title} />
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
            <FormulaRow label="Income" value={card.incomeTotalCents} />
            <FormulaRow label="Spending" value={-card.spendingTotalCents} />
            <FormulaRow label="Protected savings" value={-card.protectedSavingsMonthlyCents} />
            <FormulaRow label="Rolling net" value={card.rollingNetCents} strong />
          </div>
          <p className="mt-4 text-sm text-ink/[0.62]">
            {formatMoney(card.rollingNetCents)} divided by {card.dayCount} days equals{" "}
            {formatMoney(Math.round(card.rollingNetCents / card.dayCount))}.
          </p>
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
    <section className="glass-panel p-5">
      <div className="mb-3">
        <span className="sr-only">{icon}</span>
        <h3 className="text-xs font-bold uppercase tracking-normal text-taupe">{title}</h3>
      </div>
      {children}
    </section>
  );
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
    <div className="mt-3 flex gap-3 rounded-[1rem] border border-gold/15 bg-gold/[0.08] px-3 py-3 text-sm leading-6 text-ink/[0.68]">
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

function MoneyBlock({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-[1rem] border border-line bg-porcelain/[0.45] px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-ink/[0.44]">{label}</p>
      <p className={danger ? "mt-1 text-2xl font-semibold text-coral" : "mt-1 text-2xl font-semibold text-moss"}>
        {value}
      </p>
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
