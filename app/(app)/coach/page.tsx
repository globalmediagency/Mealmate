import type { Metadata } from "next";
import { CoachingPanel } from "@/components/game/coaching-panel";
import { SocialTabs } from "@/components/game/social-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { requireViewer } from "@/lib/auth/session";
import { countCoachingBadges, getCoachSide, getStudentSide, rewardStatuses } from "@/lib/coaching/service";
import { listFriends } from "@/lib/friends/service";
import { getGameRules } from "@/lib/game/rules-service";

export const metadata: Metadata = { title: "Coaching" };

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const { session, profile } = await requireViewer();
  const rules = await getGameRules();
  const [student, coach, rewards, friends, badge] = await Promise.all([
    getStudentSide(session.user.id),
    getCoachSide(session.user.id),
    rewardStatuses(session.user.id, rules),
    listFriends(session.user.id),
    countCoachingBadges(session.user.id),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Coaching" subtitle="Un ami qui garde un œil bienveillant sur tes assiettes." />
      <SocialTabs coachingBadge={badge} />
      <CoachingPanel
        me={{ username: profile.username }}
        current={student.current}
        notices={student.notices}
        friends={friends.map((f) => ({ friendshipId: f.friendshipId, username: f.user.username }))}
        proposals={coach.proposals}
        students={coach.students}
        rewards={rewards}
      />
    </div>
  );
}
