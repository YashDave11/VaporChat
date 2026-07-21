import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// shadcn/ui button, rebuilt on Vapor tokens. Flat surfaces, hairline borders,
// no default shadows — the accent is reserved for the primary action only.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-body text-sm font-medium transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-signal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Primary: pale signal surface, dark text — the one bright thing on the page
        signal:
          "rounded-sm bg-signal text-void hover:bg-breath hover:shadow-[0_0_32px_rgba(169,232,220,0.25)]",
        // Secondary: hairline ghost
        ghost:
          "rounded-sm border border-fog/25 bg-transparent text-breath hover:border-fog/60 hover:bg-smoke",
        // Tertiary: bare text link
        bare: "text-fog hover:text-breath",
      },
      size: {
        default: "h-11 px-6",
        lg: "h-13 px-8 text-base",
        sm: "h-9 px-4 text-xs",
      },
    },
    defaultVariants: {
      variant: "signal",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
