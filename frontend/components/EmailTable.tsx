"use client";

import { Email } from "@/lib/api";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface EmailTableProps {
  emails: Email[];
  loading: boolean;
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  emptyMessage: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const columns = [
  {
    key: "recipient",
    header: "To",
    render: (row: Email) => (
      <span className="font-mono text-xs">{row.recipient}</span>
    ),
  },
  {
    key: "subject",
    header: "Subject",
    render: (row: Email) => (
      <span className="max-w-xs truncate block" title={row.subject}>
        {row.subject}
      </span>
    ),
    className: "max-w-xs",
  },
  {
    key: "status",
    header: "Status",
    render: (row: Email) => <Badge status={row.status} />,
  },
  {
    key: "scheduledAt",
    header: "Scheduled",
    render: (row: Email) => (
      <span className="text-gray-500 text-xs whitespace-nowrap">
        {formatDate(row.scheduledAt)}
      </span>
    ),
  },
  {
    key: "sentAt",
    header: "Sent",
    render: (row: Email) =>
      row.sentAt ? (
        <span className="text-gray-500 text-xs whitespace-nowrap">{formatDate(row.sentAt)}</span>
      ) : (
        <span className="text-gray-300 text-xs">—</span>
      ),
  },
];

export function EmailTable({
  emails,
  loading,
  total,
  page,
  limit,
  onPageChange,
  emptyMessage,
}: EmailTableProps) {
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col gap-4">
      <Table
        columns={columns}
        rows={emails}
        keyExtractor={(e) => e.id}
        loading={loading}
        emptyMessage={emptyMessage}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
