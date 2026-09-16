"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardText, CardTitle } from "@/components/ui/card";

type Permission = "unsupported" | "default" | "granted" | "denied";

/** Offers system notifications for invitations while the app sits in another tab (asks only on the player's tap). */
export function NotificationOptIn() {
  const [permission, setPermission] = useState<Permission | null>(null);
  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : (Notification.permission as Permission));
  }, []);
  if (permission !== "default") return null;
  async function ask() {
    try {
      setPermission((await Notification.requestPermission()) as Permission);
    } catch {
      setPermission("denied");
    }
  }
  return (
    <Card className="border-ink-600/60">
      <div className="flex items-center gap-2">
        <BellRing className="h-5 w-5 text-brass-300" aria-hidden="true" />
        <CardTitle>Être prévenu·e depuis un autre onglet</CardTitle>
      </div>
      <CardText className="mt-1">
        Dans l&apos;application, une invitation s&apos;affiche sur toutes les pages en quelques secondes. Pour la recevoir aussi quand l&apos;application est ouverte dans un autre
        onglet, autorise les notifications.
      </CardText>
      <button type="button" onClick={() => void ask()} className="mt-3 inline-flex min-h-11 items-center rounded-2xl bg-ink-700 px-4 text-sm font-semibold text-cream-50 hover:bg-ink-600">
        Autoriser les notifications
      </button>
    </Card>
  );
}
