
import type {Metadata} from 'next';
import Link from 'next/link';
import { Home, ListChecks, Brain, UserCheck, PanelLeft } from 'lucide-react';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Sidebar, SidebarProvider } from '@/components/ui/sidebar';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppSettings, ThemeSettings } from '@/lib/types';
import { QuickLogProvider } from '@/hooks/use-quick-log';

export const metadata: Metadata = {
  title: 'LeadTrack Solo',
  description: 'A simple, personal CRM for managing contacts and tasks.',
  manifest: '/manifest.json',
};

async function getThemeSettings(): Promise<ThemeSettings | null> {
  try {
    const settingsDoc = await getDoc(doc(db, "settings", "appConfig"));
    if (settingsDoc.exists()) {
      const data = settingsDoc.data() as AppSettings;
      return data.theme || null;
    }
    return null;
  } catch (error) {
    // In a server component, you might want to log this error
    console.error("Failed to fetch theme settings:", error);
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const theme = await getThemeSettings();

  const themeStyle = theme ? {
    '--background': theme.background,
    '--primary': theme.primary,
    '--accent': theme.accent,
  } as React.CSSProperties : {};

  return (
    <html lang="en" className="h-full" style={themeStyle}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#5B21B6" />
      </head>
      <body className="font-body antialiased h-full">
        <QuickLogProvider>
          <SidebarProvider>
            <div className="flex min-h-screen w-full">
              <Sidebar />
              <div className="flex-1 w-full">{children}</div>
            </div>
          </SidebarProvider>
        </QuickLogProvider>
        <Toaster />
      </body>
    </html>
  );
}
