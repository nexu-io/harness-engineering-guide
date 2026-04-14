import { getContentBySlug, getSlugs, guideOrder, guideChapters } from "@/lib/content";
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

  const chapters = guideOrder.map((s, i) => ({
    slug: s,
    title: guideChapters[s],
    index: i,
  }));

  return (
    <ArticleLayout
      title={content.title}
      description={content.description}
      contentHtml={content.contentHtml}
      headings={content.headings}
      prev={prev}
      next={next}
      prevPrefix="/guide"
      nextPrefix="/guide"
      sidebar={<GuideSidebar chapters={chapters} basePath="/guide" />}
    />
  );
}
