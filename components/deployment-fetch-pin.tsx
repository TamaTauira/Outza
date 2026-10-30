'use client'

import { useLayoutEffect } from 'react'
import { installDeploymentFetchPin } from '@/lib/deployment-fetch'

/**
 * Runs before child useEffect fetches. Layout effects flush before passive
 * effects, so the /local listing request (and any other same-origin fetch)
 * carries the deployment id from the first call.
 */
export function DeploymentFetchPin() {
  useLayoutEffect(() => {
    installDeploymentFetchPin()
  }, [])
  return null
}
