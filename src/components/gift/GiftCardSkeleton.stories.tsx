import type { Meta, StoryObj } from "@storybook/react";
import { GiftCardSkeleton } from "./GiftCardSkeleton";

const meta: Meta<typeof GiftCardSkeleton> = {
  component: GiftCardSkeleton,
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

type Story = StoryObj<typeof GiftCardSkeleton>;

export const Single: Story = {
  args: { count: 1 },
};

export const List: Story = {
  args: { count: 3 },
};
