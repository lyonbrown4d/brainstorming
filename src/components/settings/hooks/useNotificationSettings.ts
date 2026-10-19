import { useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  changeNotificationsEnabled,
  readNotificationSettings,
} from '@renderer/lib/notificationOperations'
import { queryClient } from '@renderer/lib/queryClient'

export const useNotificationSettings = () => {
  const inFlight = useRef(false)
  const queryKey = ['notification-settings'] as const
  const query = useQuery(
    {
      queryKey,
      queryFn: readNotificationSettings,
      retry: false,
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    },
    queryClient,
  )
  const update = useMutation(
    {
      mutationFn: changeNotificationsEnabled,
      onMutate: () => queryClient.cancelQueries({ queryKey }),
      onSuccess: (settings) => {
        queryClient.setQueryData(queryKey, settings)
      },
    },
    queryClient,
  )
  const toggle = async (): Promise<void> => {
    if (inFlight.current || !query.data) return
    inFlight.current = true
    try {
      await update.mutateAsync(!query.data.enabled)
    } catch {
      /* The mutation exposes its error inline. */
    } finally {
      inFlight.current = false
    }
  }
  return {
    settings: query.data,
    pending: query.isFetching || update.isPending,
    failed: query.isError || update.isError,
    reload: async () => {
      update.reset()
      await query.refetch()
    },
    toggle,
  }
}
