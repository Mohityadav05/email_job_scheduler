"use client";

import { useState, useRef, ChangeEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/Toast";

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

function parseEmails(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(matches)]; // deduplicate
}

export function ComposeModal({ open, onClose, onScheduled }: ComposeModalProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [leadsText, setLeadsText] = useState("");
  const [parsedCount, setParsedCount] = useState(0);
  const [startTime, setStartTime] = useState("");
  const [delayBetweenMs, setDelayBetweenMs] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleLeadsChange(text: string) {
    setLeadsText(text);
    setParsedCount(parseEmails(text).length);
  }

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    handleLeadsChange(text);
  }

  async function handleSubmit() {
    const leads = parseEmails(leadsText);
    if (!subject || !body || leads.length === 0 || !startTime) {
      toast("Fill in all fields and provide at least one valid email.", "error");
      return;
    }

    setLoading(true);
    try {
      const result = await api.scheduleEmails({
        subject,
        body,
        leads,
        startTime: new Date(startTime).toISOString(),
        delayBetweenMs,
        hourlyLimit,
      });
      toast(`Scheduled ${result.scheduled} emails.`, "success");
      onScheduled();
      onClose();
      // reset
      setSubject(""); setBody(""); setLeadsText(""); setParsedCount(0); setStartTime("");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Compose New Email" className="max-w-2xl">
      <div className="flex flex-col gap-4">
        <Input
          label="Subject"
          id="subject"
          placeholder="Your email subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Body (HTML)</label>
          <textarea
            rows={5}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="<p>Hello {name}, ...</p>"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            Recipients
            <span className="ml-2 text-xs text-gray-400 font-normal">
              Paste emails or upload CSV
            </span>
          </label>
          <textarea
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="alice@example.com, bob@example.com"
            value={leadsText}
            onChange={(e) => handleLeadsChange(e.target.value)}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-500">
              {parsedCount > 0 ? (
                <span className="text-indigo-600 font-medium">{parsedCount} valid email{parsedCount !== 1 ? "s" : ""} detected</span>
              ) : (
                "No emails detected yet"
              )}
            </span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Upload CSV
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
        </div>

        <Input
          label="Start Time"
          id="startTime"
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Delay between emails (ms)"
            id="delay"
            type="number"
            min={0}
            step={500}
            value={delayBetweenMs}
            onChange={(e) => setDelayBetweenMs(Number(e.target.value))}
          />
          <Input
            label="Hourly limit per sender"
            id="hourly"
            type="number"
            min={1}
            value={hourlyLimit}
            onChange={(e) => setHourlyLimit(Number(e.target.value))}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={loading}>
            Schedule {parsedCount > 0 ? `${parsedCount} emails` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
