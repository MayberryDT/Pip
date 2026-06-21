import {
  AuthenticationRequiredError,
  getCurrentPipCashState,
  NoFinancialDataError,
} from "@/lib/data/current-snapshot";
import { isFakeDataScenario } from "@/lib/fake-data";
import { sensitiveJson } from "@/lib/security/http-cache";

export async function GET(request: Request) {
  const urlScenario = new URL(request.url).searchParams.get("scenario");
  const scenario = isFakeDataScenario(urlScenario) ? urlScenario : undefined;

  try {
    return sensitiveJson(await getCurrentPipCashState({ scenario }));
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return sensitiveJson({ error: error.message }, { status: 401 });
    }

    if (error instanceof NoFinancialDataError) {
      return sensitiveJson(
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
