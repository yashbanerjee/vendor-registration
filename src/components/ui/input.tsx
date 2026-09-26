import * as React from "react"
import { cn } from "@/lib/utils"

const field = "w-full rounded-[3px] border-2 border-input bg-card text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[var(--ring)] disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70"

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("flex h-10 px-2", field, className)} {...props} />
))
Input.displayName = "Input"

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("min-h-24 px-2 py-2", field, className)} {...props} />
))
Textarea.displayName = "Textarea"

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-xs font-semibold text-foreground", className)} {...props} />
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select className={cn("flex h-10 px-2", field, className)} {...props}>
      {children}
    </select>
  )
}
