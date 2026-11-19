import { ABS_HOME, CC_BY_4 } from '@/lib/attributions'

/** Linked ABS credit. The dataset name is the only part that changes. */
export function AbsCredit({ dataset }: { dataset: string }) {
  return (
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
      Source: <a href={ABS_HOME} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">Australian Bureau of Statistics</a>, {dataset}, <a href={CC_BY_4} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
    </p>
  )
}
