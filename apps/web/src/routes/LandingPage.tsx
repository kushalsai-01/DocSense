import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { Button } from '../components/ui'
import { IconUpload, IconSparkles, IconShield, IconZap, IconCitation, IconFile } from '../components/ui/Icons'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface text-zinc-100">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-30 border-b border-zinc-800/50 bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Logo size="md" />
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/auth">
              <Button variant="primary" size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Subtle gradient glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[500px] w-[800px] rounded-full bg-brand-600/5 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 pb-20 pt-24 text-center sm:pt-32 sm:pb-28">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/5 px-4 py-1.5 text-xs font-medium text-brand-300">
            <IconSparkles className="h-3.5 w-3.5" />
            Agentic AI + Hybrid RAG + RAGAS
          </div>

          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Ask your documents.{' '}
            <span className="bg-gradient-to-r from-brand-400 to-brand-300 bg-clip-text text-transparent">
              Get real answers.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
            Upload PDFs, text files, or markdown. Ask questions in natural language and stream answers in real time.
            DocSense grounds responses in your own documents with citations, quality scoring, and traceable reasoning steps.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link to="/auth">
              <Button size="lg" className="px-8">
                <IconUpload className="h-4 w-4" />
                Start uploading documents
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="secondary" size="lg">
                See how it works
              </Button>
            </a>
          </div>

          <p className="mt-6 text-xs text-zinc-500">
            Free &amp; open source · No data leaves your infrastructure
          </p>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="border-t border-zinc-800/50 bg-surface-raised/30">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-400">How it works</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Three steps to document intelligence
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-zinc-400">
              DocSense turns unstructured documents into a searchable, queryable knowledge base powered by a LangGraph agent.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-3">
            <StepCard
              step={1}
              icon={<IconUpload className="h-6 w-6" />}
              title="Upload documents"
              description="Drop PDFs, TXT, or Markdown files. DocSense extracts text, enriches metadata, and prepares chunked context for retrieval."
            />
            <StepCard
              step={2}
              icon={<IconZap className="h-6 w-6" />}
              title="Automatic indexing"
              description="Chunks are indexed for hybrid retrieval (BM25 + semantic vectors) and stored in Qdrant for fast relevance matching."
            />
            <StepCard
              step={3}
              icon={<IconSparkles className="h-6 w-6" />}
              title="Ask anything"
              description="A multi-step agent plans, retrieves, grades, and answers with streaming SSE, citations, and quality-aware evaluation."
            />
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section className="border-t border-zinc-800/50">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-400">Features</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Built for accuracy, not hype
            </h2>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<IconCitation className="h-5 w-5" />}
              title="Citation-backed answers"
              description="Every answer links back to the exact document chunks used, so you can verify claims against the source."
            />
            <FeatureCard
              icon={<IconShield className="h-5 w-5" />}
              title="Grounded generation"
              description="Retriever-grader flow and hallucination checks keep answers grounded in retrieved context, not model assumptions."
            />
            <FeatureCard
              icon={<IconFile className="h-5 w-5" />}
              title="Multi-format support"
              description="Upload PDF, plain text, or Markdown files. Text extraction and chunking happen automatically on the server."
            />
            <FeatureCard
              icon={<IconZap className="h-5 w-5" />}
              title="Polyglot architecture"
              description="Node.js API + Python FastAPI microservices: API gateway, agent orchestration, RAG retrieval, and analytics pipelines."
            />
            <FeatureCard
              icon={<IconSparkles className="h-5 w-5" />}
              title="Hybrid retrieval"
              description="Combines keyword recall and semantic relevance so domain-specific terms and conceptual questions are both answered well."
            />
            <FeatureCard
              icon={<IconUpload className="h-5 w-5" />}
              title="RAGAS + trace analytics"
              description="Track faithfulness, relevancy, recall, and precision while reviewing trace-level agent decisions in analytics dashboards."
            />
          </div>
        </div>
      </section>

      {/* ── Architecture overview ── */}
      <section className="border-t border-zinc-800/50 bg-surface-raised/30">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-400">Architecture</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Production patterns, not toy code
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-zinc-400">
              Agentic AI pipeline with streaming UX, hybrid retrieval, and measurable quality.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <StackCard
              title="Web App"
              accent="from-indigo-500/25 to-violet-500/10"
              bulletColor="bg-indigo-400"
              items={[
                'React + TypeScript SPA with protected routes',
                'SSE streaming query UI with agent-step timeline',
                'Document detail tabs: Overview, Chunks, Conversations, Ask',
              ]}
            />
            <StackCard
              title="API Gateway"
              accent="from-emerald-500/20 to-cyan-500/10"
              bulletColor="bg-emerald-400"
              items={[
                'Node.js + Express service contracts',
                'JWT + refresh flow with Redis token blacklist',
                'Upload, query, analytics, settings, and account APIs',
              ]}
            />
            <StackCard
              title="Agent Service"
              accent="from-amber-500/20 to-orange-500/10"
              bulletColor="bg-amber-400"
              items={[
                'FastAPI + LangGraph planner/retriever/grader/generator',
                'Conversation memory cache in Redis with DB fallback',
                'Traceable nodes/tools for observability',
              ]}
            />
            <StackCard
              title="RAG + Data Layer"
              accent="from-fuchsia-500/20 to-purple-500/10"
              bulletColor="bg-fuchsia-400"
              items={[
                'Hybrid BM25 + semantic retrieval and reranking',
                'Qdrant vectors for chunks + query history',
                'RAGAS metrics + PostgreSQL analytics + Redis cache',
              ]}
            />
          </div>

          <div className="mt-6 rounded-xl border border-zinc-800/70 bg-zinc-900/70 p-4 text-xs text-zinc-400">
            <span className="font-semibold text-zinc-200">Deployment-ready:</span>{' '}
            Docker Compose, Kubernetes manifests, Nginx ingress, and CI/CD workflows are included.
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-zinc-800/50">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to query your documents?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-400">
            Upload a document, ask a question, and see RAG in action — with citations.
          </p>
          <div className="mt-8">
            <Link to="/auth">
              <Button size="lg" className="px-8">
                Get started free
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-800/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <Logo size="sm" />
          <p className="text-xs text-zinc-500">
            Built with Node.js, Python, React, LangGraph, and RAGAS
          </p>
        </div>
      </footer>
    </div>
  )
}

/* ── Sub-components ── */

function StepCard({
  step,
  icon,
  title,
  description,
}: {
  step: number
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="group relative rounded-xl border border-zinc-800/60 bg-surface p-6 transition-colors hover:border-zinc-700/60">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400 transition-colors group-hover:bg-brand-500/15">
          {icon}
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Step {step}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="group rounded-xl border border-zinc-800/60 bg-surface-raised/50 p-5 transition-colors hover:border-zinc-700/60">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400">
        {icon}
      </div>
      <h3 className="font-semibold text-zinc-100">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{description}</p>
    </div>
  )
}

function StackCard({
  title,
  items,
  accent,
  bulletColor,
}: {
  title: string
  items: string[]
  accent: string
  bulletColor: string
}) {
  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/60 p-5">
      <div className={`mb-4 rounded-lg bg-gradient-to-r px-3 py-2 ${accent}`}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-100">{title}</h3>
      </div>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-zinc-300">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${bulletColor}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
