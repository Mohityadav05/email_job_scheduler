"use client";

import { useEffect, useCallback, useState } from "react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
}

let _addToast: ((msg: Omit<ToastMessage, "id">) => void) | null = null;

export function toast(message: string, variant: ToastVariant = "info") {
  _addToast?.({ message, variant });
}

const icons: Record<ToastVariant, string> = {
  success: "✓",
  error: "✕",
  info: "i",
};

const variantStyles: Record<ToastVariant, string> = {
  success: "bg-green-50 text-green-800 border-green-200",
  error: "bg-red-50 text-red-800 border-red-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
};

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((msg: Omit<ToastMessage, "id">) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...msg, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    _addToast = addToast;
    return () => { _addToast = null; };
  }, [addToast]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg pointer-events-auto",
            "animate-in slide-in-from-bottom-2 fade-in",
            variantStyles[t.variant]
          )}
        >
          <span className="font-bold text-sm mt-0.5">{icons[t.variant]}</span>
          <p className="text-sm">{t.message}</p>
        </div>
      ))}
    </div>
  );
}
