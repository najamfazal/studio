
'use client';

import { QuickLogProvider } from '@/hooks/use-quick-log';
import { SidebarProvider } from '@/components/ui/sidebar';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { Toaster } from '@/components/ui/toaster';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QuickLogProvider>
      <SidebarProvider>
        <FirebaseErrorListener />
        {children}
        <Toaster />
      </SidebarProvider>
    </QuickLogProvider>
  );
}
