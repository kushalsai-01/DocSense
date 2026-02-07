interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
}

export default function Logo({ size = 'md', className = '' }: LogoProps) {
  return (
    <span className={`font-bold tracking-tight ${sizes[size]} ${className}`}>
      <span className="text-brand-400">Doc</span>
      <span className="text-zinc-100">Sense</span>
    </span>
  )
}
