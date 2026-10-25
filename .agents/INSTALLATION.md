# UI/UX Pro Max

- Upstream: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Installed using the official npm package `ui-ux-pro-max-cli@2.15.0`.
- Project-local Codex installation: `.agents/skills/ui-ux-pro-max/SKILL.md`.
- The installer also bundles the sibling skills `banner-design`, `brand`, `design`, `design-system`, `slides`, and `ui-styling`.
- Installation command: `npm exec --yes --package=ui-ux-pro-max-cli@2.15.0 -- uipro init --ai codex --offline`.
- Python 3 is needed for the local search scripts; no Python packages are required.

Restart the Codex session after pulling these files so that project-local skills can be discovered. Installation alone does not change application UI or dependencies.

Smoke check, from the repository root:

```bash
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "university student portal" --domain product --max-results 2
```

On Windows use `python` if `python3` is unavailable. Read the skill instructions before using its recommendations. Product search output is guidance to evaluate, not an approved design for this application.

## Additional reviewed design skills

- `frontend-design`: anthropics/skills, dbd4588f9e1033efb41dad4bef2f7947c8993d44, Apache-2.0 (included license).
- `web-design-guidelines`, `vercel-react-best-practices`: vercel-labs/agent-skills, 063bee94c3f4df8453406c830b0a7df0f2860278; source metadata retained.
- `fixing-motion-performance`: ibelick/ui-skills, 59193a75432e5f41c6980f53b9e6a7bd56919947, MIT (included license).

Selection and usage: docs/DESIGN.md. No deployment skills or credential bindings were activated.
