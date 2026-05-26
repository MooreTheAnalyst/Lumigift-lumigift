// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "npm",
  reporters: ["html", "clear-text", "progress", "dashboard"],
  testRunner: "jest",
  jest: {
    projectType: "custom",
    configFile: "jest.config.js",
    enableFindRelatedTests: true,
  },
  coverageAnalysis: "perTest",
  mutate: [
    "src/**/*.ts",
    "src/**/*.tsx",
    "!src/**/*.test.ts",
    "!src/**/*.test.tsx",
    "!src/**/*.d.ts",
    "!src/styles/**",
    "!src/app/layout.tsx",
    "!src/app/providers.tsx",
  ],
  thresholds: {
    high: 80,
    low: 70,
    break: 70,
  },
  dashboard: {
    project: "github.com/JosephOnuh/Lumigift-lumigift",
    version: "main",
  },
  timeoutMS: 60000,
  concurrency: 2,
};

module.exports = config;
