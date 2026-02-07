import { type InputHTMLAttributes, forwardRef, useId } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id: externalId, ...props }, ref) => {
    const generatedId = useId()
    const id = externalId ?? generatedId

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-zinc-300">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`
            block w-full rounded-lg border bg-surface px-3.5 py-2.5 text-sm text-zinc-100
            placeholder:text-zinc-500 transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50
            disabled:cursor-not-allowed disabled:opacity-60
            ${error ? 'border-red-500/50' : 'border-zinc-800 hover:border-zinc-700'}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="text-xs text-red-400" role="alert">{error}</p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'
export default Input
