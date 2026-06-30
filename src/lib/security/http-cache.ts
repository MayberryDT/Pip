import { NextResponse } from "next/server";

export const SENSITIVE_JSON_CACHE_CONTROL = "private, no-store";

export function sensitiveJson<TBody>(body: TBody, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", SENSITIVE_JSON_CACHE_CONTROL);

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}
