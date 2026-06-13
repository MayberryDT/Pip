export async function trackMarketingEvent(
  eventName: string,
  properties: Record<string, string | number | boolean | null>,
) {
  await fetch("/api/marketing/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      eventName,
      properties,
    }),
  }).catch(() => null);
}
