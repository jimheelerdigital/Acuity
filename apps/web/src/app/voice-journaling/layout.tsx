import "@/styles/rb-content.css";

import { ContentShell } from "@/components/marketing/site-chrome/SiteChrome";

export default function VoiceJournalingLayout({ children }: { children: React.ReactNode }) {
  return <ContentShell>{children}</ContentShell>;
}
