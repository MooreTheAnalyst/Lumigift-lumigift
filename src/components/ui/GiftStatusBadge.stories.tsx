import type { Meta, StoryObj } from "@storybook/react";
import { GiftStatusBadge } from "./GiftStatusBadge";
import type { GiftStatus } from "@/types";

const meta: Meta<typeof GiftStatusBadge> = {
  component: GiftStatusBadge,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof GiftStatusBadge>;

const ALL_STATUSES: GiftStatus[] = [
  "draft",
  "pending_payment",
  "funded",
  "locked",
  "unlocked",
  "claimed",
  "expired",
  "cancelled",
];

export const AllStatuses: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      {ALL_STATUSES.map((status) => (
        <GiftStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
