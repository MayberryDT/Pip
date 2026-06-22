import {
  markPipCashSnapshotsStaleForUser,
} from "@/lib/data/financial-repository";
import {
  archiveSavingsGoalForUser,
  loadSavingsGoalForUser,
  updateSavingsGoalForUser,
} from "@/lib/data/savings-goals-repository";
import { recordProductEventSafely } from "@/lib/data/product-events";
import { isSavingsGoalsEnabled } from "@/lib/savings-goals/feature-flags";
import { getSafeErrorMessage } from "@/lib/security/error-messages";
import { sensitiveJson } from "@/lib/security/http-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  savingsGoalUpdateSchema,
  shouldStalePipCashForGoalArchive,
  shouldStalePipCashForGoalChange,
  toSavingsGoalPlanResponse,
  validateSavingsGoalInput,
} from "@/app/api/savings-goals/route-helpers";

type RouteContext = {
  params: Promise<{ goalId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
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

    const { goalId } = await context.params;
    const existing = await loadSavingsGoalForUser(supabase, user.id, goalId);
    if (!existing) {
      return sensitiveJson({ error: "Savings goal not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = savingsGoalUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return sensitiveJson({ error: "Invalid savings goal." }, { status: 400 });
    }

    const validationError = validateSavingsGoalInput(parsed.data, existing);
    if (validationError) {
      return sensitiveJson({ error: validationError }, { status: 400 });
    }

    const goal = await updateSavingsGoalForUser(supabase, user.id, goalId, parsed.data);
    if (shouldStalePipCashForGoalChange(existing, goal)) {
      await markPipCashSnapshotsStaleForUser(supabase, user.id, createSupabaseAdminClient());
    }

    await recordProductEventSafely(supabase, user.id, "savings_goal_updated", {
      goalId: goal.id,
      includeInSpendableCash: goal.includeInSpendableCash,
      monthlyContributionCents: goal.monthlyContributionCents,
    });

    return sensitiveJson(toSavingsGoalPlanResponse(goal));
  } catch (error) {
    if (!(error instanceof SupabaseConfigError)) {
      console.error("[savings-goals] request failed", getSafeErrorMessage(error, "Savings goals request failed."));
    }

    return sensitiveJson(toErrorBody(error), { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
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

    const { goalId } = await context.params;
    const existing = await loadSavingsGoalForUser(supabase, user.id, goalId);
    if (!existing) {
      return sensitiveJson({ error: "Savings goal not found." }, { status: 404 });
    }

    const goal = await archiveSavingsGoalForUser(supabase, user.id, goalId);
    if (shouldStalePipCashForGoalArchive(existing)) {
      await markPipCashSnapshotsStaleForUser(supabase, user.id, createSupabaseAdminClient());
    }

    await recordProductEventSafely(supabase, user.id, "savings_goal_archived", {
      goalId: goal.id,
      wasProtected: existing.includeInSpendableCash,
    });

    return sensitiveJson(toSavingsGoalPlanResponse(goal));
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
