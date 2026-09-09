"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Button variant="secondary" onClick={handleClick} disabled={pending}>
      <LogOut className="h-5 w-5" aria-hidden="true" />
      {pending ? "Déconnexion…" : "Se déconnecter"}
    </Button>
  );
}
