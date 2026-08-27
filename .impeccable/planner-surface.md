# Calendar-First Today Surface Brief

## Job and audience

A solo Mission Control user opens Today to see the shape of the week, protect broad area time, and choose the next meaningful action without maintaining a second planning queue. This is an Operate surface used repeatedly throughout the day and lightly during weekly shaping.

## Outcome and proof

The week calendar owns the main canvas. A single contextual workbench at its left edge exposes project work, area backlog, waiting, routines, and management for one selected area. The user can drag an item to a precise block or use one queue action to place it in the active or next matching block, then continue from the first unfinished item as derived “Now.”

## Direction

Extend the Quiet Operations Desk into a focused paper week. The calendar is the stable working field; the light workbench is the only side surface and acts as the movable stack of source material beside it. Compact top-bar navigation replaces the former persistent rail, current time and Now receive scarce lime signal, and deeper area or project management opens as a dedicated main view before returning to the same calendar context.

## Direction contract

- **THESIS:** The schedule stays visible while work selection happens beside it, not above it.
- **OWN-WORLD:** Warm paper calendar, sober forest structure, restrained hairlines, and a quiet light workbench.
- **STORY:** Orient to this week, choose an area or project, select one to three items, and act from derived Now.
- **FIRST VIEWPORT:** Full-width app shell with compact top-bar navigation, a full-height week calendar, current time centered, and an open contextual workbench at the left edge on wide desktop; selected day plus drawer workbench on mobile.
- **FORM:** Code-first responsive calendar workspace with a persistent desktop workbench and accessible non-drag actions.

## Interaction and layout

- Today is the only calendar destination; Monday-first week view is the desktop default and mobile shows one selected day.
- Today, Inbox, and Weekly Review use compact top-bar navigation; no second persistent navigation rail is rendered.
- The workbench filters by area and optional project, then switches between Work, Backlog, Waiting, and Routines.
- “Add to queue” is the single source-list action. It appends an item to the active matching block or, when none is active, the next matching block; the first unfinished item in an active block is derived “Now.”
- Waiting work must be resumed before scheduling. Scheduling a backlog item activates it without creating a new status.
- Clicking a calendar block opens its inspector inside the workbench. The three-item cap, recurring series controls, occurrence overrides, conflicts, and undo feedback remain intact.
- Area and project management replace the calendar temporarily; Back to Today restores the session’s week, workbench context, open state, and calendar scroll.

## Boundaries

The persisted workspace and planner schema do not change. No external calendar, month view, manual Now override, collaboration, recommendation engine, or production publication is included.
