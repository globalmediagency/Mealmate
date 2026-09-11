import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudentMeals } from "@/components/game/student-meals";
import { PageHeader } from "@/components/layout/page-header";
import { ConfigBanner } from "@/components/system/config-banner";
import { LinkButton } from "@/components/ui/button";
import { requireViewer } from "@/lib/auth/session";
import { studentMealsForCoach } from "@/lib/coaching/service";
import { ConfigError, getConfigStatus } from "@/lib/env";
import { getGameRules } from "@/lib/game/rules-service";
import { r2Storage } from "@/lib/storage/r2";

export const metadata: Metadata = { title: "Coaching" };

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The coach's view of one student's meals. */
export default async function CoachStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { session } = await requireViewer();
  const { id } = await params;
  if (!UUID.test(id)) redirect("/coach");
  const status = getConfigStatus();
  if (!status.r2) {
    return (
      <div className="space-y-5">
        <PageHeader title="Coaching" />
        <ConfigBanner error={new ConfigError(["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"])} />
      </div>
    );
  }
  const rules = await getGameRules();
  const data = await studentMealsForCoach(session.user.id, id, r2Storage, new Date(), rules).catch(() => null);
  if (!data) redirect("/coach");
  return (
    <div className="space-y-5">
      <PageHeader
        title={data.coaching.student.username}
        subtitle="Tu es son coach."
        action={
          <LinkButton href="/coach" variant="ghost" size="md" className="w-auto">
            Retour
          </LinkButton>
        }
      />
      <StudentMeals coaching={data.coaching} meals={data.meals} retentionDays={rules.feeding.mealRetentionDays} thumbsPerReward={rules.coaching.thumbsPerStudentReward} />
    </div>
  );
}
