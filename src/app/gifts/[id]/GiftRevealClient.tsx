"use client";

import { useEffect, useState, useCallback } from "react";
import { ClaimButton } from "@/components/gift/ClaimButton";
import type { Gift, GiftStatus } from "@/types";
import styles from "./page.module.css";

interface CountdownValues {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getCountdown(unlockAt: Date): CountdownValues {
  const diff = Math.max(0, unlockAt.getTime() - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

interface GiftRevealClientProps {
  gift: Gift;
  stellarKey?: string;
}

export function GiftRevealClient({ gift, stellarKey }: GiftRevealClientProps) {
  const unlockAt = new Date(gift.unlockAt);
  const [countdown, setCountdown] = useState<CountdownValues>(getCountdown(unlockAt));
  const [revealed, setRevealed] = useState(() => Date.now() >= unlockAt.getTime());
  const [status, setStatus] = useState<GiftStatus>(gift.status);

  const tick = useCallback(() => {
    const now = Date.now();
    if (now >= unlockAt.getTime()) {
      setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      setRevealed(true);
    } else {
      setCountdown(getCountdown(unlockAt));
    }
  }, [unlockAt]);

  useEffect(() => {
    if (revealed) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [revealed, tick]);

  const isLocked = !revealed;
  const isClaimed = status === "claimed";

  return (
    <div className={styles.container}>
      <div className={styles.card} aria-live="polite">
        {/* Lock icon */}
        <div className={styles.iconWrapper} aria-hidden="true">
          {isLocked ? (
            <span className={styles.lockIcon}>🔒</span>
          ) : (
            <span className={styles.unlockIcon}>🎁</span>
          )}
        </div>

        <h1 className={styles.heading}>
          {isLocked ? "A gift is waiting for you" : `A gift for ${gift.recipientName}!`}
        </h1>

        {isLocked ? (
          <>
            <p className={styles.subtext}>This gift unlocks in:</p>
            <div className={styles.countdown} role="timer" aria-label="Time until gift unlocks">
              <div className={styles.unit}>
                <span className={styles.value}>{pad(countdown.days)}</span>
                <span className={styles.label}>days</span>
              </div>
              <span className={styles.separator}>:</span>
              <div className={styles.unit}>
                <span className={styles.value}>{pad(countdown.hours)}</span>
                <span className={styles.label}>hrs</span>
              </div>
              <span className={styles.separator}>:</span>
              <div className={styles.unit}>
                <span className={styles.value}>{pad(countdown.minutes)}</span>
                <span className={styles.label}>min</span>
              </div>
              <span className={styles.separator}>:</span>
              <div className={styles.unit}>
                <span className={styles.value}>{pad(countdown.seconds)}</span>
                <span className={styles.label}>sec</span>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.revealContent}>
            {gift.message && (
              <blockquote className={styles.message}>{gift.message}</blockquote>
            )}
            <p className={styles.amount}>
              ₦{gift.amountNgn.toLocaleString("en-NG")}
            </p>
            {isClaimed ? (
              <p className={styles.claimedBadge}>✅ Gift claimed!</p>
            ) : stellarKey ? (
              <ClaimButton
                giftId={gift.id}
                recipientStellarKey={stellarKey}
                onStatusChange={setStatus}
              />
            ) : (
              <p className={styles.noKey}>
                Add your Stellar wallet address to the URL to claim this gift.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
