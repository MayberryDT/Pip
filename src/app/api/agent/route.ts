import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AgentResponse } from "@/lib/agent/card-types";
import { getCurrentFinancialSnapshot, NoFinancialDataError } from "@/lib/data/current-snapshot";
import {
  getAgentProductEventNames,
  recordProductEventSafely,
} from "@/lib/data/product-events";
import { createMockModelClient, runAIAgent, toAgentErrorPayload } from "@/lib/agent/ai-agent";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

const requestSchema = z.object({
  message: z.string().min(1).max(500),
  scenario: z.enum(["default", "negative"]).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(500),
      }),
    )
    .max(8)
    .optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Message is required.",
      },
      { status: 400 },
    );
  }

  const client =
    request.headers.get("x-free-cash-ai-mode") === "mock-model" &&
    process.env.NODE_ENV !== "production"
      ? createMockModelClient()
      : undefined;

  try {
    const eventContext = await getEventContext();
    const snapshot = await getCurrentFinancialSnapshot({
      scenario: parsed.data.scenario,
    });
    const response = await runAIAgent(
      {
        message: parsed.data.message,
        snapshot,
        history: parsed.data.history,
      },
      client,
    );

    await recordAgentEvents(eventContext, {
      message: parsed.data.message,
      historyLength: parsed.data.history?.length ?? 0,
      response,
      freeCashTodayCents: calculateFreeCash(snapshot).freeCashTodayCents,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NoFinancialDataError) {
      return NextResponse.json(
        {
          code: "no-financial-data",
          error: error.message,
        },
        { status: 409 },
      );
    }

    const payload = toAgentErrorPayload(error);
    const { status, ...body } = payload;

    return NextResponse.json(body, { status });
  }
}

type EventContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

async function getEventContext(): Promise<EventContext | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return {
      supabase,
      userId: user.id,
    };
  } catch {
    return null;
  }
}

async function recordAgentEvents(
  context: EventContext | null,
  input: {
    message: string;
    historyLength: number;
    response: AgentResponse;
    freeCashTodayCents: number;
  },
) {
  if (!context) {
    return;
  }

  const cardTypes = input.response.cards.map((card) => card.type);
  await Promise.all(
    getAgentProductEventNames(input.response, input.freeCashTodayCents, {
      isFollowUp: input.historyLength > 0,
    }).map((eventName) =>
      recordProductEventSafely(context.supabase, context.userId, eventName, {
        cardTypes: cardTypes.join(","),
        messageLength: input.message.length,
        historyLength: input.historyLength,
        isFollowUp: input.historyLength > 0,
        freeCashTodayCents: input.freeCashTodayCents,
      }),
    ),
  );
}
