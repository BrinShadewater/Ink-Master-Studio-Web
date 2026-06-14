# Maintenance

## Routine Checks

```shell
npm run build
```

Also test the upload/preview/export path manually with safe sample files.

## Security Review

Before deployment or API changes, review `SECURITY.md`. The safest production direction is to move Gemini requests behind a backend proxy or serverless function so secrets stay server-side.

## Asset Handling

Mockup assets live in `public/mockups/`. Keep filenames stable and descriptive. When adding a garment color, test preview alignment and export output.

## Workflow QA

Check these after UI or processing changes:

- Upload validation
- Preset selection
- Preview scaling and placement
- Batch processing
- PDF export
- ZIP export
- Export history

## Deployment Notes

The repo includes Docker and nginx configuration. Confirm the intended hosting path and environment-variable model before changing deployment files.
