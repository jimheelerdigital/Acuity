import { ProjectForm } from "../project-form";

export default function NewProjectPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">New Project</h1>
      <p className="text-sm text-[#A0A0B8] mb-8">
        Configure brand, audience, and Meta ad account.
      </p>
      <ProjectForm mode="create" />
    </>
  );
}
