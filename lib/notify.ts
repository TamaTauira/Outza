import { toast } from 'sonner'
import { COPY } from '@/lib/copy'

function viewItinerary() {
  window.location.href = '/itinerary'
}

export function notifyAddedToItinerary(count = 1) {
  toast.success(count > 1 ? `Added ${count} stops to your Itinerary` : COPY.addedToItinerary, {
    action: { label: COPY.viewItinerary, onClick: viewItinerary },
  })
}

export function notifyRemovedFromItinerary() {
  toast(COPY.removedFromItinerary, {
    action: { label: COPY.viewItinerary, onClick: viewItinerary },
  })
}

export function notifySaved(on: boolean) {
  toast(on ? COPY.saved : COPY.removedFromSaved)
}
