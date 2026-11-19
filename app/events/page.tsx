import { permanentRedirect } from 'next/navigation'

/** Event pages live at /events/<slug>. The bare index used to 404. */
export default function EventsIndex() {
  permanentRedirect('/')
}
