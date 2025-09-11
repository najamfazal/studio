import type {Metadata} from 'next';
import Link from 'next/link';
import { Home, ListChecks, Brain, UserCheck } from 'lucide-react';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

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
        <div className="flex min-h-screen w-full">
          <nav className="hidden sm:flex flex-col items-center gap-4 border-r bg-card px-2 sm:px-4 py-8">
            <Link
              href="/"
              className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:h-8 md:w-8 md:text-base"
            >
              <ListChecks className="h-4 w-4 transition-all group-hover:scale-110" />
              <span className="sr-only">Tasks</span>
            </Link>
            <Link
              href="/leads"
              className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
            >
              <Home className="h-5 w-5" />
              <span className="sr-only">Leads</span>
            </Link>
            <Link
              href="/follow-list"
              className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
            >
              <UserCheck className="h-5 w-5" />
              <span className="sr-only">Follow List</span>
            </Link>
            <Link
              href="/recall-trainer"
              className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
            >
              <Brain className="h-5 w-5" />
              <span className="sr-only">Recall Trainer</span>
            </Link>
          </nav>
          <div className="flex-1 w-full">{children}</div>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
