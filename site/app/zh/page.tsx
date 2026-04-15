import Link from "next/link";
import ContentCard from "@/components/ContentCard";
import { guideSections } from "@/lib/guide-data";

export const metadata = {
  title: "驾驭工程指南 | Harness Engineering Guide",
  description: "Harness Engineering 实战指南 — 从零到一搭建 AI Agent 运行时",
};

export default function ZhHomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-accent-cyan)]/5 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-[family-name:var(--font-heading)] text-5xl sm:text-6xl font-bold text-[var(--color-text-primary)] mb-6 leading-tight">
            驾驭工程指南
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-10">
            从零到一学习 AI Agent Harness 的设计、实现和优化。每篇配有可运行的代码示例。
          </p>
          <Link
            href="/zh/guide/what-is-harness"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-[var(--color-bg-primary)] bg-[var(--color-accent-cyan)] rounded-lg hover:opacity-90 transition-opacity"
          >
            开始学习
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Guide Sections */}
      {guideSections.map((section) => (
        <section
          key={section.id}
          className="py-16 border-t border-[var(--color-border)]"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-8 h-px bg-[var(--color-accent-cyan)]" />
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-accent-cyan)]">
                {section.zhLabel}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
              {section.items.map((item) => (
                <Link
                  key={item.slug}
                  href={`/zh/guide/${item.slug}`}
                  className="group block p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-card-hover)] transition-all"
                >
                  <h3 className="text-sm font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent-cyan)] transition-colors">
                    {item.zhTitle}
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ))}

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
              GitHub
            </a>
            <a
              href="https://x.com/nexudotio"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-primary)] transition-all"
            >
              Twitter
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
