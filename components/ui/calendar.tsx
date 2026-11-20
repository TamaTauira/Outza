'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';

import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('vp-calendar p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row sm:space-x-4',
        month: 'space-y-3',
        caption: 'relative flex h-9 items-center justify-center',
        caption_label: 'text-sm font-semibold',
        nav: 'flex items-center',
        nav_button: 'inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted p-0 text-foreground hover:bg-muted/80',
        nav_button_previous: 'absolute left-0',
        nav_button_next: 'absolute right-0',
        table: 'w-full border-collapse',
        head_row: 'flex',
        head_cell: 'w-10 text-center text-xs font-medium text-muted-foreground',
        row: 'mt-1 flex w-full',
        cell: 'relative h-10 w-10 p-0 text-center text-sm focus-within:relative focus-within:z-20',
        day: 'inline-flex h-8 w-8 items-center justify-center rounded-full p-0 text-sm font-medium hover:bg-muted',
        day_range_end: 'day-range-end',
        day_selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
        day_today: 'ring-2 ring-[#F05A9D] ring-offset-2 ring-offset-background',
        day_outside: 'day-outside text-muted-foreground/50',
        day_disabled: 'text-muted-foreground/40',
        day_range_middle: 'aria-selected:bg-primary/15 aria-selected:text-foreground',
        day_hidden: 'invisible',
        ...classNames,
      }}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
