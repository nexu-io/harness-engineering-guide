import { getAllContent } from "@/lib/content";
import ContentCard from "@/components/ContentCard";

export const metadata = {
  title: "文章 | Harness Guide 中文",
  description: "社区文章与驾驭工程分析。",
};

export default async function ZhArticlesPage() {
  const articles = await getAllContent("zh-articles");

  // Sort alphabetically by title
  articles.sort((a, b) => a.title.localeCompare(b.title, "zh"));

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12 animate-fade-in-up">
          <div className="flex items-center gap-3 mb-2">
            <span className="w-8 h-px bg-[var(--color-accent-amber)]" />
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-accent-amber)]">
              社区
            </span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-[family-name:var(--font-heading)] text-4xl font-bold text-[var(--color-text-primary)]">
              文章
            </h1>
            <a
              href="/articles"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-md transition-colors hover:border-[var(--color-border-hover)]"
            >
              English
            </a>
          </div>
          <p className="text-[var(--color-text-secondary)] max-w-2xl">
            {articles.length} 篇来自从业者、研究人员和构建者的文章，从各个角度探索驾驭工程。
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((article) => (
            <ContentCard
              key={article.slug}
              href={`/zh/articles/${article.slug}`}
              title={article.title}
              description={article.description}
              author={article.author}
              category={article.category}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
