---
name: Mission Control
description: A calm operations desk for directing the work that matters.
colors:
  deep-forest: "#173d33"
  forest-action: "#245548"
  signal-lime: "#d8e99e"
  signal-lime-soft: "#edf4d3"
  warm-paper: "#f3f3ed"
  quiet-panel: "#fbfbf7"
  ink: "#18211e"
  muted-ink: "#65706b"
  hairline: "#d9dcd4"
  danger: "#8b3f36"
typography:
  display:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "38px"
    fontWeight: 610
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 680
    lineHeight: 1.35
  body:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Geist Mono, monospace"
    fontSize: "9px"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "0.12em"
rounded:
  control-sm: "7px"
  control: "8px"
  control-lg: "10px"
  callout: "12px"
  panel: "14px"
spacing:
  xs: "5px"
  sm: "8px"
  md: "11px"
  lg: "16px"
  xl: "23px"
  2xl: "30px"
components:
  button-primary:
    backgroundColor: "{colors.deep-forest}"
    textColor: "#ffffff"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "11px 14px"
  button-secondary:
    backgroundColor: "{colors.quiet-panel}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.control-lg}"
    padding: "10px 14px"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  panel:
    backgroundColor: "{colors.quiet-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "23px"
  nav-active:
    backgroundColor: "#f0f3e7"
    textColor: "{colors.deep-forest}"
    typography: "{typography.title}"
    rounded: "9px"
    padding: "10px 11px"
---

# Design System: Mission Control

## Overview

**Creative North Star: "The Quiet Operations Desk"**

Mission Control feels like a well-kept desk beside a forest window: warm paper, sober green structure, and just enough signal color to direct attention. It is calm without becoming passive. The interface favors hierarchy, consequence, and readable work queues over decorative density, so users can decide and act without fighting the tool.

This is an Operate-mode system. Brand character lives in the concentric-orbit command mark, compact wordmark, exact type hierarchy, and editorial moments—not in ornamental page furniture. Lists expose their practical controls, panels remain quiet, and responsive behavior preserves every action when the navigation becomes a drawer or the content stacks.

**Key Characteristics:**

- Warm paper canvas with crisp, nearly white working panels.
- Deep forest navigation and callouts, with signal lime used selectively.
- Hierarchy-first lists with visible Edit, A–Z sorting, drag handles, and move fallbacks.
- Compact Geist and Geist Mono typography, with rare Georgia editorial accents.
- Restrained borders, selective ambient shadow, and generous buffer space.
- A CSS-built concentric-orbit command mark paired with a compact two-line wordmark.

## Colors

The palette is grounded and low-glare: deep forest provides structure, warm neutrals carry long sessions, and lime behaves as a scarce operational signal.

### Primary

- **Deep Forest:** The structural anchor for the sidebar, primary actions, focus-bearing callouts, check controls, and the orbit mark.
- **Forest Action:** A lighter forest reserved for hover feedback and secondary emphasis inside the green family.

### Secondary

- **Signal Lime:** A high-contrast cue for the logo tile, key values, rail actions, and compact status signals.
- **Soft Signal Field:** A pale lime wash for completed review steps, area initials, and supportive selected states.

### Neutral

- **Warm Paper:** The application canvas and sticky top bar; it keeps long work sessions soft rather than clinical.
- **Quiet Panel:** The default working surface for task groups, project sections, and notes containers.
- **Ink:** The primary text color for dense operational content.
- **Muted Ink:** Supporting copy, metadata, hints, and secondary counts.
- **Hairline:** Quiet panel boundaries and row dividers that organize without boxing every element.
- **Danger:** Removal actions only; it does not compete with normal task flow.

### Named Rules

**The Scarce Signal Rule.** Signal lime marks identity, state, or a consequential cue; it never becomes a broad decorative fill across ordinary work surfaces.

**The Forest Anchor Rule.** Deep forest owns the navigation rail and the strongest operational actions so the application always has a stable visual bearing.

## Typography

**Display Font:** Geist (with Arial fallback)  
**Body Font:** Geist (with Arial fallback)  
**Label/Mono Font:** Geist Mono (with monospace fallback)

**Character:** Geist keeps operational text compact, neutral, and highly scannable. Geist Mono gives counts, timings, and uppercase micro-labels an instrument-like precision, while Georgia appears only in reflective callouts where a quieter editorial voice is useful.

### Hierarchy

- **Display** (610, 38px, 1.08): Page names and editable entity headings; it tightens to 31px on compact screens.
- **Headline** (700, 17px, 1.3): Section headings and prominent panel titles.
- **Title** (680, 14px, 1.35): Entity names, primary controls, and concise navigational emphasis.
- **Body** (400, 14px, 1.45): General interface copy; supporting paragraphs typically stay near 620px or 76 characters.
- **Label** (650, 9px, 0.12em): Uppercase rail labels, status captions, and instrument-like metadata.

### Named Rules

**The Instrument Label Rule.** Use Geist Mono for terse values, timing, counts, and uppercase metadata—not for paragraphs or primary task names.

**The Editorial Pause Rule.** Georgia is a rare reflective accent for principles and prompts; it never replaces Geist as the operating typeface.

## Layout

Desktop uses a fixed 252px forest rail and a fluid content column. The sticky 72px top bar holds a centered quick-capture control, while page content is capped at 1180px with fluid horizontal padding from 24px to 60px. Primary work areas use two-column grids with 16px gaps; panels usually carry 23px internal padding and 14px corners.

