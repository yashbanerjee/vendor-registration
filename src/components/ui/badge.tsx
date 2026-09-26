import { cn } from "@/lib/utils"

const tones: Record<string, string> = {
  ACTIVE: "bg-[#dcfff1] text-[#216e4e] dark:bg-[#1c3329] dark:text-[#7ee2b8]",
  APPROVED: "bg-[#dcfff1] text-[#216e4e] dark:bg-[#1c3329] dark:text-[#7ee2b8]",
  PAID: "bg-[#dcfff1] text-[#216e4e] dark:bg-[#1c3329] dark:text-[#7ee2b8]",
  COMPLETED: "bg-[#dcfff1] text-[#216e4e] dark:bg-[#1c3329] dark:text-[#7ee2b8]",
  ACCEPTED: "bg-[#dcfff1] text-[#216e4e] dark:bg-[#1c3329] dark:text-[#7ee2b8]",
  ISSUED: "bg-[#e9f2ff] text-[#0055cc] dark:bg-[#1c2b41] dark:text-[#85b8ff]",
  SENT: "bg-[#e9f2ff] text-[#0055cc] dark:bg-[#1c2b41] dark:text-[#85b8ff]",
  PLANNING: "bg-[#e9f2ff] text-[#0055cc] dark:bg-[#1c2b41] dark:text-[#85b8ff]",
  SUBMITTED: "bg-[#fff7d6] text-[#7f5f01] dark:bg-[#332e1b] dark:text-[#f5cd47]",
  PENDING: "bg-[#fff7d6] text-[#7f5f01] dark:bg-[#332e1b] dark:text-[#f5cd47]",
  UNDER_REVIEW: "bg-[#fff7d6] text-[#7f5f01] dark:bg-[#332e1b] dark:text-[#f5cd47]",
  EXPIRING_SOON: "bg-[#fff7d6] text-[#7f5f01] dark:bg-[#332e1b] dark:text-[#f5cd47]",
  DRAFT: "bg-[#dfe1e6] text-[#44546f] dark:bg-[#2c333a] dark:text-[#9fadbc]",
  CANCELLED: "bg-[#dfe1e6] text-[#44546f] dark:bg-[#2c333a] dark:text-[#9fadbc]",
  ARCHIVED: "bg-[#dfe1e6] text-[#44546f] dark:bg-[#2c333a] dark:text-[#9fadbc]",
  REJECTED: "bg-[#ffeceb] text-[#ae2e24] dark:bg-[#42221f] dark:text-[#fd9891]",
  SUSPENDED: "bg-[#ffeceb] text-[#ae2e24] dark:bg-[#42221f] dark:text-[#fd9891]",
  EXPIRED: "bg-[#ffeceb] text-[#ae2e24] dark:bg-[#42221f] dark:text-[#fd9891]",
  OVERDUE: "bg-[#ffeceb] text-[#ae2e24] dark:bg-[#42221f] dark:text-[#fd9891]",
  DECLINED: "bg-[#ffeceb] text-[#ae2e24] dark:bg-[#42221f] dark:text-[#fd9891]",
  CHANGES_REQUESTED: "bg-[#fff3eb] text-[#a54800] dark:bg-[#3d2b1f] dark:text-[#fec195]",
  SUPER_ADMIN: "bg-[#eae6ff] text-[#5e4db2] dark:bg-[#2b273f] dark:text-[#b8acf6]",
  ADMIN: "bg-[#e9f2ff] text-[#0055cc] dark:bg-[#1c2b41] dark:text-[#85b8ff]",
  VENDOR: "bg-[#e7f9ff] text-[#206a83] dark:bg-[#1d333b] dark:text-[#9dd9ee]",
  STAFF: "bg-[#dfe1e6] text-[#44546f] dark:bg-[#2c333a] dark:text-[#9fadbc]",
}

export function Badge({ value, className }: { value?: string | null; className?: string }) {
  const key = value || ""
  return (
    <span className={cn("inline-flex h-4 max-w-full items-center rounded-[3px] px-1 text-[11px] font-bold uppercase leading-4 tracking-normal", tones[key] || "bg-[#dfe1e6] text-[#44546f] dark:bg-[#2c333a] dark:text-[#9fadbc]", className)}>
      <span className="truncate">{key ? key.toLowerCase().replaceAll("_", " ") : "—"}</span>
    </span>
  )
}
