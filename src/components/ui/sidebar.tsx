"use client"

import * as React from "react"
import Link from "next/link"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Home, ListChecks, Brain, UserCheck, PanelLeft } from 'lucide-react'


import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTrigger } from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a Sidebar component.")
  }
  return context
}

const Sidebar = React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<"div">
>(({ className, children, ...props }, ref) => {
    const isMobile = useIsMobile()
    const [open, setOpen] = React.useState(false)

    const contextValue = React.useMemo<SidebarContext>(() => ({ open, setOpen, isMobile }), [open, setOpen, isMobile]);

    return (
        <SidebarContext.Provider value={contextValue}>
            <div className={cn("flex min-h-screen w-full", className)} ref={ref} {...props}>
                {isMobile ? <MobileSidebar /> : <DesktopSidebar />}
                {children}
            </div>
        </SidebarContext.Provider>
    )
})
Sidebar.displayName = "Sidebar"


function DesktopSidebar() {
  return (
    <nav className="hidden sm:flex flex-col items-center gap-4 border-r bg-card px-2 sm:px-4 py-8">
        <TooltipProvider>
            {sidebarItems.map(item => (
                <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                        <Link
                            href={item.href}
                            className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8"
                        >
                            <item.icon className="h-5 w-5" />
                            <span className="sr-only">{item.label}</span>
                        </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
            ))}
        </TooltipProvider>
    </nav>
  )
}

function MobileSidebar() {
    const { open, setOpen } = useSidebar();
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="sm:hidden fixed top-4 left-4 z-20 bg-card">
                    <PanelLeft className="h-5 w-5" />
                    <span className="sr-only">Toggle Menu</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="sm:max-w-xs p-0 bg-card">
                <nav className="flex flex-col gap-6 text-lg font-medium p-6">
                    <Link
                        href="/"
                        className="group flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:h-9 md:w-9 md:text-base"
                        onClick={() => setOpen(false)}
                    >
                        <ListChecks className="h-5 w-5 transition-all group-hover:scale-110" />
                        <span className="sr-only">Tasks</span>
                    </Link>
                    {sidebarItems.slice(1).map(item => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground"
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

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        className
      )}
      {...props}
    />
  )
})
SidebarContent.displayName = "SidebarContent"

const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, ...props }, ref) => {
  const { setOpen } = useSidebar()

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn("sm:hidden", className)}
      onClick={() => setOpen(true)}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
})
SidebarTrigger.displayName = "SidebarTrigger"


export {
  Sidebar,
  SidebarContent,
  SidebarTrigger,
  useSidebar,
}

// Dummy exports to satisfy previous imports, can be cleaned up later.
export const SidebarProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const SidebarHeader = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const SidebarMenu = ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>;
export const SidebarMenuItem = ({ children }: { children: React.ReactNode }) => <li>{children}</li>;
export const SidebarMenuButton = ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button>;
export const SidebarItem = ({ children }: { children: React.ReactNode }) => <>{children}</>;
