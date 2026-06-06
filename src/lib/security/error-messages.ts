export function getSafeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message.trim()) {
    return fallback;
  }

  return sanitizeSensitiveText(error.message).slice(0, 240);
}

export function sanitizeSensitiveText(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(
      /\b([A-Za-z0-9_]*(?:access[_-]?token|public[_-]?token|refresh[_-]?token|secret|private[_-]?key|authorization)[A-Za-z0-9_]*)\s*[:=]\s*["']?[^"',}\s]+/gi,
      "$1=[redacted]",
    )
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9+/=_-]+/g, "$1 [redacted]");
}
