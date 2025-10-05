
"use client"

import React, { createContext, useContext, useState, useMemo } from 'react';
import { QuickLogDialog } from '@/components/quick-log-dialog';

type QuickLogContextType = {
    isOpen: boolean;
    openQuickLog: () => void;
    closeQuickLog: () => void;
}

const QuickLogContext = createContext<QuickLogContextType | null>(null);

export function useQuickLog() {
    const context = useContext(QuickLogContext);
    if (!context) {
        throw new Error('useQuickLog must be used within a QuickLogProvider');
    }
    return context;
}

export function QuickLogProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);

    const openQuickLog = () => setIsOpen(true);
    const closeQuickLog = () => setIsOpen(false);

    const value = useMemo(() => ({
        isOpen,
        openQuickLog,
        closeQuickLog,
    }), [isOpen]);

    return (
        <QuickLogContext.Provider value={value}>
            {children}
            <QuickLogDialog />
        </QuickLogContext.Provider>
    );
}
