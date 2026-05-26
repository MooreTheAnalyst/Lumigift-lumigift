import { notFound } from "next/navigation";
import { GiftCard } from "@/components/gift/GiftCard";
import type { Gift } from "@/types";

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

export default async function GiftClaimPage({ params, searchParams }: Props) {
  const gift = await fetchGift(params.id);
  if (!gift) notFound();

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", padding: "0 1rem" }}>
      <GiftCard
        gift={gift}
        perspective="recipient"
        recipientStellarKey={searchParams.stellarKey}
      />
    </main>
  );
}
