const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type EmailStatus = "scheduled" | "sending" | "sent" | "failed";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  slackUserId?: string;
}

export interface Email {
  id: string;
  recipient: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt?: string;
  errorMsg?: string;
  senderId: string;
}

export interface EmailsResponse {
  emails: Email[];
  total: number;
  page: number;
  limit: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  getMe: () => apiFetch<User>("/auth/me"),

  logout: () =>
    apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  getEmails: (params: { status?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    return apiFetch<EmailsResponse>(`/api/emails?${qs.toString()}`);
  },

  scheduleEmails: (payload: {
    subject: string;
    body: string;
    leads: string[];
    startTime: string;
    delayBetweenMs: number;
    hourlyLimit: number;
  }) =>
    apiFetch<{ scheduled: number }>("/api/emails/schedule", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  searchEmails: (q: string) =>
    apiFetch<{ results: Email[] }>(`/api/emails/search?q=${encodeURIComponent(q)}`),
};
