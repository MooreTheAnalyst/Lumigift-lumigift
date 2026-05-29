import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  component: Input,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { label: "Phone number", placeholder: "+234 800 000 0000" },
};

export const WithHint: Story = {
  args: {
    label: "Amount",
    placeholder: "5000",
    hint: "Minimum ₦1,000",
    type: "number",
  },
};

export const WithError: Story = {
  args: {
    label: "Phone number",
    placeholder: "+234 800 000 0000",
    error: "Enter a valid Nigerian phone number",
    value: "not-a-phone",
    readOnly: true,
  },
};
