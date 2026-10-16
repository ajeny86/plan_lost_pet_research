# Persona Builder release requirements

The project owner requires every interface and behaviour change to be applied,
tested and published to both the main Site and the public classroom demo.

- Keep the shared interface in `public/`. Generate the classroom build with
  `node scripts/build-public-demo.mjs`; do not maintain a separate UI fork.
- Publish GitHub Pages and the existing Sites project for each release.
- Keep the two versions analogous in layout, navigation and core interactions.
  Their intentional differences are the demo's synthetic examples and local
  visitor storage versus the main Site's protected shared cloud database.
- Live AI is enabled in both versions through the existing secure backend.
  Do not add application-level AI request quotas without a new user request.
- Never copy private research into the public demo.
- Verify the main Site and the demo separately. Report partial publication
  explicitly; a GitHub deployment alone is not completion of a shared UI change.
- Preserve existing working research, source excerpts and version history.
