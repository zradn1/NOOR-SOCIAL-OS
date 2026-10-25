import { FeatureBento } from "@/features/marketing/feature-bento";
import { ScrollTilt } from "@/features/marketing/motion";
import { ProductPreview } from "@/features/marketing/product-preview";
import {
  FinalCta,
  Hero,
  PlatformMarquee,
  SiteFooter,
  SiteHeader,
  TrustSection,
  WorkflowSteps,
} from "@/features/marketing/sections";

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <SiteHeader />
      <main>
        <Hero />
        <section id="product" aria-label="Product preview" className="relative mx-auto max-w-6xl px-4 sm:px-8">
          <ScrollTilt>
            <ProductPreview />
          </ScrollTilt>
        </section>
        <PlatformMarquee />
        <FeatureBento />
        <WorkflowSteps />
        <TrustSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
