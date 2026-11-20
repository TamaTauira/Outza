'use client'

import { CampaignBuilder } from '../campaign-builder'
import { BoostStudio } from '../boost-studio'

const sample = [{
  id: 'sample-night',
  title: 'Sample night at the hall',
  date: '2026-12-12T00:00:00.000Z',
  city: 'Sydney',
  venueName: 'Sample Hall',
  category: 'Music',
}]

export function LayoutSample() {
  return (
    <>
      <CampaignBuilder
        events={sample}
        pro={false}
        stripeEnabled={false}
        eventId={sample[0].id}
        onEventChange={() => {}}
        onDone={() => {}}
      />
      <BoostStudio events={sample} pro={false} />
    </>
  )
}
