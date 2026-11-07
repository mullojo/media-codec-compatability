# Contributing

Keep Browser Media Lab usable as a static GitHub Pages site with no build step, tracking or server-side processing.

For a bug report, include your browser/version, operating system, selected profile, steps to reproduce and expected behavior. Attach a JSON report or full-page PNG when useful; review identifying environment details before posting. Capability differences between browsers are expected and are not necessarily bugs.

For code changes:

1. Serve the project locally as described in the README.
2. Keep `false` (reported unsupported) distinct from `null` (unknown/error).
3. Include exact test parameters and MIME types in reports. Do not label support queries as benchmarks or actual media tests.
4. Run the browser integration checks for behavioral changes and manually check a narrow mobile viewport.
5. Preserve dependency licenses and update the third-party notices when changing vendored code.

Do not commit generated personal reports, screenshots containing private details, secrets, `node_modules`, or OS metadata. Add a deliberately reviewed README image under `docs/` separately.
