import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 safe-top safe-bottom">
      <header className="py-5">
        <Link href="/" aria-label="Retour à l'accueil" className="inline-flex">
          <Logo withWordmark />
        </Link>
      </header>
      <div className="animate-rise">{children}</div>
    </main>
  );
}
