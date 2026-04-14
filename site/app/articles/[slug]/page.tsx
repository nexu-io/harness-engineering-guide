import { getContentBySlug, getSlugs } from "@/lib/content";
import ArticleLayout from "@/components/ArticleLayout";

export async function generateStaticParams() {
  return getSlugs("articles").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getContentBySlug("articles", slug);
  return {
    title: `${content.title} | Harness Guide`,
    description: content.description,
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getContentBySlug("articles", slug);

  return (
    <ArticleLayout
      title={content.title}
      description={content.description}
      author={content.author}
      category={content.category}
      date={content.date}
      originalUrl={content.originalUrl}
      contentHtml={content.contentHtml}
      headings={content.headings}
    />
  );
}
