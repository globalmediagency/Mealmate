import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import type { ConfigError } from "@/lib/env";

type ConfigBannerProps = { error: ConfigError };

/** Friendly message shown when a required environment variable is missing. */
export function ConfigBanner({ error }: ConfigBannerProps) {
  return (
    <Alert tone="warning" title="Configuration incomplète">
      <p>
        Il manque {error.missing.length > 1 ? "des variables" : "une variable"} d&apos;environnement
        sur Vercel :
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {error.missing.map((name) => (
          <li key={name}>
            <code className="rounded-lg bg-ink-900 px-2 py-1 text-xs text-brass-300">{name}</code>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-cream-300">
        Ajoute-les dans <strong>Vercel → Settings → Environment Variables</strong> (Production et
        Preview), puis redéploie. Les étapes détaillées sont dans le{" "}
        <Link href="https://github.com/globalmediagency/Mealmate#readme" className="underline">
          README
        </Link>
        .
      </p>
    </Alert>
  );
}
