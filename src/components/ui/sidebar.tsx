"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cva, type VariantProps } from "class-variance-authority"
import { Home, ListChecks, Brain, UserCheck, PanelLeft, Menu } from 'lucide-react'

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

const sidebarItems = [
    { href: '/', icon: ListChecks, label: 'Tasks' },
    { href: '/leads', icon: Home, label: 'Leads' },
    { href: '/follow-list', icon: UserCheck, label: 'Follow List' },
    { href: '/recall-trainer', icon: Brain, label: 'Recall Trainer' },
]

type SidebarContext = {
  open: boolean
  setOpen: (open: boolean) => void
  isMobile: boolean
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
    const isMobile = useIsMobile()
    const [open, setOpen] = React.useState(false)

    const contextValue = React.useMemo<SidebarContext>(() => ({ open, setOpen, isMobile }), [open, setOpen, isMobile]);

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
    const { isMobile } = useSidebar();

    if (isMobile) {
        return <MobileSidebar />
    }

    return (
        <nav className={cn("hidden sm:flex flex-col items-center gap-4 border-r bg-card px-2 sm:px-4 py-8", className)} ref={ref} {...props}>
            <TooltipProvider>
                <Link href="/" className="mb-4">
                  <Logo className="h-8 w-8 text-primary" />
                </Link>
                {sidebarItems.map(item => (
                    <DesktopSidebarItem key={item.href} {...item} />
                ))}
            </TooltipProvider>
        </nav>
    )
})
Sidebar.displayName = "Sidebar"


function DesktopSidebarItem({ href, icon: Icon, label }: typeof sidebarItems[number]) {
  const pathname = usePathname();
  return (
    <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
            <Link
                href={href}
                className={cn(
                    "group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8",
                    pathname === href && "bg-primary text-primary-foreground hover:text-primary-foreground"
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
    const pathname = usePathname();
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
                <nav className="flex flex-col gap-2 text-lg font-medium p-4">
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

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn(className)}
      onClick={() => setOpen(true)}
      {...props}
    >
      <Menu className="h-5 w-5"/>
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
})
SidebarTrigger.displayName = "SidebarTrigger"


export {
  Sidebar,
  SidebarTrigger,
}
