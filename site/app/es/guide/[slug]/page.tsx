import { getContentBySlug, getSlugs } from "@/lib/content";
import { guideOrder, esGuideChapters } from "@/lib/guide-data";
import ArticleLayout from "@/components/ArticleLayout";
import GuideSidebar from "@/components/GuideSidebar";

export async function generateStaticParams() {
  return getSlugs("es-guide").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getContentBySlug("es-guide", slug);
  return {
    title: `${content.title} | Harness Engineering Guide`,
    description: content.description,
  };
}

export default async function EsGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getContentBySlug("es-guide", slug);
  const currentIndex = guideOrder.indexOf(slug);

  const prev =
    currentIndex > 0
      ? { slug: guideOrder[currentIndex - 1], title: esGuideChapters[guideOrder[currentIndex - 1]] }
      : null;
  const next =
    currentIndex < guideOrder.length - 1
      ? { slug: guideOrder[currentIndex + 1], title: esGuideChapters[guideOrder[currentIndex + 1]] }
      : null;

  return (
    <div className="flex gap-8 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-16">
      <GuideSidebar lang="es" />
      <div className="flex-1 min-w-0">
        <ArticleLayout
          title={content.title}
          description={content.description}
          contentHtml={content.contentHtml}
          headings={content.headings}
          prev={prev ? { ...prev, prefix: "/es/guide" } : undefined}
          next={next ? { ...next, prefix: "/es/guide" } : undefined}
          embedded
        />
      </div>
    </div>
  );
}
