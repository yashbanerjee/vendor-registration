"use client"

import * as Dropdown from "@radix-ui/react-dropdown-menu"
import { cn } from "@/lib/utils"

export const DropdownMenu = Dropdown.Root
export const DropdownMenuTrigger = Dropdown.Trigger

export function DropdownMenuContent({ className, ...props }: React.ComponentProps<typeof Dropdown.Content>) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        sideOffset={6}
        className={cn("z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg", className)}
        {...props}
      />
    </Dropdown.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Dropdown.Item>) {
  return <Dropdown.Item className={cn("cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent", className)} {...props} />
}

export function DropdownMenuSeparator() {
  return <Dropdown.Separator className="my-1 h-px bg-border" />
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Dropdown.Label>) {
  return <Dropdown.Label className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)} {...props} />
}
