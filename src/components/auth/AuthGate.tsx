import type { User } from "@supabase/supabase-js";
import { ConsentGate } from "@/components/auth/ConsentGate";
import { LoginPanel } from "@/components/auth/LoginPanel";

export function AuthGate({
  user,
  hasConsented,
  children,
}: {
  user: User | null;
  hasConsented: boolean;
  children: React.ReactNode;
}) {
  if (!user) {
    return <LoginPanel />;
  }

  if (!hasConsented) {
    return <ConsentGate email={user.email ?? ""} />;
  }

  return children;
}
