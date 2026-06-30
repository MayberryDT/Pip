const defaultAuthNextPath = "/app";
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;

export function getSafeAuthNextPath(next: string | null, origin: string): string {
  if (!next) {
    return defaultAuthNextPath;
  }

  const decodedNext = safelyDecode(next);

  if (isUnsafeAuthNextPath(next) || isUnsafeAuthNextPath(decodedNext)) {
    return defaultAuthNextPath;
  }

  try {
    const expectedOrigin = new URL(origin).origin;
    const resolved = new URL(decodedNext, expectedOrigin);

    if (resolved.origin !== expectedOrigin || !isAllowedAuthNextPath(resolved.pathname)) {
      return defaultAuthNextPath;
    }

    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return defaultAuthNextPath;
  }
}

function safelyDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isUnsafeAuthNextPath(path: string): boolean {
  return (
    controlCharacterPattern.test(path) ||
    path.includes("\\") ||
    !path.startsWith("/") ||
    path.startsWith("//")
  );
}

function isAllowedAuthNextPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/") || pathname === "/admin";
}
