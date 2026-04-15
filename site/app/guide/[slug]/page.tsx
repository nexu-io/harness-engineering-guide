import { getContentBySlug, getSlugs } from "@/lib/content";
import { guideOrder, guideChapters } from "@/lib/guide-data";
import ArticleLayout from "@/components/ArticleLayout";
import GuideSidebar from "@/components/GuideSidebar";

export async function generateStaticParams() {
  return getSlugs("guide").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getContentBySlug("guide", slug);
  return {
    title: `${content.title} | Harness Guide`,
    description: content.description,
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getContentBySlug("guide", slug);
  const currentIndex = guideOrder.indexOf(slug);

  const prev =
    currentIndex > 0
      ? { slug: guideOrder[currentIndex - 1], title: guideChapters[guideOrder[currentIndex - 1]] }
      : null;
  const next =
    currentIndex < guideOrder.length - 1
      ? { slug: guideOrder[currentIndex + 1], title: guideChapters[guideOrder[currentIndex + 1]] }
      : null;

  return (
    <div className="flex gap-8 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-16">
      <GuideSidebar />
      <div className="flex-1 min-w-0">
        <ArticleLayout
          title={content.title}
          description={content.description}
          contentHtml={content.contentHtml}
          headings={content.headings}
          prev={prev ? { ...prev, prefix: "/guide" } : undefined}
          next={next ? { ...next, prefix: "/guide" } : undefined}
          embedded
        />
      </div>
    </div>
  );
}
