export function getSafeErrorMessage(error: unknown, fallback: string): string {
  const message = getErrorMessage(error);

  if (!message) {
    return fallback;
  }

  return sanitizeSensitiveText(message).slice(0, 240);
}

export function sanitizeSensitiveText(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(
      /\b(authorization)\s*[:=]\s*["']?(?:(?:Basic|Bearer)\s+)?[^"',}\s]+/gi,
      "$1=[redacted]",
    )
    .replace(
      /\b([A-Za-z0-9_]*(?:access[_-]?token|public[_-]?token|refresh[_-]?token|secret|private[_-]?key)[A-Za-z0-9_]*)\s*[:=]\s*["']?[^"',}\s]+/gi,
      "$1=[redacted]",
    )
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9+/=_-]+/g, "$1 [redacted]");
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return null;
}
