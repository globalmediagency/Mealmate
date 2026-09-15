import { Logo } from "@/components/brand/logo";
import { Alert } from "@/components/ui/alert";
import { migrationsSql, type Migration } from "@/lib/db/migrations-catalog";
import { CopyButton } from "./copy-button";

/**
 * Shown instead of the app when the database misses a migration: the owner
 * pastes the SQL in Neon → SQL Editor, reloads, and the app is back.
 */
export function SchemaOutdatedScreen({ missing }: { missing: Migration[] }) {
  const text = migrationsSql(missing);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4 py-10 safe-top safe-bottom">
      <Logo withWordmark className="justify-center" />
      <Alert tone="warning" title="La base de données doit être mise à jour">
        <p>
          Le code attend {missing.length > 1 ? `${missing.length} migrations` : "une migration"} que Neon n&apos;a pas encore :
        </p>
        <ul className="mt-2 space-y-1">
          {missing.map((m) => (
            <li key={m.id}>
              <code className="rounded-lg bg-ink-900 px-2 py-0.5 text-xs text-brass-300">{m.id}</code>{" "}
              <span className="text-cream-300">{m.title}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-cream-300">
          Copie le SQL ci-dessous, colle-le dans <strong>Neon → SQL Editor</strong>, lance-le, puis recharge cette page. Il peut être relancé sans risque.
        </p>
      </Alert>
      <div className="flex justify-end">
        <CopyButton text={text} label="Copier le SQL" />
      </div>
      <pre className="max-h-[50dvh] overflow-auto rounded-2xl border border-ink-600/80 bg-ink-900 p-3 text-[11px] leading-snug text-cream-300 select-all">
        <code>{text}</code>
      </pre>
    </main>
  );
}
