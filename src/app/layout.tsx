import type {Metadata} from 'next';
import Link from 'next/link';
import { Home, ListChecks, Brain, UserCheck, PanelLeft } from 'lucide-react';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { Sidebar, SidebarContent, SidebarItem, SidebarTrigger, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';


export const metadata: Metadata = {
  title: 'LeadTrack Solo',
  description: 'A simple, personal CRM for managing leads.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased h-full">
        <Sidebar>
          <div className="flex-1 w-full">{children}</div>
        </Sidebar>
        <Toaster />
      </body>
    </html>
  );
}
