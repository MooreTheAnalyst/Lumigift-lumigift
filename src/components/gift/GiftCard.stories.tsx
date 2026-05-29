import type { Meta, StoryObj } from "@storybook/react";
import { GiftCard } from "./GiftCard";
import type { Gift } from "@/types";

const meta: Meta<typeof GiftCard> = {
  component: GiftCard,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 400 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof GiftCard>;

const BASE_GIFT: Gift = {
  id: "gift-1",
  senderId: "user-1",
  recipientPhoneHash: "abc123",
  recipientName: "Bob Eze",
  amountNgn: 10000,
  amountUsdc: "6.0000000",
  status: "locked",
  unlockAt: new Date("2026-12-25T10:00:00Z"),
  createdAt: new Date("2026-05-01"),
  updatedAt: new Date("2026-05-01"),
};

export const SenderLocked: Story = {
  args: { gift: BASE_GIFT, perspective: "sender" },
};

export const SenderFunded: Story = {
  args: { gift: { ...BASE_GIFT, status: "funded" }, perspective: "sender" },
};

export const RecipientLocked: Story = {
  args: { gift: BASE_GIFT, perspective: "recipient" },
};

export const RecipientUnlocked: Story = {
  args: {
    gift: {
      ...BASE_GIFT,
      status: "unlocked",
      message: "Happy birthday! 🎉",
      unlockAt: new Date("2026-01-01"),
    },
    perspective: "recipient",
    recipientStellarKey: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  },
};

export const Claimed: Story = {
  args: {
    gift: {
      ...BASE_GIFT,
      status: "claimed",
      claimTxHash: "abc123def456abc123def456abc123def456abc123def456abc123def456ab12",
    },
    perspective: "sender",
  },
};
