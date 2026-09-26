import { cn } from "@/lib/utils"

const tones: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  APPROVED: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  PAID: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  COMPLETED: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  ISSUED: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
  SENT: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
  SUBMITTED: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  PENDING: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  UNDER_REVIEW: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  EXPIRING_SOON: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  PLANNING: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
  DRAFT: "bg-muted text-muted-foreground",
  REJECTED: "bg-red-500/10 text-red-800 dark:text-red-200",
  SUSPENDED: "bg-red-500/10 text-red-800 dark:text-red-200",
  EXPIRED: "bg-red-500/10 text-red-800 dark:text-red-200",
  OVERDUE: "bg-red-500/10 text-red-800 dark:text-red-200",
  CANCELLED: "bg-muted text-muted-foreground",
  CHANGES_REQUESTED: "bg-orange-500/10 text-orange-900 dark:text-orange-100",
}

export function Badge({ value, className }: { value?: string | null; className?: string }) {
  const key = value || ""
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[key] || "bg-secondary text-secondary-foreground", className)}>
      {key ? key.toLowerCase().replaceAll("_", " ") : "—"}
    </span>
  )
}
