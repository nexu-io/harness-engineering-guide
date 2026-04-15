// Static guide structure data — safe to import in client components
export interface GuideSection {
  id: string;
  label: string;
  zhLabel: string;
  items: { slug: string; title: string; zhTitle: string }[];
}

export const guideSections: GuideSection[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    zhLabel: "入门",
    items: [
      { slug: "what-is-harness", title: "What is a Harness?", zhTitle: "什么是 Harness？" },
      { slug: "your-first-harness", title: "Your First Harness", zhTitle: "你的第一个 Harness" },
      { slug: "harness-vs-framework", title: "Harness vs. Framework", zhTitle: "Harness 与 Framework 的区别" },
    ],
  },
  {
    id: "core-concepts",
    label: "Core Concepts",
    zhLabel: "核心概念",
    items: [
      { slug: "agentic-loop", title: "Agentic Loop", zhTitle: "Agentic Loop" },
      { slug: "tool-system", title: "Tool System", zhTitle: "Tool 系统" },
      { slug: "memory-and-context", title: "Memory & Context", zhTitle: "Memory 与 Context" },
      { slug: "guardrails", title: "Guardrails", zhTitle: "Guardrails" },
    ],
  },
  {
    id: "practice",
    label: "Practice",
    zhLabel: "实战",
    items: [
      { slug: "context-engineering", title: "Context Engineering", zhTitle: "Context 工程" },
      { slug: "sandbox", title: "Sandbox", zhTitle: "Sandbox" },
      { slug: "skill-system", title: "Skill System", zhTitle: "Skill 系统" },
      { slug: "sub-agent", title: "Sub-Agent", zhTitle: "Sub-Agent" },
      { slug: "error-handling", title: "Error Handling", zhTitle: "错误处理" },
    ],
  },
  {
    id: "reference",
    label: "Reference",
    zhLabel: "参考",
    items: [
      { slug: "comparison", title: "Implementation Comparison", zhTitle: "主流 Harness 实现对比" },
      { slug: "glossary", title: "Glossary", zhTitle: "术语表" },
    ],
  },
  {
    id: "showcase",
    label: "Showcase",
    zhLabel: "分享",
    items: [],
  },
];

// Flat list of all guide slugs in order
export const guideOrder = guideSections.flatMap((s) => s.items.map((i) => i.slug));

// Map slug to title
export const guideChapters: Record<string, string> = Object.fromEntries(
  guideSections.flatMap((s) => s.items.map((i) => [i.slug, i.title]))
);

export const zhGuideChapters: Record<string, string> = Object.fromEntries(
  guideSections.flatMap((s) => s.items.map((i) => [i.slug, i.zhTitle]))
);
