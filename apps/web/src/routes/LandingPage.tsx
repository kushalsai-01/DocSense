import { Link } from 'react-router-dom'
import TypingLines from '../components/TypingLines'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">DocSense</h1>
          <p className="mt-3 text-pretty text-sm text-zinc-400 sm:text-base">
            Ask questions and get answers grounded in your documents.
          </p>

          <div className="mt-10 flex justify-center">
            <div className="group w-full rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-6 shadow-sm backdrop-blur-sm transition-colors focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-white/10 sm:p-8">
              <TypingLines
                lines={[
                  '> Upload your documents',
                  '> Ask questions in natural language',
                  '> Get answers grounded in your data',
                ]}
              />

              <div className="mt-10 flex justify-center">
                <Link
                  to="/auth"
                  className="inline-flex items-center justify-center rounded-md bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition-colors duration-150 hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:translate-y-px"
                >
                  Get Started
                </Link>
              </div>
            </div>
          </div>

          <p className="mt-8 text-xs text-zinc-500">Minimal UI. No images. Just docs → answers.</p>
        </div>
      </main>
    </div>
  )
}
