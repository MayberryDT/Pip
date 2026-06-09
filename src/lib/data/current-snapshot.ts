import { getFakeSnapshot } from "@/lib/fake-data";
import type { FakeDataScenario } from "@/lib/fake-data";
import type { FinancialSnapshot, FreeCashResult } from "@/lib/types";
import {
  loadCachedFreeCashResultForUser,
  loadFinancialSnapshotForUser,
} from "@/lib/data/financial-repository";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export class NoFinancialDataError extends Error {
  constructor(message = "Connect financial data before using live Spendable Cash Today.") {
    super(message);
    this.name = "NoFinancialDataError";
  }
}

export class AuthenticationRequiredError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export async function getCurrentFinancialSnapshot(input: {
  scenario?: FakeDataScenario;
}): Promise<FinancialSnapshot> {
  if (!isSupabaseConfigured()) {
    return getFakeSnapshot(input.scenario);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthenticationRequiredError();
  }

  const realSnapshot = await loadFinancialSnapshotForUser(supabase, user.id);

  if (!realSnapshot) {
    throw new NoFinancialDataError();
  }

  return realSnapshot;
}

export async function getCurrentFreeCashResult(input: {
  scenario?: FakeDataScenario;
}): Promise<FreeCashResult> {
  if (!isSupabaseConfigured()) {
    return calculateFreeCash(getFakeSnapshot(input.scenario));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthenticationRequiredError();
  }

  const cachedResult = await loadCachedFreeCashResultForUser(supabase, user.id);

  if (cachedResult?.spendableCashToday) {
    return cachedResult;
  }

  const realSnapshot = await loadFinancialSnapshotForUser(supabase, user.id);

  if (!realSnapshot) {
    throw new NoFinancialDataError();
  }

  return calculateFreeCash(realSnapshot);
}
