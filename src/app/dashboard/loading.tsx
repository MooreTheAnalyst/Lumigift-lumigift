import { GiftCardSkeleton } from "@/components/gift/GiftCardSkeleton";
import styles from "./page.module.css";

export default function DashboardLoading() {
  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.title}>Your Gifts</h1>
        <div className={styles.grid}>
          <GiftCardSkeleton count={6} />
        </div>
      </div>
    </div>
  );
}
