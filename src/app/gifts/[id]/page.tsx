import { notFound } from "next/navigation";
import { GiftRevealClient } from "./GiftRevealClient";
import type { Gift } from "@/types";

interface Props {
  params: { id: string };
  searchParams: { stellarKey?: string };
}

async function fetchGift(id: string): Promise<Gift | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/v1/gifts/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.success ? (json.data as Gift) : null;
}

export default async function GiftRevealPage({ params, searchParams }: Props) {
  const gift = await fetchGift(params.id);
  if (!gift) notFound();

  return <GiftRevealClient gift={gift} stellarKey={searchParams.stellarKey} />;
}
