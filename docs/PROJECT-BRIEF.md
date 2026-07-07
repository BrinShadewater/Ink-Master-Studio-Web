# Project Brief

## Purpose

Ink Master Studio Web is a browser-based, local-first DTG/DTF production assistant. It is meant to reduce the friction between source artwork, production preflight, measured placement, proof approval, and exportable handoff material.

## Audience

- Print-shop operators preparing proofs
- Designers checking artwork across garment colors
- Maintainers improving upload, preview, export, and AI-assisted workflows

## Product Principles

- Production speed matters.
- Controls should map to real workflow decisions.
- Output should be easy to package, back up, and send through the shop's existing customer channels.
- Security and cost controls matter because the app touches uploads and AI services.
- The UI should feel like a workbench, not a novelty demo.

## Core Workflows

- Upload artwork
- Create or reopen a named local production job
- Choose a recipe and run deterministic preflight
- Set print dimensions and measured placement
- Build print-ready and email-friendly customer proofs
- Record local proof approval state
- Export production packages with manifests, summaries, selected mockups, and optional underbase
- Batch process multiple designs with per-file blockers and warning acknowledgements
- Save portable shop templates for repeat production setups

## Deferred Work

- Cloud synchronization, online comments, and shareable approval links need account, storage, permission, moderation, and audit controls before they belong in the product.
- Expanded AI cleanup should stay server-side and requires rate limits, quotas, billing alerts, and clear failure handling.
- Screen-print separations should be designed as a separate future production mode, not folded into DTG/DTF controls.

## High-Risk Areas

- Client-side API-key exposure
- Malicious or oversized uploaded files
- SVG/script handling
- Export accuracy
- Mockup asset naming and alignment
- Unexpected AI API costs
- Cloud approval state implying online sharing before cloud infrastructure exists
