import { getAllContent } from "@/lib/content";
import ContentCard from "@/components/ContentCard";

export const metadata = {
  title: "Articles | Harness Guide",
  description: "Community articles and analysis on harness engineering.",
};

export default async function ArticlesPage() {
  const articles = await getAllContent("articles");

  // Sort alphabetically by title
  articles.sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12 animate-fade-in-up">
          <div className="flex items-center gap-3 mb-2">
            <span className="w-8 h-px bg-[var(--color-accent-amber)]" />
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-accent-amber)]">
              Community
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-bold text-[var(--color-text-primary)] mb-3">
            Articles
          </h1>
          <p className="text-[var(--color-text-secondary)] max-w-2xl">
            {articles.length} articles from practitioners, researchers, and
            builders exploring harness engineering from every angle.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((article) => (
            <ContentCard
              key={article.slug}
              href={`/articles/${article.slug}`}
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
