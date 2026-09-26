"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export const Sheet = Dialog.Root
export const SheetTrigger = Dialog.Trigger
export const SheetClose = Dialog.Close

export function SheetContent({ className, children, side = "left", ...props }: React.ComponentProps<typeof Dialog.Content> & { side?: "left" | "right" }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[#091e428a]" />
      <Dialog.Content
        className={cn(
          "fixed z-50 flex h-full w-[min(100%,20rem)] flex-col border-border bg-sidebar text-sidebar-foreground shadow-xl",
          side === "left" ? "left-0 top-0 border-r" : "right-0 top-0 border-l",
          className,
        )}
        {...props}
      >
        {children}
        <Dialog.Close className="absolute right-3 top-3 rounded-md p-1 text-sidebar-muted hover:bg-sidebar-accent">
          <X className="h-4 w-4" />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  )
}
