import { focusManager, QueryClient } from '@tanstack/react-query';
import { onWindowActive } from '@/lib/window-activity';

focusManager.setEventListener((setFocused) => onWindowActive(setFocused));

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
