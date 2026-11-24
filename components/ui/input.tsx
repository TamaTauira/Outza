import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/** 44px field. 16px type so iOS does not zoom, 12px radius. */
export const fieldClass =
  'h-control w-full rounded-control border border-input bg-background px-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70'

const inputVariants = cva(
  "flex w-full rounded-control border bg-background text-base transition-all duration-fast file:border-0 file:bg-transparent file:text-base file:font-medium placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70",
  {
    variants: {
      variant: {
        default: "border-input hover:border-ring/50 focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        error: "border-destructive hover:border-destructive focus-visible:border-destructive focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        success: "border-emerald-500 hover:border-emerald-500 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        ghost: "border-transparent bg-muted/50 hover:bg-muted focus-visible:bg-background focus-visible:border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      },
      size: {
        default: "h-control px-3 py-2",
        sm: "h-control px-3 py-2",
        lg: "h-control-lg px-4 py-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, size, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input, inputVariants }