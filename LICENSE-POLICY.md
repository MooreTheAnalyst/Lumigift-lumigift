# License Policy

Lumigift is MIT licensed. All dependencies must be compatible with commercial use and must not impose copyleft obligations on the project.

## Allowed Licenses

| License | Notes |
|---------|-------|
| MIT | Preferred |
| ISC | Preferred |
| BSD-2-Clause | Allowed |
| BSD-3-Clause | Allowed |
| Apache-2.0 | Allowed |
| CC0-1.0 | Allowed (public domain) |
| Unlicense | Allowed (public domain) |
| 0BSD | Allowed |
| BlueOak-1.0.0 | Allowed |

## Prohibited Licenses

The following licenses are **incompatible** with this project and must never be introduced as production dependencies:

| License | Reason |
|---------|--------|
| GPL-2.0 | Strong copyleft — requires source disclosure |
| GPL-3.0 | Strong copyleft — requires source disclosure |
| AGPL-3.0 | Network copyleft — requires source disclosure for SaaS |
| LGPL-2.0 | Weak copyleft — incompatible without dynamic linking |
| LGPL-2.1 | Weak copyleft — incompatible without dynamic linking |
| LGPL-3.0 | Weak copyleft — incompatible without dynamic linking |

## Enforcement

- **npm**: `npm run license:check` uses `license-checker` to scan production dependencies and fails on any prohibited license.
- **Rust**: `cargo license --deny-licenses` in the `license-check` CI job scans Cargo dependencies.
- Both checks run on every PR and on the weekly scheduled CI scan.

## Adding a New Dependency

Before adding a dependency, verify its license is in the Allowed list above. If a dependency uses a license not listed here, open a discussion before merging.

## Known Exceptions

None at this time.
