"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { EmailTable } from "@/components/EmailTable";
import { ComposeModal } from "@/components/ComposeModal";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { api, User, Email } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TABS = ["Scheduled Emails", "Sent Emails"];
const LIMIT = 20;

function DashboardContent() {
  const router = useRouter();
  const params = useSearchParams();

  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [composeOpen, setComposeOpen] = useState(false);

  const [scheduledEmails, setScheduledEmails] = useState<Email[]>([]);
  const [scheduledTotal, setScheduledTotal] = useState(0);
  const [scheduledPage, setScheduledPage] = useState(1);
  const [loadingScheduled, setLoadingScheduled] = useState(false);

  const [sentEmails, setSentEmails] = useState<Email[]>([]);
  const [sentTotal, setSentTotal] = useState(0);
  const [sentPage, setSentPage] = useState(1);
  const [loadingSent, setLoadingSent] = useState(false);

  // Check auth on load
  useEffect(() => {
    api.getMe()
      .then(setUser)
      .catch(() => router.replace("/login"))
      .finally(() => setLoadingUser(false));
  }, [router]);

  // Handle Slack connection callback
  useEffect(() => {
    const slack = params.get("slack");
    if (slack === "connected") {
      toast("Slack connected successfully.", "success");
      // Refresh user to reflect slackUserId
      api.getMe().then(setUser).catch(() => {});
    } else if (slack === "error") {
      toast("Slack connection failed. Try again.", "error");
    }
  }, [params]);

  const fetchScheduled = useCallback(async (page: number) => {
    setLoadingScheduled(true);
    try {
      const res = await api.getEmails({ status: "scheduled", page, limit: LIMIT });
      setScheduledEmails(res.emails);
      setScheduledTotal(res.total);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoadingScheduled(false);
    }
  }, []);

  const fetchSent = useCallback(async (page: number) => {
    setLoadingSent(true);
    try {
      const res = await api.getEmails({ status: "sent", page, limit: LIMIT });
      setSentEmails(res.emails);
      setSentTotal(res.total);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoadingSent(false);
    }
  }, []);

  // Initial data load and on tab change
  useEffect(() => {
    if (!user) return;
    fetchScheduled(scheduledPage);
  }, [user, scheduledPage, fetchScheduled]);

  useEffect(() => {
    if (!user || activeTab !== "Sent Emails") return;
    fetchSent(sentPage);
  }, [user, activeTab, sentPage, fetchSent]);

  async function handleLogout() {
    await api.logout().catch(() => {});
    router.replace("/login");
  }

  function handleConnectSlack() {
    window.location.href = `${API}/auth/slack/connect`;
  }

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onLogout={handleLogout} onConnectSlack={handleConnectSlack} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Email Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your scheduled and sent campaigns.</p>
          </div>
          <Button onClick={() => setComposeOpen(true)}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Compose New Email
          </Button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

          <div className="mt-6">
            {activeTab === "Scheduled Emails" && (
              <EmailTable
                emails={scheduledEmails}
                loading={loadingScheduled}
                total={scheduledTotal}
                page={scheduledPage}
                limit={LIMIT}
                onPageChange={setScheduledPage}
                emptyMessage="No scheduled emails. Click 'Compose New Email' to get started."
              />
            )}
            {activeTab === "Sent Emails" && (
              <EmailTable
                emails={sentEmails}
                loading={loadingSent}
                total={sentTotal}
                page={sentPage}
                limit={LIMIT}
                onPageChange={setSentPage}
                emptyMessage="No sent emails yet."
              />
            )}
          </div>
        </div>
      </main>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onScheduled={() => {
          fetchScheduled(1);
          setScheduledPage(1);
        }}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
