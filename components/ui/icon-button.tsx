import * as React from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'

/** Icon-only control. `label` is the accessible name. Hit area is 44px. */
export const IconButton = React.forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(
  ({ label, size = 'icon', ...props }, ref) => <Button ref={ref} size={size} aria-label={label} {...props} />,
)
IconButton.displayName = 'IconButton'
