---
name: InkMaster Studio
description: A nocturnal print lab for precise, creator-friendly production work.
colors:
  canvas-night: "#0b121a"
  page-night: "#0d1d24"
  panel-night: "#151a22"
  raised-night: "#1d2430"
  board-blue: "#263746"
  structural-border: "#3b4554"
  primary-teal: "#315f6c"
  primary-teal-hover: "#3d7781"
  active-emerald: "#159f9f"
  active-emerald-hover: "#39bebd"
  text-primary: "#f2f4f7"
  text-secondary: "#a5aebb"
  text-muted: "#7b8798"
  measurement-copy: "#93aab5"
  technical-grid: "#2a3d4d"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 900
    lineHeight: 0.96
    letterSpacing: "normal"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 900
    lineHeight: 1
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.12em"
  micro:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: 1
  fine-print:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.5625rem"
    fontWeight: 600
    lineHeight: 1
rounded:
  none: "0px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  base: "16px"
  lg: "24px"
  xl: "32px"
components:
  landing-button:
    backgroundColor: "{colors.primary-teal}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
    height: "44px"
  landing-button-hover:
    backgroundColor: "{colors.primary-teal-hover}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
  editor-tool-selected:
    backgroundColor: "{colors.active-emerald}"
    textColor: "{colors.panel-night}"
    rounded: "{rounded.md}"
    size: "44px"
  editor-field:
    backgroundColor: "{colors.raised-night}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "8px"
    height: "36px"
  editor-panel:
    backgroundColor: "{colors.raised-night}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
    padding: "16px"
---

# Design System: InkMaster Studio

## Overview

**Creative North Star: "The Midnight Print Lab"**

InkMaster Studio feels like a focused production bench after dark: cool, precise, and built around the artwork rather than decorative interface chrome. Deep navy and charcoal surfaces establish a controlled working field, while cyan-teal signals bring selected tools, trusted actions, and print-readiness into focus.

The landing page expresses this world at poster scale through oversized uppercase type, a technical grid, and a garment stage. The editor compresses the same identity into a dense operating environment with compact controls, disciplined panels, and clear state changes. Refinements should preserve this relationship rather than introducing a new visual language.

**Key Characteristics:**

- Nocturnal navy and charcoal surface hierarchy
- Cyan-teal signals used with restraint and purpose
- Technical grid, measurement, and production-bench cues
- Bold uppercase marketing type paired with compact sentence-case controls
- Square presentation surfaces with gently rounded operational controls

## Colors

The palette combines ink-dark working surfaces with cool teal signals and soft gray-white text.

### Primary

- **Pressroom Teal** (`#315f6c`): Primary landing-page actions and the bridge between the marketing surface and the editor.
- **Pressroom Teal Hover** (`#3d7781`): Hover feedback for primary landing actions.
- **Calibration Emerald** (`#159f9f`): Selected tools, active modes, and decisive editor actions.
- **Calibration Emerald Hover** (`#39bebd`): Hover and higher-energy interaction feedback in the editor.

### Neutral

- **Canvas Night** (`#0b121a`): The deepest landing-page field and route-loading background.
- **Page Night** (`#0d1d24`): Global browser background and outer frame.
- **Panel Night** (`#151a22`): The editor shell and deepest operational surface.
- **Raised Night** (`#1d2430`): Toolbars, inspectors, fields, and raised controls.
- **Blueprint Board** (`#263746`): The garment presentation stage and technical preview surfaces.
- **Structural Border** (`#3b4554`): Panel divisions, field outlines, and quiet control boundaries.
- **Print White** (`#f2f4f7`): Primary text and high-priority labels.
- **Cool Copy** (`#a5aebb`): Supporting text and inactive controls.
- **Muted Measure** (`#7b8798`): Metadata, measurements, and de-emphasized guidance.
- **Blueprint Measure** (`#93aab5`): Small measurement text placed directly on Blueprint Board.
- **Technical Grid** (`#2a3d4d`): Low-contrast grid lines behind landing content and production stages.

### Named Rules

**The Cool Signal Rule.** Teal and emerald identify action, selection, focus, or readiness. They do not become decorative surface fills.

**The Night Field Rule.** Product and interface chrome stay dark so uploaded artwork remains the brightest and most variable object in the experience.

## Typography

**Display Font:** Inter with system sans-serif fallbacks

**Body Font:** Inter with system sans-serif fallbacks

**Character:** One pragmatic sans-serif family shifts between poster-like authority and compact tool clarity. Weight, case, spacing, and scale create the hierarchy.

### Hierarchy

The interface uses a documented `10px` micro label for compact mobile tool names and a narrowly scoped `9px` fine-print label for dense editor metadata. Operational measurement labels on the landing garment stage use the regular `12px` label step.

- **Display** (900, `3rem`, `0.96`): Uppercase landing-page statements. It steps to `3.75rem` at medium screens and `4.5rem` at extra-large screens.
- **Headline** (900, `1.875rem`, `1`): Compact uppercase section statements and marketing support.
- **Title** (600, `0.875rem`, `1.25`): Inspector headings, project names, and component titles.
- **Body** (400, `1rem`, `1.75`): Explanations and marketing copy, generally kept within a narrow reading measure.
- **Label** (700, `0.75rem`, `0.12em`): Uppercase technical labels, badges, and product metadata.

