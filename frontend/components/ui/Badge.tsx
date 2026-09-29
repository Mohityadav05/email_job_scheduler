"use client";

import { EmailStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const styles: Record<EmailStatus, string> = {
  scheduled: "bg-blue-50 text-blue-700 border border-blue-200",
  sending: "bg-yellow-50 text-yellow-700 border border-yellow-200",
  sent: "bg-green-50 text-green-700 border border-green-200",
  failed: "bg-red-50 text-red-700 border border-red-200",
};

export function Badge({ status }: { status: EmailStatus }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", styles[status])}>
      {status}
    </span>
  );
}
