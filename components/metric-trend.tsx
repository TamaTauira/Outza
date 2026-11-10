export type TrendPoint = { label: string; value: number | null; compare?: number | null }

function segments(points: TrendPoint[], pick: (point: TrendPoint) => number | null, scale: { min: number; span: number }) {
  const w = 240
  const h = 56
  const pad = 6
  const lines: string[] = []
  let pen = ''
  points.forEach((point, i) => {
    const value = pick(point)
    if (value == null) {
      if (pen) lines.push(pen)
      pen = ''
      return
    }
    const x = points.length === 1 ? w / 2 : pad + (i / (points.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (value - scale.min) / scale.span) * (h - pad * 2)
    pen += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `
  })
  if (pen) lines.push(pen)
  return lines
}

/** Server-rendered trend. A gap is a missing reading, not a zero. */
export function MetricTrend({ points, caption, seriesLabel, compareLabel }: { points: TrendPoint[]; caption: string; seriesLabel?: string; compareLabel?: string }) {
  const known = points.flatMap((point) => [point.value, point.compare].filter((value): value is number => value != null))
  if (known.length < 2) {
    return <p className="text-xs text-muted-foreground">{known.length === 1 ? 'One reading so far. The line shows up once there’s a second.' : 'No readings yet.'}</p>
  }
  const min = Math.min(...known)
  const max = Math.max(...known)
  const scale = { min, span: max - min || 1 }
  const main = segments(points, (point) => point.value, scale)
  const compare = compareLabel ? segments(points, (point) => point.compare ?? null, scale) : []
  const labels = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]]
  return (
    <div>
      <svg role="img" aria-label={caption} viewBox="0 0 240 56" className="mt-3 h-14 w-full">
        <title>{caption}</title>
        {compare.map((d) => <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground" />)}
        {main.map((d) => <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />)}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        {labels.map((point, i) => <span key={`${point.label}-${i}`}>{point.label}</span>)}
      </div>
      {compareLabel && (
        <p className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-primary" /> {seriesLabel ?? 'This reading'}</span>
          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-muted-foreground" /> {compareLabel}</span>
        </p>
      )}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead><tr><th>When</th><th>Value</th>{compareLabel && <th>{compareLabel}</th>}</tr></thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <td>{point.label}</td>
              <td>{point.value ?? 'none'}</td>
              {compareLabel && <td>{point.compare ?? 'none'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
