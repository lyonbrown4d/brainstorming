import { useResponsive } from 'ahooks'

export const useCompactLayout = (): boolean => !useResponsive().md
