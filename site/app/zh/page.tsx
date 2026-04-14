import Link from "next/link";
import ContentCard from "@/components/ContentCard";
import { getAllContent, zhGuideChapters, guideOrder } from "@/lib/content";

export const metadata = {
  title: "Harness Engineering Guide | 中文",
  description: "AI Agent 运行时的开源指南。从核心概念到生产模式。",
};

export default async function ZhHomePage() {
  const zhArticles = await getAllContent("zh-articles");
  const featuredArticles = zhArticles.slice(0, 4);

  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 hero-grid" />
        <div className="absolute inset-0 hero-radial" />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <div className="animate-fade-in-up stagger-1">
            <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-[var(--color-accent-cyan)] bg-[var(--color-accent-cyan-dim)] border border-[var(--color-accent-cyan)]/25 rounded-full mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-cyan)] animate-pulse" />
              开源知识库
            </span>
          </div>

          <h1 className="animate-fade-in-up stagger-2 font-[family-name:var(--font-heading)] text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            <span className="text-[var(--color-text-primary)]">驾驭</span>
            <span className="bg-gradient-to-r from-[var(--color-accent-cyan)] to-[var(--color-accent-cyan)]/60 bg-clip-text text-transparent">工程</span>
            <span className="text-[var(--color-text-primary)]">指南</span>
          </h1>

          <p className="animate-fade-in-up stagger-3 text-lg sm:text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed">
            构建 AI Agent 运行时的开源指南。
            <br className="hidden sm:block" />
            从核心概念到生产模式。
          </p>

          <div className="animate-fade-in-up stagger-5 flex flex-wrap justify-center gap-4">
            <Link
              href="/zh/guide/introduction"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[var(--color-accent-cyan)] rounded-lg hover:opacity-90 transition-all hover:shadow-[0_0_30px_var(--color-accent-cyan-dim)]"
            >
              开始阅读
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)] transition-all"
            >
              English
            </Link>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-32 hero-bottom-fade" />
      </section>

      {/* Guide Chapters */}
      <section className="py-20 border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-2 animate-fade-in-up">
            <span className="w-8 h-px bg-[var(--color-accent-cyan)]" />
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-accent-cyan)]">
              指南
            </span>
          </div>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-[var(--color-text-primary)] mb-3 animate-fade-in-up stagger-1">
            从这里开始
          </h2>
          <p className="text-[var(--color-text-secondary)] mb-10 max-w-2xl animate-fade-in-up stagger-2">
            五个章节，涵盖从 harness 是什么，到生产模式、记忆系统和安全性的所有内容。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {guideOrder.map((slug, i) => (
              <ContentCard
                key={slug}
                href={`/zh/guide/${slug}`}
                title={zhGuideChapters[slug]}
                description={`第 ${i + 1} 章 · 驾驭工程指南`}
                category="指南"
              />
            ))}
          </div>
        </div>
      </section>

      {/* Community Voices */}
      <section className="py-20 border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="w-8 h-px bg-[var(--color-accent-amber)]" />
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-accent-amber)]">
              社区
            </span>
          </div>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-[var(--color-text-primary)] mb-3">
            社区声音
          </h2>
          <p className="text-[var(--color-text-secondary)] mb-10 max-w-2xl">
            来自从业者的文章、分析和观点，从各个角度探索驾驭工程。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {featuredArticles.map((article) => (
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
          <div className="mt-8 text-center">
            <a
              href="/zh/articles"
              className="inline-flex items-center gap-2 text-sm text-[var(--color-accent-cyan)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              查看全部 {zhArticles.length} 篇文章
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Landscape */}
      <section className="py-20 border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="w-8 h-px bg-[var(--color-accent-cyan)]" />
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-accent-cyan)]">
              生态
            </span>
          </div>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-[var(--color-text-primary)] mb-3">
            生态全景
          </h2>
          <p className="text-[var(--color-text-secondary)] mb-10 max-w-2xl">
            开源项目、商业平台，以及塑造 Harness Engineering 的工具对比。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ContentCard
              href="/zh/landscape/open-source"
              title="开源 Harness 项目"
              description="AI Agent Harness 工程领域的开源项目精选列表，社区维护。"
              category="生态"
            />
            <ContentCard
              href="/zh/landscape/commercial"
              title="商业平台"
              description="商业化的 Harness 和托管 Agent 平台，聚焦有重大 Harness 工程创新的产品。"
              category="生态"
            />
            <ContentCard
              href="/zh/landscape/comparison"
              title="Harness 实现对比"
              description="主流 AI Agent Harness 实现的横向对比，社区维护，持续更新。"
              category="生态"
            />
          </div>
        </div>
      </section>

      {/* Papers */}
      <section className="py-20 border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="w-8 h-px bg-[var(--color-accent-amber)]" />
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-accent-amber)]">
              研究
            </span>
          </div>
          <h2 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-[var(--color-text-primary)] mb-3">
            论文与研究
          </h2>
          <p className="text-[var(--color-text-secondary)] mb-10 max-w-2xl">
            塑造 Harness Engineering 和 AI Agent 运行时领域的基础论文。
          </p>
          <ContentCard
            href="/zh/papers/foundational"
            title="基础论文"
            description="ReAct、Toolformer、Generative Agents、MemGPT、Reflexion 等关键论文 — 现代 Agent Harness 设计的学术基础。"
            category="论文"
          />
        </div>
      </section>

      {/* Community Links */}
      <section className="py-20 border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text-primary)] mb-8">
            加入社区
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="https://github.com/nexu-io/harness-engineering-guide"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)] transition-all"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </a>
            <a
              href="https://x.com/nexudotio"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)] transition-all"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Twitter
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
