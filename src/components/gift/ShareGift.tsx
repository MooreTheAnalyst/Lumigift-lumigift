"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import styles from "./ShareGift.module.css";

interface ShareGiftProps {
  giftId: string;
  recipientName: string;
}

function buildClaimUrl(giftId: string): string {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/gifts/${giftId}`;
}

function buildShareText(recipientName: string, claimUrl: string): string {
  return `🎁 You have a surprise gift waiting, ${recipientName}! Claim it here: ${claimUrl}`;
}

export function ShareGift({ giftId, recipientName }: ShareGiftProps) {
  const [copied, setCopied] = useState(false);

  const claimUrl = buildClaimUrl(giftId);
  const text = buildShareText(recipientName, claimUrl);

  const handleShare = async () => {
    // Web Share API — primary on supported browsers
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Lumigift", text, url: claimUrl });
        return;
      } catch {
        // user cancelled or API unavailable — fall through
      }
    }
    // Fallback: copy to clipboard
    await navigator.clipboard.writeText(claimUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const smsUrl = `sms:?body=${encodeURIComponent(text)}`;

  return (
    <div className={styles.container}>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleShare}
        aria-label="Share gift link"
      >
        {copied ? "✓ Copied!" : "Share"}
      </Button>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
        aria-label="Share on WhatsApp"
      >
        WhatsApp
      </a>

      <a
        href={smsUrl}
        className={styles.link}
        aria-label="Share via SMS"
      >
        SMS
      </a>
    </div>
  );
}
