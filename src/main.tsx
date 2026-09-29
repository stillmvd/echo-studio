import { QueryClientProvider } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { installNativeMenuGuard } from '@/lib/context-menu';
import { installKeyboardMode } from '@/lib/keyboard-mode';
import { installMouseNavigation } from '@/lib/nav-history';
import { queryClient } from '@/lib/query-client';
import '@/styles/globals.css';

installNativeMenuGuard(import.meta.env.DEV);
installMouseNavigation();
installKeyboardMode();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    invoke('app_ready').catch(() => {});
  });
});
