import "@/styles/rb-content.css";

import { ContentShell } from "@/components/marketing/site-chrome/SiteChrome";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <ContentShell>{children}</ContentShell>;
}
