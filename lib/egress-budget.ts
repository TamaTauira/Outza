/** Bytes of a JSON value, the size that leaves Postgres or the CDN. */
export function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value))
}

const DESCRIPTION = `${'Saturday market with food, music and stalls. '.repeat(16)}`.slice(0, 700)

/** One list-card event. Heavy adds the description and raw ingest blob list views do not need. */
export function sampleListEvent(heavy = false) {
  const event: Record<string, unknown> = {
    id: 'evt_123',
    title: 'Saturday night market',
    date: '2026-11-07T00:00:00.000Z',
    endDate: null,
    time: '18:00',
    endTime: '22:00',
    allDay: false,
    startsAt: '2026-11-07T07:00:00.000Z',
    endsAt: '2026-11-07T11:00:00.000Z',
    venueName: 'Carriageworks',
    venueAddress: '245 Wilson St, Eveleigh NSW 2015',
    suburb: 'Eveleigh',
    city: 'Sydney',
    category: 'Community',
    subTags: ['Markets'],
    isLGBTI: false,
    isFree: true,
    price: 'Free',
    priceMin: 0,
    priceMax: 0,
    ticketUrl: 'https://www.example.com/tickets/market',
    imageUrl: 'https://images.example.com/market.jpg',
    latitude: -33.895,
    longitude: 151.193,
    status: 'SCHEDULED',
    source: 'eventbrite',
    lastVerifiedAt: '2026-11-04T01:00:00.000Z',
    updatedAt: '2026-11-04T01:00:00.000Z',
  }
  if (heavy) {
    event.description = DESCRIPTION
    event.raw = { ingest: 'x'.repeat(1500) }
  }
  return event
}

export function routePayloadBytes(events: number, heavy = false): number {
  return jsonBytes({
    events: Array.from({ length: events }, (_, i) => ({ ...sampleListEvent(heavy), id: `evt_${i}` })),
    total: events,
    page: 1,
    totalPages: 1,
  })
}

/**
 * Model of a day, tuned so the "before" total is about the observed 1.2 GB.
 * Guide loads are full-city scans. Job rows are what each run used to read.
 */
export const EGRESS_MODEL = {
  upcoming: 4000,
  cities: 8,
  descriptionBytes: 700,
  guideRowBytesAfter: 180,
  guideLoadsBefore: 26,
  guideLoadsAfter: 24,
  localRunsBefore: 12,
  localRunsAfter: 24,
  localRowsBefore: 20000,
  localRowBytesBefore: 900,
  localChanged: 250,
  localNarrowBytes: 200,
  localDescribed: 40,
  qualityRunsBefore: 12,
  qualityRunsAfter: 24,
  qualityRowsBefore: 4000,
  qualityChanged: 250,
  qualityRowBytes: 800,
  audienceCalls: 30,
  audienceRowsBefore: 60000,
  audienceRowBytesBefore: 60,
  audienceRowsAfter: 800,
  audienceRowBytesAfter: 40,
  boardOriginBefore: 8000,
  boardOriginAfter: 800,
  boardEvents: 20,
  mapOriginBefore: 2000,
  mapOriginAfter: 200,
  mapEvents: 300,
  listEventBytes: 450,
  awakeHoursBefore: 18,
  /** Minute 2 through minute 24, then Neon's 5 minute suspend tail. */
  awakeMinutesPerHourAfter: 28,
} as const

export type EgressEstimate = {
  bytesBefore: number
  bytesAfter: number
  awakeHoursBefore: number
  awakeHoursAfter: number
  routes: { name: string; events: number; bytesBefore: number; bytesAfter: number }[]
  jobs: { name: string; rowsBefore: number; rowsAfter: number }[]
}

export function estimateEgress(model = EGRESS_MODEL): EgressEstimate {
  const guideBefore = model.cities * model.guideLoadsBefore * model.upcoming * model.descriptionBytes
  const guideAfter = model.cities * model.guideLoadsAfter * model.upcoming * model.guideRowBytesAfter
  const localBefore = model.localRunsBefore * model.localRowsBefore * model.localRowBytesBefore
  const localAfter = model.localRunsAfter * (model.localChanged * model.localNarrowBytes + model.localDescribed * model.descriptionBytes)
  const qualityBefore = model.qualityRunsBefore * model.qualityRowsBefore * model.descriptionBytes
  const qualityAfter = model.qualityRunsAfter * model.qualityChanged * model.qualityRowBytes
  const audienceBefore = model.audienceCalls * model.audienceRowsBefore * model.audienceRowBytesBefore
  const audienceAfter = model.audienceCalls * model.audienceRowsAfter * model.audienceRowBytesAfter
  const boardBefore = model.boardOriginBefore * model.boardEvents * model.listEventBytes
  const boardAfter = model.boardOriginAfter * model.boardEvents * model.listEventBytes
  const mapBefore = model.mapOriginBefore * model.mapEvents * model.listEventBytes
  const mapAfter = model.mapOriginAfter * model.mapEvents * model.listEventBytes
  return {
    bytesBefore: guideBefore + localBefore + qualityBefore + audienceBefore + boardBefore + mapBefore,
    bytesAfter: guideAfter + localAfter + qualityAfter + audienceAfter + boardAfter + mapAfter,
    awakeHoursBefore: model.awakeHoursBefore,
    awakeHoursAfter: (model.awakeMinutesPerHourAfter / 60) * 24,
    routes: [
      { name: 'board', events: model.boardEvents, bytesBefore: routePayloadBytes(model.boardEvents, true), bytesAfter: routePayloadBytes(model.boardEvents, false) },
      { name: 'map', events: model.mapEvents, bytesBefore: routePayloadBytes(model.mapEvents, true), bytesAfter: routePayloadBytes(model.mapEvents, false) },
    ],
    jobs: [
      { name: 'quality-review', rowsBefore: model.qualityRowsBefore, rowsAfter: model.qualityChanged },
      { name: 'local-import', rowsBefore: model.localRowsBefore, rowsAfter: model.localChanged + model.localDescribed },
      { name: 'image-discover', rowsBefore: 3000, rowsAfter: 450 },
      { name: 'audience-interests', rowsBefore: model.audienceRowsBefore, rowsAfter: model.audienceRowsAfter },
    ],
  }
}
