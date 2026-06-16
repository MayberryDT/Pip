import { NextResponse } from "next/server";
import {
  AuthenticationRequiredError,
  getCurrentPipCashState,
  NoFinancialDataError,
} from "@/lib/data/current-snapshot";
import { isFakeDataScenario } from "@/lib/fake-data";

export async function GET(request: Request) {
  const urlScenario = new URL(request.url).searchParams.get("scenario");
  const scenario = isFakeDataScenario(urlScenario) ? urlScenario : undefined;

  try {
    return NextResponse.json(await getCurrentPipCashState({ scenario }));
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof NoFinancialDataError) {
      return NextResponse.json(
        {
          code: "no-financial-data",
          error: error.message,
        },
        { status: 409 },
      );
    }

    throw error;
  }
}
