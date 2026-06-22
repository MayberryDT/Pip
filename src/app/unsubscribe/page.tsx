import { UnsubscribeForm } from "@/components/email/UnsubscribeForm";

export const metadata = {
  title: "Unsubscribe - Pip",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params?.token ?? "";

  return (
    <main className="min-h-screen bg-soft-white px-6 py-20 text-ink">
      <section className="mx-auto max-w-xl space-y-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-moss">Pip email preferences</p>
        <h1 className="text-3xl font-bold">Unsubscribe from Pip updates</h1>
        <UnsubscribeForm token={token} />
      </section>
    </main>
  );
}
