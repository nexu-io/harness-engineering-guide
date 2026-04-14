import { getContentBySlug, getSlugs } from "@/lib/content";
import ArticleLayout from "@/components/ArticleLayout";

export async function generateStaticParams() {
  return getSlugs("zh-news").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getContentBySlug("zh-news", slug);
  return {
    title: `${content.title} | 新闻 | Harness Guide`,
    description: content.description,
  };
}

export default async function ZhNewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getContentBySlug("zh-news", slug);

  return (
    <ArticleLayout
      title={content.title}
      description={content.description}
      contentHtml={content.contentHtml}
      headings={content.headings}
    />
  );
}
