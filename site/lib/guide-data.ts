// Static guide structure data — safe to import in client components
export type Lang = "en" | "zh" | "es";

export interface GuideSection {
  id: string;
  label: string;
  zhLabel: string;
  esLabel: string;
  items: { slug: string; title: string; zhTitle: string; esTitle: string }[];
}

export const guideSections: GuideSection[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    zhLabel: "入门",
    esLabel: "Primeros pasos",
    items: [
      { slug: "what-is-harness", title: "What is a Harness?", zhTitle: "什么是 Harness？", esTitle: "¿Qué es un harness?" },
      { slug: "your-first-harness", title: "Your First Harness", zhTitle: "你的第一个 Harness", esTitle: "Tu primer harness" },
      { slug: "harness-vs-framework", title: "Harness vs. Framework", zhTitle: "Harness 与 Framework 的区别", esTitle: "Harness vs. framework" },
    ],
  },
  {
    id: "core-concepts",
    label: "Core Concepts",
    zhLabel: "核心概念",
    esLabel: "Conceptos clave",
    items: [
      { slug: "agentic-loop", title: "Agentic Loop", zhTitle: "Agentic Loop", esTitle: "Bucle agéntico" },
      { slug: "tool-system", title: "Tool System", zhTitle: "Tool 系统", esTitle: "Sistema de herramientas" },
      { slug: "memory-and-context", title: "Memory & Context", zhTitle: "Memory 与 Context", esTitle: "Memoria y contexto" },
      { slug: "guardrails", title: "Guardrails", zhTitle: "Guardrails", esTitle: "Guardrails" },
    ],
  },
  {
    id: "practice",
    label: "Practice",
    zhLabel: "实战",
    esLabel: "Práctica",
    items: [
      { slug: "context-engineering", title: "Context Engineering", zhTitle: "Context 工程", esTitle: "Ingeniería de contexto" },
      { slug: "sandbox", title: "Sandbox", zhTitle: "Sandbox", esTitle: "Sandbox" },
      { slug: "skill-system", title: "Skill System", zhTitle: "Skill 系统", esTitle: "Sistema de skills" },
      { slug: "sub-agent", title: "Sub-Agent", zhTitle: "Sub-Agent", esTitle: "Subagentes" },
      { slug: "error-handling", title: "Error Handling", zhTitle: "错误处理", esTitle: "Manejo de errores" },
      { slug: "multi-agent-orchestration", title: "Multi-Agent Orchestration", zhTitle: "多 Agent 编排", esTitle: "Orquestación multiagente" },
      { slug: "scheduling-and-automation", title: "Scheduling & Automation", zhTitle: "定时任务与自动化", esTitle: "Programación de tareas y automatización" },
      { slug: "long-running-harness", title: "Long-Running Harness Design", zhTitle: "长时运行 Agent Harness 设计", esTitle: "Diseño de harness de larga duración" },
      { slug: "managed-agents-architecture", title: "Managed Agents Architecture", zhTitle: "Managed Agents：Brain/Hands/Session 解耦", esTitle: "Arquitectura de Managed Agents" },
      { slug: "eval-infrastructure", title: "Eval Infrastructure Noise", zhTitle: "评测基础设施噪音", esTitle: "Ruido de infraestructura en evals" },
      { slug: "classifier-permissions", title: "Classifier-Based Permissions", zhTitle: "基于分类器的权限审批", esTitle: "Permisos basados en clasificadores" },
      { slug: "eval-awareness", title: "Eval Awareness", zhTitle: "Eval Awareness：Agent 意识到被测试", esTitle: "Eval awareness" },
      { slug: "agent-teams", title: "Agent Teams", zhTitle: "Agent Teams：并行 Claude 造真实软件", esTitle: "Agent Teams" },
      { slug: "initializer-coding-pattern", title: "Initializer + Coding Agent Pattern", zhTitle: "Initializer + Coding Agent 两阶段模式", esTitle: "Patrón Initializer + Coding Agent" },
    ],
  },
  {
    id: "reference",
    label: "Reference",
    zhLabel: "参考",
    esLabel: "Referencia",
    items: [
      { slug: "comparison", title: "Implementation Comparison", zhTitle: "主流 Harness 实现对比", esTitle: "Comparación de implementaciones" },
      { slug: "glossary", title: "Glossary", zhTitle: "术语表", esTitle: "Glosario" },
    ],
  },
  {
    id: "showcase",
    label: "Showcase",
    zhLabel: "分享",
    esLabel: "Casos reales",
    items: [
      { slug: "nexu-windows-packaging", title: "Shipping Our Windows Client", zhTitle: "Windows 客户端百亿 Token 实战", esTitle: "Cómo lanzamos nuestro cliente para Windows" },
      { slug: "ghost-account-hunting", title: "Ghost Account Hunting Post-Mortem", zhTitle: "1000+ 幽灵账号盗刷排查实录", esTitle: "Caza de cuentas fantasma" },
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

export const esGuideChapters: Record<string, string> = Object.fromEntries(
  guideSections.flatMap((s) => s.items.map((i) => [i.slug, i.esTitle]))
);
