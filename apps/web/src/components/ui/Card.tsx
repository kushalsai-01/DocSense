import { type ReactNode } from 'react'

type Variant = 'default' | 'highlight' | 'ghost'

interface CardProps {
  children: ReactNode
  variant?: Variant
  className?: string
}

const variantStyles: Record<Variant, string> = {
  default: 'border-zinc-800/60 bg-surface-raised',
  highlight: 'border-brand-500/20 bg-brand-950/20',
  ghost: 'border-transparent bg-transparent',
}

export default function Card({ children, variant = 'default', className = '' }: CardProps) {
  return (
    <div className={`rounded-xl border p-5 ${variantStyles[variant]} ${className}`}>
      {children}
    </div>
  )
}
