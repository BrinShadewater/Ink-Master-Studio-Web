# Contributing

## Local Setup

```shell
npm ci
npm run dev
```

Use `npm ci`, not `npm install`. npm prunes optional dependencies to the host
platform when it writes a lockfile, so running `npm install` on Windows rewrites
`package-lock.json` into a form that fails `npm ci` on the Linux CI runner.
`npm ci` installs from the lockfile without rewriting it and works on every
platform. Only run `npm install` when you are deliberately changing a
dependency, and check the resulting lockfile diff before committing it.

Before opening a pull request:

```shell
npm run build
```

## Pull Requests

- Keep changes focused on one workflow or surface.
- Include before/after screenshots for UI changes.
- Mention any export, mockup, file-upload, or Gemini-service behavior changes.
- Do not add secrets or real client artwork to the repository.

## Security

Read `SECURITY.md` before touching API-key handling, uploads, image processing, or deployment configuration.
