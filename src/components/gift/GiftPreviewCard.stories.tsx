import type { Meta, StoryObj } from "@storybook/react";
import { GiftPreviewCard } from "./GiftPreviewCard";

const meta: Meta<typeof GiftPreviewCard> = {
  component: GiftPreviewCard,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof GiftPreviewCard>;

export const Complete: Story = {
  args: {
    data: {
      recipientName: "Carol Nwosu",
      recipientPhone: "+2348033333333",
      amountNgn: 5000,
      unlockAt: "2026-12-25T10:00:00Z",
      message: "Merry Christmas! 🎄",
    },
    template: { emoji: "🎄", occasion: "Christmas", id: "christmas", message: "" },
    onEdit: () => {},
  },
};

export const Minimal: Story = {
  args: {
    data: {},
    onEdit: () => {},
  },
};
