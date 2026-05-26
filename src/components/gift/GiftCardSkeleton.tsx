import { clsx } from "clsx";
import styles from "./GiftCardSkeleton.module.css";

interface GiftCardSkeletonProps {
  count?: number;
}

function SingleSkeleton() {
  return (
    <div
      className={styles.card}
      aria-hidden="true"
      data-testid="gift-card-skeleton"
    >
      <div className={styles.header}>
        <div className={clsx(styles.bone, styles.headerName)} />
        <div className={clsx(styles.bone, styles.headerBadge)} />
      </div>
      <div className={clsx(styles.bone, styles.amount)} />
      <div className={clsx(styles.bone, styles.meta)} />
      <div className={clsx(styles.bone, styles.message)} />
    </div>
  );
}

export function GiftCardSkeleton({ count = 3 }: GiftCardSkeletonProps) {
  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        Loading your gifts…
      </span>
      {Array.from({ length: count }, (_, i) => (
        <SingleSkeleton key={i} />
      ))}
    </>
  );
}
