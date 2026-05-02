import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { PageContainer } from "@/components/page-container";
import { getUserEntitlement } from "@/lib/entitlements-fetch";
import { TaskList } from "./task-list";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  // §B.2.4 — when the user is FREE post-trial (canExtractEntries
  // false), TaskList swaps the generic empty state for the Pro-
  // locked variant. Computed server-side so the client bundle
  // doesn't need to know about subscriptionStatus.
  const entitlement = await getUserEntitlement(session.user.id);
  const isLocked = entitlement?.canExtractEntries === false;

  return (
    <div className="min-h-screen">
      <PageContainer mobileWidth="3xl" className="animate-fade-in">
        <TaskList isLocked={isLocked} />
      </PageContainer>
    </div>
  );
}
