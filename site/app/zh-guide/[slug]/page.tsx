import { getContentBySlug, getSlugs, guideOrder, zhGuideChapters } from "@/lib/content";
import ArticleLayout from "@/components/ArticleLayout";
import GuideSidebar from "@/components/GuideSidebar";

export async function generateStaticParams() {
  return getSlugs("zh-guide").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getContentBySlug("zh-guide", slug);
  return {
    title: `${content.title} | Harness Guide 中文`,
    description: content.description,
  };
}

export default async function ZhGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getContentBySlug("zh-guide", slug);
  const currentIndex = guideOrder.indexOf(slug);

  const prev =
    currentIndex > 0
      ? { slug: guideOrder[currentIndex - 1], title: zhGuideChapters[guideOrder[currentIndex - 1]] }
      : null;
  const next =
    currentIndex < guideOrder.length - 1
      ? { slug: guideOrder[currentIndex + 1], title: zhGuideChapters[guideOrder[currentIndex + 1]] }
      : null;

  const chapters = guideOrder.map((s, i) => ({
    slug: s,
    title: zhGuideChapters[s],
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
      prevPrefix="/zh-guide"
      nextPrefix="/zh-guide"
      sidebar={<GuideSidebar chapters={chapters} basePath="/zh-guide" />}
    />
  );
}
