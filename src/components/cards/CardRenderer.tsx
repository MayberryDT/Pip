import {
  AlertTriangle,
  ArrowDownRight,
  Calculator,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  EyeOff,
  Landmark,
  LifeBuoy,
  ListChecks,
  Repeat,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { AgentCard } from "@/lib/agent/card-types";
import { formatMoney, formatMoneyWithCents } from "@/lib/money";

export function CardRenderer({
  card,
  onSubmitPrompt,
  onSuppressMissingCard,
}: {
  card: AgentCard;
  onSubmitPrompt?: (prompt: string) => void;
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

    case "account_connections":
      return (
        <CardShell icon={<Landmark aria-hidden="true" size={18} />} title={card.title}>
          <div className="space-y-3">
            {card.institutions.length === 0 ? (
              <p className="text-sm leading-6 text-ink/[0.66]">
                I do not see a connected bank or card yet.
              </p>
            ) : card.institutions.map((institution) => (
              <div key={institution.institutionId} className="space-y-2 rounded-[1rem] border border-line bg-porcelain/[0.45] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {institution.institutionName}
                    </p>
                    <p className="text-xs font-semibold uppercase tracking-normal text-taupe">
                      {formatInstitutionStatus(institution.status)}
                    </p>
                  </div>
                  {institution.status === "connected" || institution.status === "mocked" ? (
                    <CheckCircle2 aria-hidden="true" className="shrink-0 text-moss" size={16} />
                  ) : (
                    <AlertTriangle aria-hidden="true" className="shrink-0 text-coral" size={16} />
                  )}
                </div>
                <div className="space-y-1.5">
                  {institution.accounts.map((account) => (
                    <div key={account.accountId} className="flex items-start gap-2">
                      <span className="mt-1 text-xs text-taupe" aria-hidden="true">
                        {account.active && account.includedInPipCash ? "✓" : "○"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {account.name}{account.lastFour ? ` ...${account.lastFour}` : ""}
                        </p>
                        <p className="text-xs leading-5 text-ink/[0.58]">
                          {account.warning ?? account.roleLabel}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {institution.actions.length > 0 && onSubmitPrompt ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {institution.actions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className={getAccountActionClassName(action.style)}
                        onClick={() => onSubmitPrompt(action.prompt)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
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
                <FormulaRow label="Monthly savings" value={-card.protectedSavingsMonthlyCents} />
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

    case "trust_receipt":
      return (
        <CardShell icon={<ShieldCheck aria-hidden="true" size={18} />} title={card.title}>
          <p className="pip-wrap-anywhere text-sm leading-6 text-ink/[0.68]">{card.summary}</p>
          <p className="pip-wrap-anywhere mt-2 text-xs font-semibold uppercase leading-5 tracking-normal text-taupe">
            {card.asOfLabel}
          </p>
          <div className="mt-3 space-y-2">
            {card.rows.map((row) => (
              <TrustReceiptRow key={row.id} row={row} />
            ))}
          </div>
          {card.knownLimits.length > 0 ? (
            <div className="mt-3 space-y-2">
              {card.knownLimits.map((limit) => (
                <WarningBlock key={limit.id} detail={limit.detail} label={limit.label} />
              ))}
            </div>
          ) : null}
          <p className="pip-wrap-anywhere mt-3 text-xs leading-5 text-ink/[0.56]">{card.footer}</p>
        </CardShell>
      );

    case "savings_goal_plan":
      return (
        <CardShell icon={<TrendingUp aria-hidden="true" size={18} />} title={card.title}>
          <p className="pip-wrap-anywhere text-sm leading-6 text-ink/[0.68]">{card.summary}</p>
          <div className="mt-3 space-y-2 text-sm">
            <FormulaRow label="Target" value={card.targetAmountCents} />
            <FormulaRow label="Tracked" value={card.currentAmountCents} />
            <FormulaRow label="Remaining" value={card.remainingCents} strong />
            <FormulaRow
              label="Monthly Savings"
              value={card.monthlyContributionCents || card.recommendedMonthlyContributionCents || 0}
            />
          </div>
          <p className="pip-wrap-anywhere mt-3 text-xs leading-5 text-ink/[0.56]">
            {card.includeInSpendableCash
              ? "Tracked in Pip only. This Monthly Savings amount is kept out of Spendable Cash Today. Pip does not move money."
              : "Tracked in Pip only. Not held out of today's number. Pip does not move money."}
          </p>
        </CardShell>
      );

    case "savings_goal_preview":
      return (
        <CardShell icon={<TrendingUp aria-hidden="true" size={18} />} title={card.title}>
          <p className="pip-wrap-anywhere text-sm leading-6 text-ink/[0.68]">{card.summary}</p>
          <div className="mt-3 space-y-2 text-sm">
            <FormulaRow label="Target" value={card.targetAmountCents} />
            <FormulaRow label="Monthly Savings" value={card.monthlyContributionCents} />
            <FormulaRow
              label="Spendable Cash Today"
              value={card.currentSpendableCashTodayCents}
            />
            <FormulaRow
              label="After this goal"
              value={card.spendableCashTodayAfterGoalCents}
              strong
            />
          </div>
          {card.usualDailySpendCents !== undefined ? (
            <p className="pip-wrap-anywhere mt-3 text-xs leading-5 text-ink/[0.56]">
              Usual daily spending is around {formatMoney(card.usualDailySpendCents)}. This is a preview only; Pip does not move money.
            </p>
          ) : (
            <p className="pip-wrap-anywhere mt-3 text-xs leading-5 text-ink/[0.56]">
              Preview only. Pip does not move money.
            </p>
          )}
        </CardShell>
      );

    case "savings_goals_summary":
      return (
        <CardShell icon={<TrendingUp aria-hidden="true" size={18} />} title={card.title}>
          <p className="pip-wrap-anywhere text-sm leading-6 text-ink/[0.68]">{card.summary}</p>
          <div className="mt-3 space-y-2">
            {card.goals.map((goal) => (
              <div key={goal.goalId} className="rounded-[1rem] border border-line bg-porcelain/[0.45] px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-sm font-semibold text-ink">{goal.name}</span>
                  <span className="shrink-0 text-sm font-semibold text-moss">
                    {formatMoney(goal.remainingCents)} left
                  </span>
                </div>
                <p className="pip-wrap-anywhere mt-1 text-xs leading-5 text-ink/[0.56]">
                  {formatMoney(goal.currentAmountCents)} of {formatMoney(goal.targetAmountCents)} tracked.
                  {" "}
                  {goal.includeInSpendableCash
                    ? `${formatMoney(goal.monthlyContributionCents)}/month in Monthly Savings kept out. Pip does not move money.`
                    : "Monthly Savings tracked in Pip only. Pip does not move money."}
                </p>
              </div>
            ))}
          </div>
        </CardShell>
      );

    case "insight_card":
      return (
        <CardShell icon={<Sparkles aria-hidden="true" size={18} />} title={card.title}>
          <p className="pip-wrap-anywhere text-sm leading-6 text-ink/[0.68]">{card.summary}</p>
          <div className="mt-3 space-y-2">
            {card.rows.map((row) => (
              <InsightRow key={row.id} row={row} />
            ))}
          </div>
          {card.footer ? (
            <p className="pip-wrap-anywhere mt-3 text-xs font-semibold uppercase leading-5 tracking-normal text-taupe">
              {card.footer}
            </p>
          ) : null}
        </CardShell>
      );

    case "guidance_card":
      return (
        <CardShell icon={<Sparkles aria-hidden="true" size={18} />} title={card.title}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="pip-wrap-anywhere min-w-0 text-sm leading-6 text-ink/[0.72]">{card.summary}</p>
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
            <p className="pip-wrap-anywhere mt-3 text-xs font-semibold uppercase leading-5 tracking-normal text-taupe">
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

    case "settings_panel":
      return (
        <CardShell icon={<ShieldCheck aria-hidden="true" size={18} />} title={card.title}>
          <div className="space-y-2">
            {card.accountRows.map((row) => (
              <div key={`${row.label}-${row.value}`} className="flex min-h-10 items-start justify-between gap-4 rounded-[0.9rem] border border-line bg-porcelain/[0.42] px-3 py-2">
                <p className="text-sm font-semibold text-ink">{row.label}</p>
                <p className="pip-wrap-anywhere max-w-[58%] text-right text-sm text-ink/[0.62]">{row.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {card.sections.map((section) => (
              <SettingsSection key={section.title} title={section.title} body={section.body} />
            ))}
          </div>
          <SettingsActions actions={card.actions} onSubmitPrompt={onSubmitPrompt} />
        </CardShell>
      );

    case "settings_detail":
      return (
        <CardShell icon={<LifeBuoy aria-hidden="true" size={18} />} title={card.title}>
          <p className="pip-wrap-anywhere text-sm leading-6 text-ink/[0.68]">{card.summary}</p>
          <div className="mt-3 space-y-2">
            {card.rows.map((row) => (
              <SettingsSection key={row.label} title={row.label} body={row.detail} />
            ))}
          </div>
          <SettingsActions actions={card.actions} onSubmitPrompt={onSubmitPrompt} />
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
    <section className="pip-wrap-anywhere pip-card-shell glass-panel p-4">
      <div className="pip-card-header mb-3 flex items-center gap-2">
        <span className="pip-card-icon grid h-7 w-7 shrink-0 place-items-center rounded-full border border-moss/15 bg-moss/[0.08] text-moss">
          {icon}
        </span>
        <h3 className="pip-wrap-anywhere pip-card-title text-[0.72rem] font-bold uppercase leading-4 tracking-normal text-taupe">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function TrustReceiptRow({
  row,
}: {
  row: Extract<AgentCard, { type: "trust_receipt" }>["rows"][number];
}) {
  return (
    <div className="pip-card-row rounded-[0.9rem] border border-line bg-porcelain/[0.42] px-3 py-2.5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="pip-wrap-anywhere text-sm font-semibold text-ink">{row.label}</p>
          <p className="pip-wrap-anywhere mt-1 text-xs leading-5 text-ink/[0.58]">{row.detail}</p>
        </div>
        <span className={["shrink-0 whitespace-nowrap text-right text-xs font-bold leading-5", toneClass(row.tone)].join(" ")}>
          {row.value}
        </span>
      </div>
    </div>
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
    <div className="pip-card-row flex min-h-12 min-w-0 items-center justify-between gap-4 rounded-[0.9rem] border border-line bg-porcelain/[0.42] px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="pip-wrap-anywhere text-sm font-semibold text-ink">{row.label}</p>
        {row.detail ? (
          <p className="pip-wrap-anywhere mt-0.5 text-xs leading-5 text-ink/[0.56]">{row.detail}</p>
        ) : null}
      </div>
      <span className={["pip-wrap-anywhere min-w-0 max-w-[45%] text-right text-sm font-bold", toneClass(row.tone)].join(" ")}>
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
    <div className="pip-card-row rounded-[0.9rem] border border-line bg-porcelain/[0.42] px-3 py-2.5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="pip-wrap-anywhere min-w-0 text-sm font-semibold text-ink">{row.label}</p>
        <span className={["h-2.5 w-2.5 shrink-0 rounded-full", dotToneClass(row.tone)].join(" ")} />
      </div>
      <p className="pip-wrap-anywhere mt-1 text-xs leading-5 text-ink/[0.58]">{row.detail}</p>
    </div>
  );
}

function SettingsSection({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[0.9rem] border border-line bg-porcelain/[0.42] px-3 py-2.5">
      <p className="pip-wrap-anywhere text-sm font-semibold text-ink">{title}</p>
      <p className="pip-wrap-anywhere mt-1 text-xs leading-5 text-ink/[0.58]">{body}</p>
    </div>
  );
}

function SettingsActions({
  actions,
  onSubmitPrompt,
}: {
  actions: Extract<AgentCard, { type: "settings_panel" }>["actions"];
  onSubmitPrompt?: (prompt: string) => void;
}) {
  if (actions.length === 0 || !onSubmitPrompt) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={getSettingsActionClassName(action.style)}
          onClick={() => onSubmitPrompt(action.prompt)}
        >
          {action.label}
        </button>
      ))}
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

function formatInstitutionStatus(
  status: Extract<AgentCard, { type: "account_connections" }>["institutions"][number]["status"],
): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "mocked":
      return "Mock data";
    case "stale":
      return "Needs refresh";
    case "failed":
      return "Needs repair";
    case "revoked":
      return "Access revoked";
  }
}

function getAccountActionClassName(
  style: Extract<AgentCard, { type: "account_connections" }>["institutions"][number]["actions"][number]["style"],
): string {
  const base =
    "focus-ring inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold";

  if (style === "danger") {
    return `${base} border-coral/30 bg-coral/[0.08] text-coral`;
  }

  if (style === "primary") {
    return `${base} border-moss/25 bg-moss/[0.1] text-moss`;
  }

  return `${base} border-line bg-porcelain/[0.62] text-ink`;
}

function getSettingsActionClassName(
  style: Extract<AgentCard, { type: "settings_panel" }>["actions"][number]["style"],
): string {
  const base =
    "focus-ring inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold";

  if (style === "danger") {
    return `${base} border-coral/30 bg-coral/[0.08] text-coral`;
  }

  if (style === "primary") {
    return `${base} border-moss/25 bg-moss/[0.1] text-moss`;
  }

  return `${base} border-line bg-porcelain/[0.62] text-ink`;
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
    <div className="pip-card-row flex min-h-10 items-center justify-between gap-4 rounded-[0.9rem] border border-line bg-porcelain/[0.42] px-3 py-2">
      <span className={strong ? "pip-wrap-anywhere min-w-0 text-sm font-semibold text-ink" : "pip-wrap-anywhere min-w-0 text-sm font-medium text-ink/[0.68]"}>
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
    <div className="pip-card-warning mt-3 flex gap-3 rounded-[0.9rem] border border-gold/15 bg-gold/[0.08] px-3 py-2.5 text-sm leading-5 text-ink/[0.68]">
      <AlertTriangle aria-hidden="true" className="mt-1 shrink-0 text-gold" size={17} />
      <div className="pip-wrap-anywhere min-w-0">
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
    <div className="pip-card-row flex items-center justify-between gap-4 rounded-[1rem] border border-line bg-porcelain/[0.45] px-3 py-2">
      <span className={strong ? "pip-wrap-anywhere min-w-0 font-semibold text-ink" : "pip-wrap-anywhere min-w-0 text-ink/[0.66]"}>{label}</span>
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
          <div key={group.id} className="pip-card-row flex items-center justify-between gap-3 rounded-[1rem] border border-line bg-porcelain/[0.45] px-3 py-2">
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
