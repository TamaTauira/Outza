'use client'

import { useRef, type ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHandle, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * One sheet shell. Ask, Menu and the event peek share the radius, the grab
 * handle, the title face and the 44×44 close button.
 * `dock` sits flush on the bottom nav. `centre` is the desktop Ask panel.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  id,
  className,
  labelledBy,
  descriptionClassName,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
  id?: string
  className?: string
  labelledBy?: string
  descriptionClassName?: string
  onCloseAutoFocus?: (event: Event) => void
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(max-width: 1023px)').matches) return
    drag.current = { y: event.clientY, dy: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !sheetRef.current) return
    const dy = Math.max(0, event.clientY - drag.current.y)
    drag.current.dy = dy
    sheetRef.current.style.transform = `translateY(${dy}px)`
  }
  const onPointerUp = () => {
    const dy = drag.current?.dy ?? 0
    drag.current = null
    if (!sheetRef.current) return
    if (dy > 96) {
      onOpenChange(false)
      return
    }
    sheetRef.current.style.transform = ''
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={sheetRef}
        side="bottom"
        id={id}
        aria-labelledby={labelledBy}
        className={cn('vp-bottom-sheet flex flex-col gap-4 px-6 pb-5 pt-2', className)}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <SheetHandle
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <SheetHeader className="space-y-2 pr-12">
          <SheetTitle>{title}</SheetTitle>
          {typeof description === 'string' ? (
            <SheetDescription className={cn('text-sm text-muted-foreground', descriptionClassName)}>{description}</SheetDescription>
          ) : description ? (
            <SheetDescription asChild>
              <div className="text-sm text-muted-foreground">{description}</div>
            </SheetDescription>
          ) : null}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
