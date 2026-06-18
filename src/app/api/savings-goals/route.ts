import { NextResponse } from "next/server";
import {
  markPipCashSnapshotsStaleForUser,
} from "@/lib/data/financial-repository";
import {
  createSavingsGoalForUser,
  listSavingsGoalsForUser,
} from "@/lib/data/savings-goals-repository";
import { recordProductEventSafely } from "@/lib/data/product-events";
import { isSavingsGoalsEnabled } from "@/lib/savings-goals/feature-flags";
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
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  if (!isSavingsGoalsEnabled()) {
    return NextResponse.json({ error: "Savings goals are not enabled." }, { status: 404 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const goals = await listSavingsGoalsForUser(supabase, user.id);

    return NextResponse.json({
      goals: goals
        .filter((goal) => goal.status === "active" || goal.status === "paused")
        .map(toSavingsGoalPlanResponse),
    });
  } catch (error) {
    return NextResponse.json(toErrorBody(error), { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  if (!isSavingsGoalsEnabled()) {
    return NextResponse.json({ error: "Savings goals are not enabled." }, { status: 404 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = savingsGoalCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid savings goal." }, { status: 400 });
    }

    const validationError = validateSavingsGoalInput(parsed.data);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const goal = await createSavingsGoalForUser(supabase, user.id, parsed.data);
    if (shouldStalePipCashForGoalChange(null, goal)) {
      await markPipCashSnapshotsStaleForUser(supabase, user.id);
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

    return NextResponse.json(toSavingsGoalPlanResponse(goal), { status: 201 });
  } catch (error) {
    return NextResponse.json(toErrorBody(error), { status: 500 });
  }
}

function toErrorBody(error: unknown) {
  if (error instanceof SupabaseConfigError) {
    return {
      error: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
    };
  }

  return {
    error: "Savings goals request failed.",
  };
}
