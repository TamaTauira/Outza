'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      offset={{ bottom: '5.5rem' }}
      toastOptions={{
        classNames: {
          toast:
            'group toast rounded-2xl border-0 bg-card font-sans text-sm text-foreground shadow-[var(--vp-shadow-lg)]',
          description: 'text-muted-foreground',
          actionButton:
            'rounded-full bg-primary px-3 text-primary-foreground',
          cancelButton:
            'rounded-full bg-muted text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
