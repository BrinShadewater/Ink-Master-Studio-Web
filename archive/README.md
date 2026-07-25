# Archived components

These files are superseded by the canvas-first editor in
`components/editor/EditorApp.tsx`. They are kept for reference only.

- `WorkflowInspector.tsx` - the former Advanced mode production panel.
- `SimpleCreatorFlow.tsx` - the former Simple mode creator flow.
- `Preview.tsx` - the former preview, mockup, comparison, and export surface.
- `Controls.tsx` - the former production settings control panel.

## Status

Not built, not type-checked, not imported by anything. This directory is listed
in `tsconfig.json`'s `exclude`, and no source file imports from it. Verified
absent from the production bundle on 2026-07-25: five distinct UI strings from
these files return zero matches in `dist/`.

## If you want to revive one

Expect it to need repair. Because these files are outside the type-check, later
changes to `types.ts` or `services/` can break them silently, and nothing will
report it. Their relative import paths are also stale after the move and were
deliberately left unrepaired, so that nothing reads as live.

Recover the last working version from history instead of trusting the copy here:

```shell
git log --follow -- archive/WorkflowInspector.tsx
```
