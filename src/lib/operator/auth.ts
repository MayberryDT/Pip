import { timingSafeEqual } from "node:crypto";
import { sensitiveJson } from "@/lib/security/http-cache";

export function getOperatorAuthFailure(request: Request): Response | null {
  const expectedToken = process.env.PIP_OPERATOR_TOKEN;

  if (!expectedToken) {
    return sensitiveJson({ error: "Operator access is not configured." }, { status: 503 });
  }

  if (!isValidOperatorRequest(request, expectedToken)) {
    return sensitiveJson({ error: "Operator authentication required." }, { status: 401 });
  }

  return null;
}

function isValidOperatorRequest(request: Request, expectedToken: string): boolean {
  const actualToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!actualToken) {
    return false;
  }

  const expected = Buffer.from(expectedToken);
  const actual = Buffer.from(actualToken);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
