import { useEffect, useState } from 'react'
import apiClient from '@/services/apiClient'

interface ProtectedFileState {
  fileUrl: string | null
  isLoading: boolean
  hasError: boolean
}

export function useProtectedFileUrl(path: string | null, enabled = true): ProtectedFileState {
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let isActive = true
    let objectUrl: string | null = null

    if (!path || !enabled) {
      setFileUrl(null)
      setIsLoading(false)
      setHasError(false)
      return
    }

    setIsLoading(true)
    setFileUrl(null)
    setHasError(false)

    void apiClient
      .getBlob(path)
      .then((blob) => {
        if (!isActive) {
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setFileUrl(objectUrl)
        setHasError(false)
      })
      .catch(() => {
        if (!isActive) {
          return
        }
        setFileUrl(null)
        setHasError(true)
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    return () => {
      isActive = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [enabled, path])

  return { fileUrl, isLoading, hasError }
}
