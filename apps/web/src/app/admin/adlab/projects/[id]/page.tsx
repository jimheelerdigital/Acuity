"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Pencil, Loader2 } from "lucide-react";

interface Project {
  id: string;
  name: string;
  slug: string;
  brandVoiceGuide: string;
  targetAudience: {
    ageMin: number;
    ageMax: number;
    geo: string[] | null;
    interests: string[] | null;
    painPoints: string[] | null;
    desires: string[] | null;
    identityMarkers: string[] | null;
  } | null;
  usps: string[] | null;
  bannedPhrases: string[] | null;
  imageStylePrompt: string;
  logoUrl: string | null;
  targetCplCents: number;
  dailyBudgetCentsPerVariant: number;
  testDurationDays: number;
  metaAdAccountId: string | null;
  metaPixelId: string | null;
  conversionEvent: string | null;
  conversionObjective: string;
  landingPageUrl: string | null;
  metaPageId: string | null;
  targetInterests: { id: string; name: string }[] | null;
  imageEnabled: boolean;
  videoEnabled: boolean;
  createdAt: string;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/adlab/projects/${id}`)
      .then((r) => r.json())
      .then(setProject)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-[#A0A0B8] animate-spin" />
      </div>
    );
  }

  if (!project) {
    return <p className="text-sm text-red-400">Project not found.</p>;
  }

  const audience = project.targetAudience ?? {
    ageMin: 0,
    ageMax: 0,
    geo: [],
    interests: [],
    painPoints: [],
    desires: [],
    identityMarkers: [],
  };
  const usps = project.usps ?? [];
  const bannedPhrases = project.bannedPhrases ?? [];

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">{project.name}</h1>
          <p className="text-sm text-[#A0A0B8] font-mono">{project.slug}</p>
        </div>
        <Link
          href={`/admin/adlab/projects/${id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-sm text-[#A0A0B8] hover:text-white hover:border-white/20 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Ad Config */}
        <Card title="Ad Configuration">
          <Row label="Target CPL" value={`$${(project.targetCplCents / 100).toFixed(2)}`} />
          <Row label="Daily Budget / Variant" value={`$${(project.dailyBudgetCentsPerVariant / 100).toFixed(2)}`} />
          <Row label="Test Duration" value={`${project.testDurationDays} days`} />
          <Row label="Conversion Objective" value={project.conversionObjective} />
          <Row label="Conversion Event" value={project.conversionEvent || "Not set"} />
          <Row label="Landing Page URL" value={project.landingPageUrl || "https://getacuity.io (default)"} />
          <Row label="Image Creatives" value={project.imageEnabled ? "Yes" : "No"} />
        </Card>

        {/* Meta Integration */}
        <Card title="Meta Integration">
          <Row label="Ad Account ID" value={project.metaAdAccountId || "Not set"} mono />
          <Row label="Pixel ID" value={project.metaPixelId || "Not set"} mono />
          <Row label="Page ID" value={project.metaPageId || "Not set"} mono />
        </Card>

        {/* Target Audience */}
        <Card title="Target Audience">
          <Row label="Age Range" value={`${audience.ageMin} - ${audience.ageMax}`} />
          <TagRow label="Geo" tags={audience.geo ?? []} />
          <TagRow label="Interests" tags={audience.interests ?? []} />
          <TagRow label="Pain Points" tags={audience.painPoints ?? []} />
          <TagRow label="Desires" tags={audience.desires ?? []} />
          <TagRow label="Identity Markers" tags={audience.identityMarkers ?? []} />
          {project.targetInterests && project.targetInterests.length > 0 && (
            <TagRow label="Meta Ad Interests" tags={project.targetInterests.map(i => i.name)} />
          )}
        </Card>

        {/* USPs */}
        <Card title="USPs">
          {usps.length > 0 ? (
            <ul className="space-y-1.5">
              {usps.map((usp, i) => (
                <li key={i} className="text-sm text-[#A0A0B8] flex gap-2">
                  <span className="text-[#7C5CFC] shrink-0">-</span>
                  {usp}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#A0A0B8]/50">None configured</p>
          )}
        </Card>

        {/* Brand Voice */}
        <Card title="Brand Voice Guide" span2>
          {project.brandVoiceGuide ? (
            <p className="text-sm text-[#A0A0B8] whitespace-pre-wrap leading-relaxed">
              {project.brandVoiceGuide}
            </p>
          ) : (
            <p className="text-sm text-[#A0A0B8]/50">Not configured</p>
          )}
        </Card>

        {/* Image & Creative */}
        <Card title="Image & Creative" span2>
          <Row label="Logo" value={project.logoUrl || "Not set"} />
          {project.imageStylePrompt ? (
            <>
              <p className="text-xs text-[#A0A0B8] mt-2 mb-1">Image Style Prompt</p>
              <p className="text-sm text-[#A0A0B8] whitespace-pre-wrap">{project.imageStylePrompt}</p>
            </>
          ) : null}
        </Card>

        {/* Banned Phrases */}
        {bannedPhrases.length > 0 && (
          <Card title="Banned Phrases" span2>
            <div className="flex flex-wrap gap-1.5">
              {bannedPhrases.map((phrase, i) => (
                <span
                  key={i}
                  className="rounded-md bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-xs text-red-400"
                >
                  {phrase}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function Card({ title, children, span2 }: { title: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={`rounded-xl border border-white/10 bg-[#13131F] p-5 ${span2 ? "sm:col-span-2" : ""}`}>
      <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-[#A0A0B8]">{label}</span>
      <span className={`text-sm text-white ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className="py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-[#A0A0B8] block mb-1">{label}</span>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, i) => (
            <span key={i} className="rounded-md bg-[#7C5CFC]/10 px-2 py-0.5 text-xs text-[#7C5CFC]">
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-xs text-[#A0A0B8]/50">None</span>
      )}
    </div>
  );
}
