import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  Calculator,
  CreditCard,
  EyeOff,
  Landmark,
  ListChecks,
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
            <WarningBlock key={warning.id} detail={warning.detail} />
          ))}
          {card.dataStates.map((state) => (
            <WarningBlock key={state.id} detail={state.detail} />
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
            A {formatMoney(card.amountCents)} purchase would leave today's Free Cash at{" "}
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

    case "missing_card_nudge":
      return (
        <CardShell icon={<CreditCard aria-hidden="true" size={18} />} title={card.title}>
          <WarningBlock detail={card.detail} />
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

function WarningBlock({ detail }: { detail: string }) {
  return (
    <div className="mt-3 flex gap-3 rounded-[1rem] border border-gold/15 bg-gold/[0.08] px-3 py-3 text-sm leading-6 text-ink/[0.68]">
      <AlertTriangle aria-hidden="true" className="mt-1 shrink-0 text-gold" size={17} />
      <p>{detail}</p>
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
