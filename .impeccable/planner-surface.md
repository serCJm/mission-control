# Planner Surface Brief

## Job and audience

A solo Mission Control user opens Planner to protect broad area time, place project work inside it, and see deadline-bearing or focused tasks without rebuilding the same plan elsewhere. This is an Operate surface used repeatedly during weekly planning and quick replanning.

## Outcome and proof

The user can create a recurring area block by dragging or through settings, adjust one occurrence safely, schedule a project session, and see current focused tasks appear automatically. The existing areas, projects, tasks, deadlines, focus selection, and cloud save state remain the single source of truth.

## Direction

Extend the established Quiet Operations Desk into a calm paper week: a precise time rail, restrained hairline grid, broad tonal area fields, and dense operational detail inside the blocks. The primary interaction is dropping an area into open time and immediately seeing a recurring block become part of the week.

The first viewport places the week and its open buffer first, with a compact planning shelf above it rather than a dashboard of summary cards. Selecting an area reveals only its focused work, three priority-sensitive next actions, two active projects, and a collapsed backlog. Forest anchors navigation and primary actions; lime marks the current moment, focus, and consequential states only.

## Direction contract

- **THESIS:** Protect the week with broad, recurring area ownership before assigning detailed work.
- **OWN-WORLD:** The Quiet Operations Desk becomes a calm paper calendar: warm ground, sober forest structure, restrained hairlines, and scarce lime signal.
- **STORY:** Orient to the week, protect an area, place project work inside it, and let focused tasks follow the area automatically.
- **FIRST VIEWPORT:** Show the week’s open buffer and time rail as the focal surface, with a compact planning shelf above it on desktop and the selected day first on mobile.
- **FORM:** Seed key `quiet-week-grid-20260826`; code-first responsive week grid with a full-width planning shelf and inline occurrence inspector.

## Interaction and layout

- Desktop: Monday-first week grid, date controls, all-day deadlines, selectable area sources, a contextual area shelf above the week, and an inline inspector.
- Mobile: horizontal day chooser and one-day agenda; every drag action has a tap-driven equivalent.
- Scheduling from a contextual task or project opens the next matching area block with that item already selected; dragging remains the faster spatial alternative.
- Focused tasks follow the current area into upcoming blocks automatically. Backlog stays collapsed until explicitly requested.
- Fifteen-minute snapping, 30-minute minimum area blocks, visible conflicts, and undo feedback.
- Motion is limited to a 180ms stateful block settle, drawer/sheet reveal, and current-time movement; reduced motion removes it.

## Boundaries

Area blocks are recurring time ownership and remain separate from routines. Tasks use their existing due date plus optional due time as deadline markers. Project sessions reserve time only inside a matching area block. No external calendar, collaboration, month view, or production publication is included.
