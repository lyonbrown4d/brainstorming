import { QueryClient } from '@tanstack/react-query'

/** Cache external reads only; documents and command history remain in the editor store. */
export const queryClient = new QueryClient()
