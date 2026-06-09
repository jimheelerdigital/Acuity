import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text overflow-x-hidden">
      <MarketingNav />
      {children}
      <Footer />
    </div>
  );
}