### Named Rules

**The Tool Voice Rule.** Marketing speaks in bold uppercase blocks; controls and guidance use compact sentence case. Do not make the editor shout.

## Layout

The landing page uses a centered `1440px` maximum canvas with a two-column hero at large widths. Copy occupies a controlled left measure while the garment stage takes visual priority on the right. Below the hero, a shallow feature rail uses clear vertical divisions rather than detached cards.

The editor is a viewport-locked workbench. Desktop uses a `56px` top bar, a `60px` vertical toolbar, a fluid canvas, and a `304px` inspector. Mobile becomes a `112px` two-row top bar followed by a flexible canvas, a `240px` inspector region, and a `64px` horizontal tool rail. The established breakpoints are `640px`, `768px`, `1024px`, and `1280px`.

Spacing follows a compact `4px` base rhythm. Operational controls cluster at `4px` to `12px`; panel padding is generally `16px`; marketing sections expand to `24px` and `32px`.

## Elevation & Depth

Depth is structural and layered. Borders and tonal shifts establish most hierarchy; shadows are reserved for the garment stage, overlays, drawers, dialogs, and a small number of lifted preview elements.

### Shadow Vocabulary

- **Header Separation** (`0 8px 24px rgba(0,0,0,0.28)`): Separates the landing header from the hero.
- **Garment Stage** (`0 28px 80px rgba(0,0,0,0.7)`): Gives the principal product preview physical presence.
- **Artwork Lift** (`0 8px 18px rgba(0,0,0,0.3)`): Lifts the printed artwork within the garment mockup.
- **Feature Rail Separation** (`0 -10px 28px rgba(0,0,0,0.2)`): Separates the lower proof rail from the hero.
- **Editor Hairline** (`0 1px 0 rgba(255,255,255,0.03)`): Provides almost-flat separation in the workbench.

### Named Rules

**The Structural Depth Rule.** Use tone and one-pixel borders first. Add a strong shadow only when a surface physically overlays, slides over, or stages another object.

## Shapes

The form language changes by context without losing discipline. Marketing calls to action, the garment stage, preview labels, and major rails are square-edged. Editor controls use compact corners from `4px` to `8px` to improve recognition and touch comfort. Circular geometry is reserved for color swatches, handles, and state indicators.

**The Contextual Corner Rule.** Presentation surfaces stay architectural and square; operational controls may curve gently. Avoid large soft cards and pill-shaped containers.

## Components

### Buttons

- **Shape:** Landing actions are square (`0px`); editor tools and fields use compact corners (`6px`).
- **Primary:** Pressroom Teal with Print White text on marketing surfaces; Calibration Emerald with Panel Night text for selected editor actions.
- **Hover / Focus:** Hover brightens within the same cool family. Keyboard focus uses a visible two-pixel cyan or emerald ring.
- **Ghost:** Editor icon buttons remain transparent with Cool Copy text, then gain a Raised Night background and brighter text on hover.

### Chips

- **Style:** Technical badges use square corners, a thin blue-gray border, restrained dark fill, uppercase labels, and increased tracking.
- **State:** Garment color choices use circular swatches with a cyan border and ring when selected.

### Cards / Containers

- **Corner Style:** Major landing surfaces are square. Small editor items may use `4px` to `8px` corners.
- **Background:** Layered navy and charcoal tones, with Blueprint Board reserved for garment and preview stages.
- **Shadow Strategy:** Flat by default, using the Structural Depth Rule.
- **Border:** One-pixel cool gray or blue-gray divisions.
- **Internal Padding:** Compact `12px` to `16px` for editor panels, expanding to `24px` or more only in marketing composition.

### Inputs / Fields

- **Style:** Raised Night fill, Structural Border outline, compact `6px` corners, and Print White text.
- **Focus:** Two-pixel emerald ring or a brighter border without layout shift.
- **Error / Disabled:** Errors use warm red text or borders against the existing dark field. Disabled controls reduce opacity while preserving their silhouette.

### Navigation

The landing header uses the logo, uppercase wordmark, generous horizontal separation, and one primary action. The editor top bar is a dense command surface with compact project fields, grouped icon actions, and a segmented Basic or Advanced mode control. Active state is conveyed by both color and control state.

### Garment Stage

The signature stage uses a technical blue grid, edge measurements, a large photographic garment, and a docked product-information rail. The garment remains the hero; interface detail supports scale and production confidence.

## Do's and Don'ts

### Do:

- **Do** preserve the dark production-bench hierarchy across landing and editor surfaces.
- **Do** reserve teal and emerald for clear interaction and readiness signals.
- **Do** use thin borders, grid lines, and measurements to communicate precision.
- **Do** keep editor controls compact, direct, and keyboard-visible.
- **Do** let real artwork and garment imagery carry the visual variety.

### Don't:

- **Don't** replace the incumbent identity with glossy neon SaaS styling.
- **Don't** introduce playful craft-marketplace motifs or soft scrapbook decoration.
- **Don't** flatten the system into sterile monochrome minimalism.
- **Don't** turn every panel into a rounded floating card.
- **Don't** use accent color as broad decoration or compete with the artwork.
