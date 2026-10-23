# Wrongway Arena working agreement

- Build in this repository. Prefer command-line/direct file tools; do not open
  VS Code or use screen control when a suitable alternative exists.
- User-facing UI and reports are Vietnamese. Follow the Sketch reference's
  cream paper, graphite outlines, handwritten headings, teal accents, and calm
  spacing. Do not install skills from the reference website.
- Frontend is static and GitHub Pages compatible. Backend runs locally first.
  Import and run the course Arena in `../wrongway` (or WRONGWAY_REFERENCE)
  unchanged, without editing or publishing its files. The board is 9×9; rows 0
  and 8 are the two goal rows, matching the course engine.
- Uploaded Python executes only in separate worker processes, never in the API
  process. Local execution is for trusted files; it is not an OS security sandbox.
  Bind to loopback by default, authenticate mutations, restrict origins, bound
  uploads/sessions, and clean up subprocess trees and temporary files.
- Preserve the course 1-second action and 5-second startup limits. Playback
  controls must not change the simulation's clocks or invent results.
- Test the upload-to-match flow with the real engine, errors/timeouts/cancel,
  replay import/export, both starting sides, and desktop/mobile browser layouts.
  Use headless browser tools for UI verification; do not claim unrun checks.
- Reuse a local .venv and locked npm/Python dependencies. Keep architecture small.
  Do not spawn subagents unless the user explicitly authorizes delegation.
- Inspect Git status/diff first, stage explicit relevant paths, and preserve
  unrelated changes. Use Conventional Commits: `type(scope): short imperative
  summary`, lowercase English, aim for <=72 characters, no final period.
- Commit coherent verified changes, not every edit. Do not force-push or rewrite
  published history. Publishing project commits is authorized by this task;
  public backend exposure or instructor-source publication is not implied.
- Never commit uploads, .venv, node_modules, credentials, raw replays, or caches.
