import type { Preview } from "@storybook/react";
import "../src/styles/tokens.css";
import "../src/styles/globals.css";
import "../src/styles/components.css";

const preview: Preview = {
  parameters: {
    chromatic: {
      viewports: [375, 1280],
    },
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#0d0d14" },
        { name: "light", value: "#f5f5fa" },
      ],
    },
  },
};

export default preview;
