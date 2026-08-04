import { useEffect, useState } from "react"

import { fetchSharedConfig } from "@/lib/api/configs"
import { useConfigStore } from "@/stores/config-store"
import { fromSeedPayload } from "./seed"

// Consumes `?fromId=`: fetch, apply, then have the caller strip the param —
// whatever the outcome, so a broken link cannot wedge the URL. Success shows
// itself as the loaded selection; the returned error is the only UI this owns.
export const useSharedImport = (fromId: string, clearFromId: () => void) => {
  const importConfig = useConfigStore((state) => state.importConfig)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!fromId) return
    let stale = false

    void fetchSharedConfig(fromId).then((result) => {
      if (stale) return

      if (result.ok) importConfig(fromSeedPayload(result.payload))
      else setError(result.error)

      clearFromId()
    })

    return () => {
      stale = true
    }
  }, [fromId, importConfig, clearFromId])

  return error
}
