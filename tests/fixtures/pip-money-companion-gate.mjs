const HARD_ZERO_FAILURES = [
  "invented_money_fact",
  "false_persistence",
  "account_exclusion",
  "active_savings_goal_excluded",
  "expected_bill_double_subtracted",
  "same_day_spend_not_subtracted",
  "unsafe_affordability_language",
  "harsh_money_judgment",
];

const CASE_DEFINITIONS = [
  ["SCT-001", "Three completed months create a $74 starting day."],
  ["SCT-002", "$18 same-day posted Target purchase lowers $74 to $56."],
  ["SCT-003", "$18 same-day pending Target purchase lowers $74 to $56 with pending caveat."],
  ["SCT-004", "Pending Target replaced by posted Target counts once."],
  ["SCT-005", "Two same-day purchases of $18 and $24 lower $74 to $32."],
  ["SCT-006", "Same-day $12 refund raises today's remaining by $12."],
  ["SCT-007", "Same-day card payment is ignored as settlement."],
  ["SCT-008", "Same-day transfer to savings is ignored as transfer unless user marks it as savings goal contribution."],
  ["SCT-009", "Unknown same-day negative transaction counts as daily spending with lower confidence."],
  ["SCT-010", "Same-day discretionary spend floors public number at $0 and records overage or shortfall."],
  ["SCT-011", "Current-month overspending before today can affect start-of-day room, but today's purchases subtract directly."],
  ["SCT-012", "Today's purchases are excluded from current-month smoothing when calculating starting room."],
  ["SCT-013", "Cash guardrail caps starting room before same-day spend."],
  ["SCT-014", "Low-confidence user still sees direct same-day subtraction."],
  ["SCT-015", "Missing-card warning does not prevent direct subtraction from connected accounts."],
  ["SCT-016", "Disconnected or repair-needed institution marks trust low but keeps last known number visible."],
  ["SCT-017", "All active connected credit card purchases count."],
  ["SCT-018", "Legacy includedInPipCash false on an active account does not filter transactions."],
  ["SCT-019", "Inactive provider account is treated as unavailable and triggers trust or repair copy, not user exclusion copy."],
  ["SCT-020", "Same-day spend driver appears in explanation card."],
  ["SCT-021", "Top-number subtitle references checking or found spend when same-day ledger changed."],
  ["SCT-022", "Purchase simulation uses current remaining after same-day ledger, not smoothed allowance."],
  ["SCT-023", "Daily remaining can recover after refund."],
  ["SCT-024", "Daily remaining does not go negative publicly, but shortfall is shown."],
  ["SCT-025", "Same-day transaction after app-open sync updates cached snapshot."],
  ["SCT-026", "Same-day transaction before provider exposure leaves number unchanged with checked-but-not-seen copy."],
  ["SCT-027", "Multiple accounts at same institution all count."],
  ["SCT-028", "Multiple institutions all count."],
  ["SCT-029", "Protected savings account balance is not cash guardrail spending room."],
  ["SCT-030", "True balances still show all active connected accounts after removing exclusion logic."],
  ["SAVE-001", "$3,000 by December derives monthly contribution."],
  ["SAVE-002", "Goal preview shows before and after Spendable Cash Today."],
  ["SAVE-003", "Goal preview asks for confirmation before save."],
  ["SAVE-004", "Confirmed goal saves and marks Pip Cash stale or reloads."],
  ["SAVE-005", "Active goal with explicit monthly amount affects Spendable Cash Today."],
  ["SAVE-006", "Active goal with target date and no monthly amount affects Spendable Cash Today."],
  ["SAVE-007", "Paused goal does not affect Spendable Cash Today."],
  ["SAVE-008", "Archived goal does not affect Spendable Cash Today."],
  ["SAVE-009", "Updating target date recomputes monthly amount and today."],
  ["SAVE-010", "Updating current amount recomputes remaining contribution and today."],
  ["SAVE-011", "Goal that drops today to $5 triggers soft warning."],
  ["SAVE-012", "Goal that drops today below usual daily spend compares to usual daily spend."],
  ["SAVE-013", "Goal with missing date or monthly amount asks one clarifying question."],
  ["SAVE-014", "Savings list copy no longer says tracked only."],
  ["SAVE-015", "set_savings_goal_protection is not exposed in user-facing model or tools."],
  ["SAVE-016", "API create defaults legacy include column to true or ignores it safely."],
  ["SAVE-017", "Direct API goal create stales Pip Cash even without include flag."],
  ["SAVE-018", "Savings goal card shows monthly impact and today's impact."],
  ["SAVE-019", "Savings goal confirmation never says saved before database success."],
  ["SAVE-020", "Savings goal unavailable state preserves draft without false persistence."],
  ["BILL-001", "User-confirmed rent is held out in baseline."],
  ["BILL-002", "Exact rent posting does not lower today again."],
  ["BILL-003", "Rent $50 higher lowers today by $50."],
  ["BILL-004", "Rent $50 lower gives back $50 or notes lighter bill."],
  ["BILL-005", "Utility auto-detected as bill suggestion, not confirmed rule."],
  ["BILL-006", "User confirms utility as bill; future baseline holds it out."],
  ["BILL-007", "User says Target is not a bill; same-day Target becomes daily spend."],
  ["BILL-008", "User says phone bill is usually $80; rule saves expected amount."],
  ["BILL-009", "Correction immediately recomputes today's number."],
  ["BILL-010", "Correction response says what changed."],
  ["BILL-011", "User-confirmed rule overrides auto detection."],
  ["BILL-012", "User ignored merchant overrides auto detection."],
  ["BILL-013", "Subscription monthly rule reconciles variance."],
  ["BILL-014", "Duplicate same-week purchases are not monthly bills."],
  ["BILL-015", "Payroll is not treated as recurring bill."],
  ["BILL-016", "Credit-card autopay is not a recurring bill."],
  ["BILL-017", "Savings transfer is not a recurring bill."],
  ["BILL-018", "Recurring card title and copy is obligations-focused."],
  ["BILL-019", "Show recurring bills does not list random unrelated repeat purchases."],
  ["BILL-020", "Bill clarification bubble appears only when answer affects today, trust, or planning."],
  ["BILL-021", "Bill clarification chips include Treat as bill and Not a bill."],
  ["BILL-022", "Bill correction persists through next calculation."],
  ["BILL-023", "Bill rules are deleted by delete-current-user-data."],
  ["BILL-024", "Bill RLS prevents cross-user reads or writes."],
  ["BILL-025", "Bill variance appears in explanation drivers."],
  ["SYNC-001", "App open shows last known number immediately."],
  ["SYNC-002", "App open says Pip is checking or searching transactions."],
  ["SYNC-003", "App open runs refresh even if last success was under 10 minutes."],
  ["SYNC-004", "Duplicate foreground within short guard does not double-run provider."],
  ["SYNC-005", "Pending sync job shows already checking state."],
  ["SYNC-006", "Manual-refresh-only setting skips automatic refresh with honest copy."],
  ["SYNC-007", "Needs-repair institution makes bubble or action point to repair."],
  ["SYNC-008", "Successful refresh with new Target transaction updates top number."],
  ["SYNC-009", "Successful refresh with no changes says checked or updated."],
  ["SYNC-010", "Failed refresh keeps last number but marks stale."],
  ["SYNC-011", "Partial refresh keeps number visible but marks partial."],
  ["SYNC-012", "App-open endpoint returns previous, current, and delta fields."],
  ["SYNC-013", "Same-day transaction summaries in sync result are redacted enough for UI."],
  ["SYNC-014", "Pip reaction event created for meaningful same-day drop."],
  ["SYNC-015", "Reaction cooldown prevents noisy repeat bubbles."],
  ["SYNC-016", "Provider pending transaction included in first refresh result."],
  ["SYNC-017", "Posted replacement removes or dedupes pending transaction."],
  ["SYNC-018", "Chat refresh my data reloads top number."],
  ["SYNC-019", "App-open status does not stay stuck after request finishes."],
  ["SYNC-020", "Freshness state is included in financial read context."],
  ["BUBBLE-001", "Refresh status beats all other bubble messages while checking."],
  ["BUBBLE-002", "New same-day spend beats missing product tip."],
  ["BUBBLE-003", "Missing card beats savings opportunity."],
  ["BUBBLE-004", "Bill clarification beats product tip."],
  ["BUBBLE-005", "Tight day beats savings opportunity."],
  ["BUBBLE-006", "Savings goal opportunity appears only when no higher-priority issue exists."],
  ["BUBBLE-007", "Settings or account-management tip appears only as product tip priority."],
  ["BUBBLE-008", "Bubble never mixes four insights into one message."],
  ["BUBBLE-009", "Bubble uses one or two chips, not a checklist."],
  ["BUBBLE-010", "Bubble copy is warm and short."],
  ["BUBBLE-011", "Bubble can say type settings when appropriate."],
  ["BUBBLE-012", "Opening bubble marks reaction seen after display."],
  ["VOICE-001", "Greeting feels like companion, not I can assist."],
  ["VOICE-002", "How am I doing gives grounded read with evidence."],
  ["VOICE-003", "Can I spend $50 gives specific tradeoff and soft judgment."],
  ["VOICE-004", "Tight purchase uses soft pushback."],
  ["VOICE-005", "$0-today situation uses firmer but calm language."],
  ["VOICE-006", "Savings goal too hard suggests stretching date or lowering target."],
  ["VOICE-007", "Correction acceptance feels intelligent and specific."],
  ["VOICE-008", "Missing card explanation is warm and actionable."],
  ["VOICE-009", "No canned Here is bridge as whole reply."],
  ["VOICE-010", "No harsh phrases like I do not like that plan."],
  ["VOICE-011", "No corporate disclaimer tone."],
  ["VOICE-012", "No cute or performance tone."],
  ["VOICE-013", "No invented facts when context is missing."],
  ["VOICE-014", "Model-composed savings preview still respects tool facts."],
  ["VOICE-015", "Model-composed recurring bill answer still respects card or rule facts."],
  ["VOICE-016", "Prompt chips continue the conversation naturally."],
  ["VOICE-017", "Repeated follow-up does not become a generic bot answer."],
  ["VOICE-018", "User asks why did my number not change and Pip explains sync, provider, or state honestly."],
  ["VOICE-019", "User asks what should I do and Pip gives one practical next step."],
  ["VOICE-020", "User challenges Pip and Pip responds calmly without defensiveness."],
  ["DOGFOOD-001", "In-app Browser iab opens local app and sees checking bubble."],
  ["DOGFOOD-002", "Mock provider purchase causes visible number drop."],
  ["DOGFOOD-003", "Mock provider bill posting exact amount does not double subtract."],
  ["DOGFOOD-004", "Mock provider bill variance changes today."],
  ["DOGFOOD-005", "Mock provider savings goal preview before save."],
  ["DOGFOOD-006", "Mobile viewport text does not overlap in top number, bubble, or chips."],
  ["DOGFOOD-007", "Desktop viewport text does not overlap."],
  ["DOGFOOD-008", "Real connected-account dogfood records app-open refresh."],
  ["DOGFOOD-009", "Real same-day purchase drops number when provider exposes it."],
  ["DOGFOOD-010", "Real dogfood run captures screenshots and JSON report."],
];

