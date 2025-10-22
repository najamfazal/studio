
"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, ListChecks, Brain, UserCheck, PanelLeft, Menu, Settings, CalendarDays, Users, BarChart, NotebookPen, Zap, LogOut } from 'lucide-react'
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Logo } from "../icons"
import { useQuickLog } from "@/hooks/use-quick-log"
import { Avatar, AvatarFallback, AvatarImage } from "./avatar"

const sidebarItems = [
    { href: '/', icon: Zap, label: 'Routines' },
    { href: '/search', icon: Users, label: 'Contacts' },
    { href: '/events', icon: CalendarDays, label: 'Events' },
    { href: '/reports', icon: BarChart, label: 'Reports' },
]

const secondarySidebarItems = [
    { href: '/follow-list', icon: UserCheck, label: 'Follow List' },
    { href: '/recall-trainer', icon: Brain, label: 'Recall Trainer' },
]

type SidebarContext = {
  open: boolean
  setOpen: (open: boolean) => void
}

const SidebarContext = React.createContext<SidebarContext | null>(null)

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider component.")
  }
  return context
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = React.useState(false)

    const contextValue = React.useMemo<SidebarContext>(() => ({ open, setOpen }), [open, setOpen]);

    return (
        <SidebarContext.Provider value={contextValue}>
            {children}
        </SidebarContext.Provider>
    )
}

const Sidebar = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
    const { openQuickLog } = useQuickLog();
    const [user] = useAuthState(auth);

    if (!user) return null;

    return (
        <nav className={cn("hidden sm:flex flex-col justify-between items-center gap-4 border-r bg-card px-2 sm:px-4 py-8", className)} ref={ref} {...props}>
            <TooltipProvider>
                <div className="flex flex-col items-center gap-4">
                  <Link href="/" className="mb-4">
                    <Logo className="h-8 w-8 text-primary" />
                  </Link>
                  {sidebarItems.map(item => (
                      <DesktopSidebarItem key={item.href} {...item} />
                  ))}
                   <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                          <Button
                              variant="ghost"
                              size="icon"
                              className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
                              onClick={openQuickLog}
                          >
                              <NotebookPen className="h-5 w-5" />
                              <span className="sr-only">Quick Log</span>
                          </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">Quick Log</TooltipContent>
                  </Tooltip>
                </div>

                <div className="flex flex-col items-center gap-4">
                   {secondarySidebarItems.map(item => (
                        <DesktopSidebarItem key={item.href} {...item} />
                    ))}
                    <DesktopSidebarItem href="/settings" icon={Settings} label="Settings" />
                     <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                           <Button
                              variant="ghost"
                              size="icon"
                              className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
                              onClick={() => signOut(auth)}
                          >
                              <LogOut className="h-5 w-5" />
                              <span className="sr-only">Sign Out</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">Sign Out</TooltipContent>
                    </Tooltip>
                    <Avatar>
                        <AvatarImage src={user?.photoURL ?? undefined} alt={user?.displayName ?? ''} />
                        <AvatarFallback>{user?.email?.[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                </div>
            </TooltipProvider>
        </nav>
    )
})
Sidebar.displayName = "Sidebar"


function DesktopSidebarItem({ href, icon: Icon, label }: { href: string, icon: React.ElementType, label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
            <Link
                href={href}
                className={cn(
                    "group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8",
                    isActive && "bg-primary text-primary-foreground hover:text-primary-foreground"
                )}
            >
                <Icon className="h-5 w-5" />
                <span className="sr-only">{label}</span>
            </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function MobileSidebar() {
    const { open, setOpen } = useSidebar();
    const { openQuickLog } = useQuickLog();
    const [user] = useAuthState(auth);
    const pathname = usePathname();

    if (!user) return null;
    
    const handleQuickLogClick = () => {
        setOpen(false);
        openQuickLog();
    }

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="left" className="sm:max-w-xs p-0 bg-card">
                 <SheetHeader className="p-4 border-b">
                    <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
                        <Logo className="h-8 w-8 text-primary" />
                        <span className="font-bold text-lg">LeadTrack</span>
                    </Link>
                    <SheetTitle className="sr-only">Main Menu</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col justify-between h-[calc(100vh-70px)]">
                    <div className="p-4">
                        {sidebarItems.map(item => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-4 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground",
                                    pathname === item.href && "bg-muted text-foreground"
                                )}
                                onClick={() => setOpen(false)}
                            >
                                <item.icon className="h-5 w-5" />
                                {item.label}
                            </Link>
                        ))}
                         <button
                            onClick={handleQuickLogClick}
                            className="flex w-full items-center gap-4 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground"
                        >
                            <NotebookPen className="h-5 w-5" />
                            Quick Log
                        </button>
                        <div className="my-4 border-t border-border -mx-4"></div>
                        {secondarySidebarItems.map(item => (
                             <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-4 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground",
                                    pathname === item.href && "bg-muted text-foreground"
                                )}
                                onClick={() => setOpen(false)}
                            >
                                <item.icon className="h-5 w-5" />
                                {item.label}
                            </Link>
                        ))}
                        <Link
                            href="/settings"
                            className={cn(
                                "flex items-center gap-4 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground",
                                pathname === '/settings' && "bg-muted text-foreground"
                            )}
                            onClick={() => setOpen(false)}
                        >
                            <Settings className="h-5 w-5" />
                            Settings
                        </Link>
                    </div>
                     <div className="p-4 border-t">
                          <div className="flex items-center gap-3 mb-4">
                             <Avatar>
                                <AvatarImage src={user?.photoURL ?? undefined} alt={user?.displayName ?? ''} />
                                <AvatarFallback>{user?.email?.[0].toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="grid gap-0.5 text-xs">
                               <div className="font-medium">{user?.displayName}</div>
                               <div className="text-muted-foreground">{user?.email}</div>
                            </div>
                        </div>
                        <Button variant="outline" className="w-full" onClick={() => {signOut(auth); setOpen(false);}}>
                           <LogOut className="mr-2 h-4 w-4" /> Sign Out
                        </Button>
                    </div>
                </nav>
            </SheetContent>
        </Sheet>
    )
}

const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  Omit<React.ComponentProps<typeof Button>, "children">
>(({ className, ...props }, ref) => {
  const { setOpen } = useSidebar()
  const [user] = useAuthState(auth);

  if (!user) return null;

  return (
    <>
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        className={cn("sm:hidden", className)}
        onClick={() => setOpen(true)}
        {...props}
      >
        <Menu className="h-5 w-5"/>
        <span className="sr-only">Toggle Sidebar</span>
      </Button>
      <MobileSidebar />
    </>
  )
})
SidebarTrigger.displayName = "SidebarTrigger"


export {
  Sidebar,
  SidebarTrigger,
}
