import { notFound } from "next/navigation";
import { GiftCard } from "@/components/gift/GiftCard";
import type { Gift, OccasionCategory } from "@/types";

interface Props {
  params: { id: string };
  searchParams: { stellarKey?: string };
}

async function fetchGift(id: string): Promise<Gift | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/v1/gifts/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.success ? (json.data as Gift) : null;
}

const OCCASION_THEMES: Record<OccasionCategory, { emoji: string; accent: string; bg: string }> = {
  general:     { emoji: "🎁", accent: "#6c3bff", bg: "rgba(108,59,255,0.08)" },
  birthday:    { emoji: "🎂", accent: "#f59e0b", bg: "rgba(245,158,11,0.08)" },
  valentine:   { emoji: "❤️", accent: "#ef4444", bg: "rgba(239,68,68,0.08)" },
  anniversary: { emoji: "💍", accent: "#ec4899", bg: "rgba(236,72,153,0.08)" },
  graduation:  { emoji: "🎓", accent: "#10b981", bg: "rgba(16,185,129,0.08)" },
  christmas:   { emoji: "🎄", accent: "#22c55e", bg: "rgba(34,197,94,0.08)" },
};

export default async function GiftClaimPage({ params, searchParams }: Props) {
  const gift = await fetchGift(params.id);
  if (!gift) notFound();

  const occasion = (gift.occasion ?? "general") as OccasionCategory;
  const theme = OCCASION_THEMES[occasion];

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "4rem auto",
        padding: "0 1rem",
      }}
    >
      <div
        style={{
          textAlign: "center",
          fontSize: "3rem",
          marginBottom: "1rem",
          lineHeight: 1,
        }}
        aria-hidden="true"
      >
        {theme.emoji}
      </div>
      <div
        style={{
          background: theme.bg,
          borderRadius: "1rem",
          border: `1px solid ${theme.accent}33`,
          padding: "0.25rem",
        }}
      >
        <GiftCard
          gift={gift}
          perspective="recipient"
          recipientStellarKey={searchParams.stellarKey}
        />
      </div>
    </main>
  );
}
