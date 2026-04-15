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
      { slug: "your-first-harness", title: "Your First Harness", zhTitle: "搭建你的第一个 Harness" },
      { slug: "harness-vs-framework", title: "Harness vs. Framework", zhTitle: "Harness 和框架的区别" },
    ],
  },
  {
    id: "core-patterns",
    label: "Core Patterns",
    zhLabel: "核心模式",
    items: [
      { slug: "agents-md", title: "The AGENTS.md Pattern", zhTitle: "AGENTS.md 模式" },
      { slug: "memory-md", title: "The MEMORY.md Pattern", zhTitle: "MEMORY.md 模式" },
      { slug: "tool-loop", title: "The Tool Loop", zhTitle: "工具调用循环" },
      { slug: "skill-loading", title: "Skill Loading", zhTitle: "Skill 按需加载" },
      { slug: "thin-harness", title: "Thin Harness Architecture", zhTitle: "薄 Harness 架构" },
      { slug: "context-window", title: "Context Window Management", zhTitle: "上下文窗口管理" },
    ],
  },
  {
    id: "techniques",
    label: "Techniques",
    zhLabel: "实战技术",
    items: [
      { slug: "context-compression", title: "Context Compression", zhTitle: "上下文压缩" },
      { slug: "multi-agent", title: "Multi-Agent Patterns", zhTitle: "多 Agent 协作" },
      { slug: "git-worktree-isolation", title: "Git Worktree Isolation", zhTitle: "Git Worktree 隔离" },
      { slug: "sandbox-security", title: "Sandbox & Security", zhTitle: "沙箱与安全" },
      { slug: "structured-output", title: "Structured Output", zhTitle: "结构化输出" },
      { slug: "error-recovery", title: "Error Recovery", zhTitle: "错误恢复" },
      { slug: "eval-and-testing", title: "Evaluation & Testing", zhTitle: "评估与测试" },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    zhLabel: "进阶",
    items: [
      { slug: "harness-as-a-service", title: "Harness as a Service", zhTitle: "Harness 即服务" },
      { slug: "meta-harness", title: "Meta-Harness", zhTitle: "Meta-Harness" },
      { slug: "memory-portability", title: "Memory Portability", zhTitle: "记忆可移植性" },
      { slug: "scaling-dimensions", title: "Scaling Dimensions", zhTitle: "三维扩展" },
    ],
  },
  {
    id: "reference",
    label: "Reference",
    zhLabel: "参考",
    items: [
      { slug: "comparison", title: "Implementation Comparison", zhTitle: "实现对比" },
      { slug: "glossary", title: "Glossary", zhTitle: "术语表" },
    ],
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
