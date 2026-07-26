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
absent from the production bundle on 2026-07-25 by comparing full production
builds before and after: the JavaScript was byte-identical and the stylesheet
shrank by 15,164 bytes, with every one of the 187 removed CSS classes confirmed
unused by surviving source.

## Why it lives under `docs/`

Tailwind's `content` globs in `tailwind.config.cjs` include
`./components/**/*.{ts,tsx}` and `./services/**/*.{ts,tsx}`. Tailwind scans
those paths off disk, independently of the JavaScript import graph, so parking
these files anywhere under `components/` would put their class names back into
the shipped stylesheet even though none of their code runs. `docs/` is outside
every build glob, which is the point.

## If you want to revive one

Expect it to need repair. Because these files are outside the type-check, later
changes to `types.ts` or `services/` can break them silently, and nothing will
report it. Their relative import paths are also stale after the move and were
deliberately left unrepaired, so that nothing reads as live.

Recover the last working version from history instead of trusting the copy here:

```shell
git log --follow -- docs/archive/WorkflowInspector.tsx
```
