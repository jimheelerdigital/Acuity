import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { PageContainer } from "@/components/page-container";
import { TaskList } from "./task-list";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  return (
    <div className="min-h-screen">
      <PageContainer mobileWidth="3xl" className="animate-fade-in">
        <TaskList />
      </PageContainer>
    </div>
  );
}
