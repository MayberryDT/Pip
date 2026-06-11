import { getFakeSnapshot } from "@/lib/fake-data";
import type { FakeDataScenario } from "@/lib/fake-data";
import type { FinancialSnapshot, PipCashResult } from "@/lib/types";
import {
  loadCachedPipCashResultForUser,
  loadFinancialSnapshotForUser,
} from "@/lib/data/financial-repository";
import { calculatePipCash } from "@/lib/pip-cash/engine";
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

export async function getCurrentPipCashResult(input: {
  scenario?: FakeDataScenario;
}): Promise<PipCashResult> {
  if (!isSupabaseConfigured()) {
    return calculatePipCash(getFakeSnapshot(input.scenario));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthenticationRequiredError();
  }

  const cachedResult = await loadCachedPipCashResultForUser(supabase, user.id);

  if (cachedResult?.spendableCashToday) {
    return cachedResult;
  }

  const realSnapshot = await loadFinancialSnapshotForUser(supabase, user.id);

  if (!realSnapshot) {
    throw new NoFinancialDataError();
  }

  return calculatePipCash(realSnapshot);
}
