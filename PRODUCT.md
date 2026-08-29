# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mission Control is a solo personal planning system for one person balancing trading, learning, family, and business or life administration. The user plans in broad areas, chooses a small field of consequential work, and needs the system to stay useful when reality changes.

## Product Purpose

Mission Control connects areas, outcome-oriented projects, concrete tasks, recurring practices, weekly review, and a flexible calendar. Success means the user can decide what deserves attention, protect time for it, and adjust the plan without maintaining a second system.

## Positioning

The product treats time as broad area ownership first, then places projects and tasks inside that context. It favors a few high-impact commitments, feedback-rich work, and visible buffer over a rigid minute-by-minute task schedule.

## Operating Context

- Areas are the durable overview for projects, an area backlog, waiting work, and routines.
- Projects are outcome-oriented subareas for work that needs multiple tasks, with their own backlog, in-progress work, and waiting state.
- Calendar protects broad area time. Each occurrence has one ordered block queue containing up to three existing tasks or routines; source lists use a single “Add to queue” action.
- “Now” is derived automatically as the first unfinished item in the active block queue; it is never another queue to maintain.
- Today is the unified calendar and execution surface: the week stays visible while a contextual workbench selects the current or next block's work.
- Weekly review prunes area queues and protects enough recurring area time without pre-planning every block.
- Planning uses the America/Los_Angeles timezone and a Monday-first week.

## Capabilities and Constraints

- Persistent workspace data syncs through the existing authenticated D1-backed workspace API.
- Calendar planning uses one-time or recurring weekly area blocks with per-occurrence exceptions.
- Calendar block selections reference existing task and routine records; completing or waiting an item advances the block without creating duplicates.
- Tasks may still keep deadline dates and exact times when a real external constraint exists.
- The interface must remain usable with pointer, touch, and keyboard input.
- Development and validation run locally through Docker with development data enabled.
- External calendar integration, collaboration, and production publishing are not part of the current product.

## Brand Commitments

Mission Control is a calm operations desk: warm paper, sober forest structure, scarce lime signal, precise operational language, and enough visual space to absorb change.

## Evidence on Hand

The repository contains a working authenticated app, persistent example workspace, established design system, responsive navigation, task/project workflows, routines, weekly review, and current desktop/mobile reference captures. No external claims, testimonials, or third-party calendar assets should be fabricated.

## Product Principles

- Protect broad area blocks instead of over-scheduling every minute.
- Keep projects directional and tasks concrete.
- Choose only one to three consequential items for the block closest to execution.
- Preserve buffer and make replanning inexpensive.
- Keep the system simpler to maintain than the work it supports.

## Accessibility & Inclusion

All essential scheduling actions need visible focus, descriptive labels, touch-sized alternatives, and non-drag controls. Motion must respect reduced-motion preferences.