At 920px and below, the rail becomes an off-canvas drawer with a dimmed scrim, the menu control appears, and Today, project, and review grids stack. At 720px and below, list utilities remove explanatory microcopy, Edit and move affordances gain touch-sized targets, and list columns collapse without losing actions. At 580px and below, page headings, inbox rows, and inline creation layouts stack; page gutters tighten to 17px. The 460px fallback removes nonessential area initials and keeps explicit move controls available alongside drag handles.

**The Actions Survive Rule.** Responsive collapse may remove secondary metadata, but it must preserve Edit, Open, sorting, and a non-drag move fallback.

**The Buffer Is Structural Rule.** Do not fill every viewport seam. Open paper around the work queue is part of the product's ability to absorb change.

## Elevation & Depth

The system is flat and tonal by default. Warm paper, quiet panels, forest fields, and hairline borders establish most depth. Ambient shadows appear selectively on the forest day brief, orbit mark, mobile drawer, and toast—elements that float above the ordinary working plane or need temporary emphasis.

### Shadow Vocabulary

- **Forest Ambient** (`0 14px 35px rgba(23,61,51,.14)`): The dark day brief only, giving one editorial panel a calm lift.
- **Command Mark** (`0 8px 20px rgba(4,24,18,.18)`): The lime orbit tile inside the forest rail.
- **Drawer Lift** (`16px 0 40px rgba(16,30,25,.22)`): The mobile navigation drawer while it overlays content.
- **Toast Lift** (`0 12px 30px rgba(18,31,26,.22)`): Temporary confirmation and undo feedback.

### Named Rules

**The Flat-by-Default Rule.** Borders and tonal contrast organize ordinary work; shadows are reserved for overlays, transient feedback, and the single featured brief.

## Shapes

The form language is gently rounded and practical. Small controls use 7–10px corners, callouts use 12px, and primary panels use 14px. Hairline borders separate rows and define working surfaces; dashed borders belong only to empty states. Circles are reserved for check controls, drag-handle dots, and the concentric-orbit identity mark.

**The Nested Radius Rule.** Smaller controls sit inside larger surfaces with visibly tighter corners; do not give every object the same radius.

## Components

### Buttons

- **Shape:** Compact, gently rounded controls with 8–10px corners.
- **Primary:** Deep forest with white text and dense 11px by 14px padding; disabled actions mute toward gray-green rather than disappearing.
- **Hover / Focus:** Hover shifts within the forest or neutral family. Keyboard focus uses a visible 3px olive outline with a 2px offset.
- **Secondary / Ghost:** Secondary actions use a quiet panel or transparent surface with a restrained gray-green border; destructive actions use danger color only inside clearly labeled removal zones.

### Cards / Containers

- **Corner Style:** Calm panel corners (14px), with 12px for callouts and 10–11px for smaller state containers.
- **Background:** Quiet Panel on Warm Paper; forest panels are reserved for guiding principles and review prompts.
- **Shadow Strategy:** Flat by default, following the elevation rules above.
- **Border:** One-pixel hairlines; row lists use dividers rather than individual card shells.
- **Internal Padding:** 23px on desktop and 19px on compact mobile layouts.

### Inputs / Fields

- **Style:** White or softly tinted inset fields with gray-green strokes, 8–10px corners, and compact padding.
- **Focus:** The global 3px olive focus outline remains visible; editable names also reveal a stronger field border.
- **Error / Disabled:** Disabled primary actions use muted gray-green or reduced opacity. Destructive styling is not reused for ordinary validation.

### Navigation

The deep forest rail uses muted cool-green labels at rest, a darker forest hover field, and a warm near-white active field with forest text. The two-line Mission Control wordmark and orbit mark anchor the top. Below 920px, navigation becomes a left drawer with a scrim and an explicit Close action.

### Hierarchy Lists

Rows are the core operating pattern. Each row prioritizes the entity name, retains concise metadata, and exposes Edit, Open, drag, step-move, and A–Z sorting controls. Dividers provide rhythm without fragmenting the list into a wall of cards. On touch layouts, controls become at least 44px tall and secondary metadata yields before actions do.

### Command Mark

The signature mark is a 34px signal-lime tile with 10px corners, two fine concentric forest rings, a central core, and an offset signal dot. It is built in CSS, not rendered as a generic icon, and is always paired with the compact two-line Mission Control wordmark in the product rail.

## Do's and Don'ts

### Do:

- **Do** use Warm Paper for the canvas and Quiet Panel for primary work surfaces.
- **Do** keep hierarchy-first lists readable, lightly divided, and equipped with visible Edit, A–Z sort, drag, and step-move affordances.
- **Do** preserve the 252px rail on desktop and convert it to a drawer below 920px.
- **Do** use signal lime sparingly for identity, status, and consequential cues.
- **Do** keep touch actions at least 44px tall in compact list layouts.
- **Do** preserve the concentric-orbit mark and compact two-line Mission Control wordmark as the core identity lockup.

### Don't:

- **Don't** turn every row into an elevated card or add shadow to ordinary panels.
- **Don't** hide essential reordering or editing behind hover-only behavior on touch layouts.
- **Don't** introduce bright multicolor accents, cold white application chrome, or blue-gray enterprise styling.
- **Don't** use Georgia for operational copy, task names, or navigation.
- **Don't** let responsive layouts remove Open, Edit, sorting, or the non-drag move fallback.
- **Don't** use signal lime as a large decorative background when forest or a neutral surface can carry the structure.
