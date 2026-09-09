import { Logo } from "@/components/brand/logo";
import { ConfigBanner } from "@/components/system/config-banner";
import type { ConfigError } from "@/lib/env";

export function ConfigMissingScreen({ error }: { error: ConfigError }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10 safe-top safe-bottom">
      <Logo withWordmark className="justify-center" />
      <ConfigBanner error={error} />
    </main>
  );
}
