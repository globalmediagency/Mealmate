import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GEMINI_FALLBACK_MODELS, listGeminiModels, pickLatestStableFlash, resolveGeminiModels } from "@/lib/ai/gemini";
import { ConfigBanner } from "@/components/system/config-banner";
import { ConfigError, isConfigError, isDevGalleryEnabled, optionalEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Modèles Gemini" };
export const dynamic = "force-dynamic";

export default async function DevGeminiPage() {
  if (!isDevGalleryEnabled()) notFound();

  let error: ConfigError | Error | null = null;
  let models: Awaited<ReturnType<typeof listGeminiModels>> = [];
  let chain: string[] = [];
  try {
    models = await listGeminiModels();
    chain = await resolveGeminiModels();
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
  }
  const flash = models.filter((m) => /flash/i.test(m.name)).sort((a, b) => b.name.localeCompare(a.name));
  const latest = pickLatestStableFlash(models);

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 safe-top safe-bottom">
      <header className="py-5">
        <h1 className="font-display text-3xl font-semibold text-cream-50">Modèles Gemini</h1>
        <p className="mt-1 text-sm text-cream-500">Modèles visibles avec ta clé, et ordre d&apos;essai utilisé par l&apos;analyse des repas.</p>
      </header>
      {error && isConfigError(error) ? <ConfigBanner error={error} /> : null}
      {error && !isConfigError(error) ? <p className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm">{error.message}</p> : null}
      {!error ? (
        <div className="space-y-4">
          <section className="rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4">
            <h2 className="font-semibold text-cream-50">Ordre d&apos;essai</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-cream-300">
              {chain.map((m) => (
                <li key={m}>
                  <code>{m}</code>
                  {optionalEnv("GEMINI_MODEL") === m ? " (GEMINI_MODEL)" : latest === m ? " (dernier Flash stable détecté)" : GEMINI_FALLBACK_MODELS.includes(m) ? " (repli)" : ""}
                </li>
              ))}
            </ol>
          </section>
          <section className="rounded-3xl border border-ink-600/80 bg-ink-800/90 p-4">
            <h2 className="font-semibold text-cream-50">Modèles Flash disponibles ({flash.length})</h2>
            <ul className="mt-2 space-y-1 text-sm text-cream-300">
              {flash.map((m) => (
                <li key={m.name}>
                  <code>{m.name.replace(/^models\//, "")}</code>
                  {m.displayName ? <span className="text-cream-700"> · {m.displayName}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </main>
  );
}
