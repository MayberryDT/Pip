import {
  markPipCashSnapshotsStaleForUser,
} from "@/lib/data/financial-repository";
import {
  createSavingsGoalForUser,
  listSavingsGoalsForUser,
} from "@/lib/data/savings-goals-repository";
import { recordProductEventSafely } from "@/lib/data/product-events";
import { isSavingsGoalsEnabled } from "@/lib/savings-goals/feature-flags";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  savingsGoalCreateSchema,
  shouldStalePipCashForGoalChange,
  toSavingsGoalPlanResponse,
  validateSavingsGoalInput,
} from "@/app/api/savings-goals/route-helpers";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return sensitiveJson({ error: "Supabase is not configured." }, { status: 503 });
  }

  if (!isSavingsGoalsEnabled()) {
    return sensitiveJson({ error: "Savings goals are not enabled." }, { status: 404 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return sensitiveJson({ error: "Authentication required." }, { status: 401 });
    }

    const goals = await listSavingsGoalsForUser(supabase, user.id);

    return sensitiveJson({
      goals: goals
        .filter((goal) => goal.status === "active" || goal.status === "paused")
        .map(toSavingsGoalPlanResponse),
    });
  } catch (error) {
    return sensitiveJson(toErrorBody(error), { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return sensitiveJson({ error: "Supabase is not configured." }, { status: 503 });
  }

  if (!isSavingsGoalsEnabled()) {
    return sensitiveJson({ error: "Savings goals are not enabled." }, { status: 404 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return sensitiveJson({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = savingsGoalCreateSchema.safeParse(body);

    if (!parsed.success) {
      return sensitiveJson({ error: "Invalid savings goal." }, { status: 400 });
    }

    const validationError = validateSavingsGoalInput(parsed.data);
    if (validationError) {
      return sensitiveJson({ error: validationError }, { status: 400 });
    }

    const goal = await createSavingsGoalForUser(supabase, user.id, parsed.data);
    if (shouldStalePipCashForGoalChange(null, goal)) {
      await markPipCashSnapshotsStaleForUser(supabase, user.id, createSupabaseAdminClient());
    }

    await recordProductEventSafely(supabase, user.id, "savings_goal_created", {
      goalId: goal.id,
      includeInSpendableCash: goal.includeInSpendableCash,
      monthlyContributionCents: goal.monthlyContributionCents,
    });

    if (goal.includeInSpendableCash) {
      await recordProductEventSafely(
        supabase,
        user.id,
        "savings_goal_spendable_protection_enabled",
        {
          goalId: goal.id,
          monthlyContributionCents: goal.monthlyContributionCents,
        },
      );
    }

    return sensitiveJson(toSavingsGoalPlanResponse(goal), { status: 201 });
  } catch (error) {
    if (!(error instanceof SupabaseConfigError)) {
      console.error("[savings-goals] request failed", getSafeErrorMessage(error, "Savings goals request failed."));
    }

    return sensitiveJson(toErrorBody(error), { status: 500 });
  }
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return {
      error: error.message,
    };
  }

  return {
    error: "Savings goals request failed.",
  };
}
