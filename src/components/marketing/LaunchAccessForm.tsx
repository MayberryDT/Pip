import { WaitlistForm } from "@/components/marketing/WaitlistForm";

export function LaunchAccessForm({
  compact = false,
  sourcePage,
}: {
  compact?: boolean;
  sourcePage: string;
}) {
  return <WaitlistForm compact={compact} sourcePage={sourcePage} />;
}
