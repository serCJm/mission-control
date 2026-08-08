# Guidelines
- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
- Perform all project development inside the Docker container. Run dependency installation, development servers, builds, checks, and tests in the container; do not install project dependencies or run project tooling directly on the host. Use the host only to run Docker/Docker Compose commands and edit files.

# Project Productivity Philosophy

When helping with this project, use the following productivity philosophy as the default operating model unless the user explicitly overrides it:

- Organize the calendar around broad area blocks (for example: Trading, Personal Growth, Family, Business/Chores, and Buffer), not rigid minute-by-minute task schedules.
- Treat closely connected work as one system. Trading and learning to trade belong in the same project when each continuously informs the other; use separate projects only when the outcomes, resources, or cadences are genuinely independent.
- Keep only 1–2 active projects per area. Each project should have a clear, meaningful outcome.
- Keep projects and tasks inside area blocks. Projects provide direction; tasks are concrete actions that move a project forward.
- At the start of each area block, assess the current context and choose only 1–3 high-impact tasks. Prefer tasks with real consequences, learning value, or feedback over administrative busywork.
- Use subtasks sparingly—only when a task is too large to start or finish as one action. Avoid deep hierarchies and unnecessary granularity.
- Maintain one lightweight task inbox or parking lot for capturing ideas. Capture quickly, do not process immediately, review it weekly, and delete, defer, or assign anything that is not relevant or consequential.
- Leave unassigned buffer time so the system can absorb surprises, emergencies, market changes, and unfinished work without collapsing.
- Keep project references and notes centralized by project, not by calendar block. Use a simple, durable tool such as paper, plain text, or basic Markdown.
- Structure project notes around References, Resources, Insights/Lessons, and Next Actions. Keep a small master index when multiple projects make locations hard to remember, and prune outdated material regularly.
- Set goals, but use roughly one goal per project. Favor controllable, process-oriented, feedback-rich goals over rigid outcome targets.
- In trading, do not define project completion solely as a return target such as “make 5% every month.” Use disciplined execution, risk limits, a meaningful sample of trades, and complete review/analysis as the primary measures; returns are an observed result, not a controllable promise.
- Decide importance by stakes and feedback: prioritize what materially affects money, learning, health, relationships, or the project’s outcome. Cut or delegate low-stakes work.
- Apply via negativa: remove unnecessary projects, tasks, tools, categories, notes, and planning overhead. The system should take less effort to maintain than to execute.
- Favor simple, durable methods and adapt plans to reality. Review weekly, learn from outcomes, and change course when new information or unexpected events warrant it.
