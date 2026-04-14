import { getContentBySlug, getSlugs } from "@/lib/content";
import ArticleLayout from "@/components/ArticleLayout";

export async function generateStaticParams() {
  return getSlugs("papers").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getContentBySlug("papers", slug);
  return {
    title: `${content.title} | 论文 | Harness Guide`,
    description: content.description,
  };
}

export default async function ZhPapersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const content = await getContentBySlug("papers", slug);

  return (
    <ArticleLayout
      title={content.title}
      description={content.description}
      contentHtml={content.contentHtml}
      headings={content.headings}
    />
  );
}
