"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { GiftStatusBadge } from "@/components/ui/GiftStatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatNGN } from "@/lib/currency";
import { useCsrf } from "@/hooks/useCsrf";
import type { ApiResponse, Gift } from "@/types";
import type { ProfileStats } from "@/app/api/v1/profile/route";
import styles from "./page.module.css";

type ProfileData = { stats: ProfileStats; gifts: Gift[] };

async function fetchProfile(): Promise<ProfileData> {
  const res = await fetch("/api/v1/profile");
  const json: ApiResponse<ProfileData> = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { csrfFetch } = useCsrf();
  const [displayName, setDisplayName] = useState("");
  const [smsNotif, setSmsNotif] = useState(true);
  const [emailNotif, setEmailNotif] = useState(true);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const { data, status } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
    onSuccess: (d: ProfileData) => {
      setDisplayName(d.stats.displayName);
    },
  } as Parameters<typeof useQuery>[0]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await csrfFetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          notificationPreferences: { sms: smsNotif, email: emailNotif },
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
    },
    onSuccess: () => {
      setSaveFeedback("Saved!");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setTimeout(() => setSaveFeedback(null), 3000);
    },
    onError: () => setSaveFeedback("Failed to save. Please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await csrfFetch("/api/v1/profile", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to schedule deletion");
    },
    onSuccess: () => {
      window.location.href = "/auth/login";
    },
  });

  if (status === "pending") {
    return (
      <div className={styles.page}>
        <div className="container">
          <p>Loading profile…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={styles.page}>
        <div className="container">
          <p>Failed to load profile. Please try again.</p>
        </div>
      </div>
    );
  }

  const { stats, gifts } = data!;

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.title}>My Profile</h1>
        </div>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <div className={styles.stats}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{stats.totalGiftsSent}</span>
            <span className={styles.statLabel}>Gifts Sent</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{formatNGN(stats.totalValueNgn)}</span>
            <span className={styles.statLabel}>Total Value</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{stats.claimRate}%</span>
            <span className={styles.statLabel}>Claim Rate</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>
              {format(new Date(stats.memberSince), "MMM yyyy")}
            </span>
            <span className={styles.statLabel}>Member Since</span>
          </div>
        </div>

        {/* ── Edit Profile ──────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Edit Profile</h2>
          <div className={styles.form}>
            <Input
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <Input
              label="Phone"
              value={stats.phone}
              disabled
              aria-readonly="true"
            />
            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: "var(--font-medium)",
                  color: "var(--color-text-secondary)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Notification Preferences
              </legend>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={smsNotif}
                  onChange={(e) => setSmsNotif(e.target.checked)}
                />
                SMS notifications
              </label>
              <label className={styles.checkboxRow} style={{ marginTop: "var(--space-2)" }}>
                <input
                  type="checkbox"
                  checked={emailNotif}
                  onChange={(e) => setEmailNotif(e.target.checked)}
                />
                Email notifications
              </label>
            </fieldset>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
            {saveFeedback && (
              <p
                className={
                  saveFeedback.startsWith("Failed") ? styles.error : styles.feedback
                }
                role="status"
              >
                {saveFeedback}
              </p>
            )}
          </div>
        </section>

        {/* ── Gift History ──────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Gift History</h2>
          {gifts.length === 0 ? (
            <p className={styles.empty}>No gifts sent yet.</p>
          ) : (
            <ul className={styles.historyList} aria-label="Gift history">
              {gifts.map((gift) => (
                <li key={gift.id} className={styles.historyItem}>
                  <div>
                    <div className={styles.historyName}>To: {gift.recipientName}</div>
                    <div className={styles.historyMeta}>
                      {format(new Date(gift.createdAt), "MMM d, yyyy")}
                    </div>
                  </div>
                  <div className={styles.historyRight}>
                    <span className={styles.historyAmount}>{formatNGN(gift.amountNgn)}</span>
                    <GiftStatusBadge status={gift.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Danger Zone ───────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.dangerZone}>
            <h2 className={styles.dangerTitle}>Delete Account</h2>
            <p className={styles.dangerDesc}>
              Permanently delete your account and all associated data. Any pending gifts will be
              cancelled and escrowed funds refunded. This action cannot be undone.
            </p>
            {!deleteConfirm ? (
              <button
                className={styles.btnDanger}
                onClick={() => setDeleteConfirm(true)}
              >
                Delete My Account
              </button>
            ) : (
              <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
                  Are you sure?
                </span>
                <button
                  className={styles.btnDanger}
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
                </button>
                <Button variant="secondary" onClick={() => setDeleteConfirm(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
