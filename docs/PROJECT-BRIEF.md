# Project Brief

## Purpose

InkMaster Studio Web is a browser-based, local-first tool for creators preparing artwork for print-on-demand products. The default workflow is: Drop an image, pick a product, review plain-language checks, and download a print-ready PNG for Printify.

Advanced production tools remain available behind Advanced mode, but they are not the primary product surface.

## Audience

- Streamers, artists, and creators preparing artwork for Printify
- POD sellers who need a compliant upload file quickly
- Maintainers improving upload, preview, export, local storage, and optional AI cleanup
- Advanced users who still need print-shop proof, batch, and package workflows

## Product Principles

- Time from drop to download is the deciding metric.
- The default UI should avoid production jargon.
- Auto-fix what can be fixed and explain the result in one plain sentence.
- Full-resolution work belongs in workers and should not block the browser.
- Artwork stays local unless the user explicitly downloads, imports, exports, or uses server-side AI cleanup.
- Advanced mode can expose shop concepts, but default mode should not.

## Core Default Workflow

- Drop artwork
- Pick a Printify product preset
- Build a bounded preview
- Check size, DPI, RGB output, transparency, file-size cap, and upscaling quality
- Download a print-ready PNG with the selected product dimensions and DPI metadata

## Advanced Workflows

- Reopen, duplicate, archive, export, and import saved designs
- Create customer proofs and track local approval state
- Export production packages with manifests, summaries, selected mockups, and optional underbase
- Batch process multiple designs with per-file blockers and warning acknowledgements
- Manage local production profiles and portable shop templates

## Deferred Work

- Printful and Gelato preset files
- AI enhancement beyond local progressive upscaling
- Cloud synchronization, online comments, and shareable approval links
- Screen-print separations
- Printer, RIP, ICC, and provider API synchronization

## High-Risk Areas

- Main-thread image processing
- Incorrect product dimensions or DPI metadata
- SVG/script handling
- Oversized uploaded files and generated exports
- Client-side API-key exposure
- Misleading AI or upscale quality claims
- Advanced proof/package state implying online approval infrastructure that does not exist
