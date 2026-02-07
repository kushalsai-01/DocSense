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
            Powered by RAG &amp; Sentence Transformers
          </div>

          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Ask your documents.{' '}
            <span className="bg-gradient-to-r from-brand-400 to-brand-300 bg-clip-text text-transparent">
              Get real answers.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
            Upload PDFs, text files, or markdown. Ask questions in natural language.
            Get accurate, citation-backed answers grounded in your own data — no hallucination.
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
              DocSense turns unstructured documents into a searchable, queryable knowledge base.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-3">
            <StepCard
              step={1}
              icon={<IconUpload className="h-6 w-6" />}
              title="Upload documents"
              description="Drop PDFs, TXT, or Markdown files. DocSense extracts text and splits it into semantic chunks with overlap."
            />
            <StepCard
              step={2}
              icon={<IconZap className="h-6 w-6" />}
              title="Automatic indexing"
              description="Each chunk is converted into a 384-dimensional embedding vector and stored in a vector database for similarity search."
            />
            <StepCard
              step={3}
              icon={<IconSparkles className="h-6 w-6" />}
              title="Ask anything"
              description="Your question is embedded with the same model, matched against chunks via cosine similarity, and answered by an LLM constrained to your context."
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
              title="Anti-hallucination prompts"
              description="System prompts constrain the LLM to only use provided context. Temperature is set to 0 for deterministic output."
            />
            <FeatureCard
              icon={<IconFile className="h-5 w-5" />}
              title="Multi-format support"
              description="Upload PDF, plain text, or Markdown files. Text extraction and chunking happen automatically on the server."
            />
            <FeatureCard
              icon={<IconZap className="h-5 w-5" />}
              title="Polyglot architecture"
              description="Go API for high-performance file handling, Python service for ML inference — the right tool for each job."
            />
            <FeatureCard
              icon={<IconSparkles className="h-5 w-5" />}
              title="Semantic search"
              description="Understands meaning, not keywords. 'ML model' and 'machine learning algorithm' return the same results."
            />
            <FeatureCard
              icon={<IconUpload className="h-5 w-5" />}
              title="Context budget manager"
              description="Intelligent chunk selection fits within LLM token limits. High-relevance chunks are prioritized automatically."
            />
          </div>
        </div>
      </section>

      {/* ── Architecture overview ── */}
      <section className="border-t border-zinc-800/50 bg-surface-raised/30">
        <div className="mx-auto max-w-4xl px-6 py-20 sm:py-28">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-400">Architecture</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Production patterns, not toy code
            </h2>
          </div>

          <div className="mt-12 rounded-xl border border-zinc-800/60 bg-surface p-6 font-mono text-sm leading-relaxed text-zinc-400 sm:p-8">
            <div className="space-y-3">
              <p className="text-zinc-300">┌─ <span className="text-brand-400">React + TypeScript</span> ─── Frontend SPA (Port 5173)</p>
              <p>│</p>
              <p className="text-zinc-300">├─ <span className="text-emerald-400">Go + Gin</span> ─────────── API Gateway (Port 8080)</p>
              <p>│&nbsp;&nbsp;&nbsp;├─ File validation &amp; text extraction</p>
              <p>│&nbsp;&nbsp;&nbsp;├─ Chunking (700 tokens, 100 overlap)</p>
              <p>│&nbsp;&nbsp;&nbsp;└─ PostgreSQL metadata storage</p>
              <p>│</p>
              <p className="text-zinc-300">├─ <span className="text-amber-400">Python + FastAPI</span> ── RAG Service (Port 8000)</p>
              <p>│&nbsp;&nbsp;&nbsp;├─ Sentence-Transformers (384-dim embeddings)</p>
              <p>│&nbsp;&nbsp;&nbsp;├─ Qdrant vector search (cosine similarity)</p>
              <p>│&nbsp;&nbsp;&nbsp;└─ OpenAI GPT-4o generation</p>
              <p>│</p>
              <p className="text-zinc-300">└─ <span className="text-purple-400">Data Layer</span></p>
              <p>&nbsp;&nbsp;&nbsp;&nbsp;├─ PostgreSQL 16 ─── metadata, chunks, users</p>
              <p>&nbsp;&nbsp;&nbsp;&nbsp;└─ Qdrant 1.12 ────── vector embeddings (HNSW)</p>
            </div>
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
            Built with Go, Python, React &amp; RAG
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
