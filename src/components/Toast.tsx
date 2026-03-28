"use client";

import { useState, useCallback, useRef } from "react";

export type ToastType = "success" | "error";

interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((text: string, type: ToastType = "error") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return { toasts, showToast };
}

export function ToastContainer({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-fade-in-up rounded-xl px-4 py-2.5 text-sm font-medium shadow-warm-lg ${
            toast.type === "error"
              ? "bg-danger text-white"
              : "bg-accent text-white"
          }`}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
