import { BottomNav } from "@/components/layout/bottom-nav";
import { ConfigMissingScreen } from "@/components/system/config-missing-screen";
import { requireViewer, safeGetSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { configError } = await safeGetSession();
  if (configError) return <ConfigMissingScreen error={configError} />;
  await requireViewer();

  return (
    <div className="min-h-dvh pb-nav">
      <main className="mx-auto w-full max-w-md px-4 pt-3 safe-top">{children}</main>
      <BottomNav />
    </div>
  );
}