if (CASE_DEFINITIONS.length !== 137) {
  throw new Error(`Pip money companion gate fixture must contain 137 cases; found ${CASE_DEFINITIONS.length}`);
}

export const pipMoneyCompanionGateCases = Object.freeze(
  CASE_DEFINITIONS.map(([id, title], index) =>
    Object.freeze({
      id,
      order: index + 1,
      title,
      category: categoryForCaseId(id),
      setup: Object.freeze({
        date: "2026-06-20",
        userProfile: userProfileForCaseId(id),
        accounts: Object.freeze([]),
        transactions: Object.freeze([]),
        savingsGoals: Object.freeze([]),
        recurringRules: Object.freeze([]),
        appState: Object.freeze({ gateCaseId: id }),
      }),
      action: Object.freeze(actionForCaseId(id, title)),
      expected: Object.freeze({
        hardZeroIf: Object.freeze([...HARD_ZERO_FAILURES]),
      }),
    })),
);

function categoryForCaseId(id) {
  if (id.startsWith("SCT-")) return "spendable_cash_today";
  if (id.startsWith("SAVE-")) return "savings_goals";
  if (id.startsWith("BILL-")) return "recurring_bills";
  if (id.startsWith("SYNC-")) return "sync_freshness";
  if (id.startsWith("BUBBLE-")) return "opening_bubble";
  if (id.startsWith("VOICE-")) return "assistant_voice";
  if (id.startsWith("DOGFOOD-")) return "dogfood";

  throw new Error(`Unknown Pip money companion gate case id: ${id}`);
}

function actionForCaseId(id, title) {
  if (id.startsWith("SCT-")) return { type: "calculate" };
  if (id.startsWith("SYNC-")) return { type: "sync", providerEvent: id };
  if (id.startsWith("BUBBLE-")) return { type: "open_app" };
  if (id.startsWith("DOGFOOD-")) return { type: "browser", scenario: id };

  return { type: "chat", message: title };
}

function userProfileForCaseId(id) {
  if (id.includes("019") || id.includes("missing") || id.startsWith("SYNC-007")) return "missing_data";
  if (id.includes("010") || id.includes("011") || id.includes("012") || id.startsWith("VOICE-004")) return "tight";
  if (id.startsWith("VOICE-001")) return "new_user";

  return "healthy";
}
