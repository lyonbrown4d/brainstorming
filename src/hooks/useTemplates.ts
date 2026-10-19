import { queryOptions, useQuery } from '@tanstack/react-query'
import {
  contentTemplateSchema,
  templateCatalogSchema,
  templateIdSchema,
  type TemplateId,
} from '@shared/templates'
import { requireDesktopAPI } from '@renderer/lib/desktop'
import { queryClient } from '@renderer/lib/queryClient'

export const templateCatalogOptions = () =>
  queryOptions({
    queryKey: ['templates', 'catalog'],
    queryFn: async () => templateCatalogSchema.parse(await requireDesktopAPI().listTemplates()),
    staleTime: Infinity,
    retry: false,
  })
export const useTemplates = (enabled = true) =>
  useQuery({ ...templateCatalogOptions(), enabled }, queryClient)

export const fetchTemplate = (id: TemplateId) =>
  queryClient.query(
    queryOptions({
      queryKey: ['templates', 'content', id],
      queryFn: async () => {
        templateIdSchema.parse(id)
        const template = contentTemplateSchema.parse(await requireDesktopAPI().getTemplate(id))
        if (template.id !== id) throw new Error('Template identifier mismatch')
        return template
      },
      staleTime: Infinity,
      retry: false,
    }),
  )
