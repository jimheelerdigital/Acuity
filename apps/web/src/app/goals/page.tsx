import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { getUserProgression } from "@/lib/userProgression";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { PageContainer } from "@/components/page-container";
import { GoalList } from "./goal-list";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  const progression = await getUserProgression(session.user.id);

  return (
    <div className="min-h-screen">
      <PageContainer mobileWidth="3xl" className="animate-fade-in">
        {!progression.unlocked.goalSuggestions && (
          <div className="mb-6">
            <LockedFeatureCard
              unlockKey="goalSuggestions"
              progression={progression}
            />
          </div>
        )}
        <GoalList />
      </PageContainer>
    </div>
  );
}
