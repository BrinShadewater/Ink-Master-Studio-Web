# Agent-driven development docs

Everything an agent authors or hands off lives here. `docs/` above this folder
holds human-facing project docs (`PROJECT-BRIEF.md`, `MAINTENANCE.md`).

| Path | Contents |
|---|---|
| `specs/` | Design specs. Written before a plan; describe what and why. |
| `plans/` | Task-by-task implementation plans derived from a spec. |
| `CODEX_HANDOFF.md` | Running handoff note on current product direction. |

Naming for specs and plans is `YYYY-MM-DD-<slug>.md`, and a plan usually shares
its date and slug with the spec it came from.

## Where the run reports are

Execution reports (task reports, phase acceptance reports, `progress.md`) are
**not** here. They live in `.superpowers/sdd/` at the repository root, because
that path is written by the subagent-driven-development tooling rather than by
hand, and the plans in `plans/` reference it directly.

Moving them under `docs/` would break those references and the tooling would
recreate the root directory on its next run, so `.superpowers/` is left alone
the same way `.github/` is.
