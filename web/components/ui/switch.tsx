"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, leftIcon, rightIcon, ...props }, ref) => {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        ref={ref}
        className={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 relative",
          checked ? "bg-blue-600" : "bg-blue-600/50",
          className
        )}
        onClick={() => onCheckedChange?.(!checked)}
        {...props}
      >
        {/* Left icon */}
        {leftIcon && (
          <span
            className={cn(
              "absolute left-1 pointer-events-none transition-opacity z-10",
              checked ? "opacity-0" : "opacity-100"
            )}
          >
            {leftIcon}
          </span>
        )}
        
        {/* Right icon */}
        {rightIcon && (
          <span
            className={cn(
              "absolute right-1 pointer-events-none transition-opacity z-10",
              checked ? "opacity-100" : "opacity-0"
            )}
          >
            {rightIcon}
          </span>
        )}
        
        <span
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform z-20",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }
