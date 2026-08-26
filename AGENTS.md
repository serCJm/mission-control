# Guidelines
- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
- Perform all project development inside the Docker container. Run dependency installation, development servers, builds, checks, and tests in the container; do not install project dependencies or run project tooling directly on the host. Use the host only to run Docker/Docker Compose commands and edit files.

# Data Safety
- Treat every persisted D1 workspace as irreplaceable user data. Never delete, overwrite, reset, or replace an active workspace merely because a new schema rejects it.
- Before any schema-breaking deployment, reset, destructive test, or bootstrap that can replace persisted data, create a timestamped snapshot of the active row. Preserve the original JSON unchanged and keep the snapshot until the user has verified the restored workspace.
- If the application must start with a fresh row, restore the last valid pre-change snapshot immediately afterward and add only the fields required by the current schema. This operational restore is required even though compatibility code and permanent migrations remain out of scope.
- “Last snapshot” means the newest snapshot containing genuine user data immediately before the schema change. Do not blindly select the newest archived row: later archives may contain starter data or the result of an earlier reset. Compare timestamps and inspect expected area, project, and task names or counts. Ask the user when more than one plausible snapshot remains.
- Before restoring a snapshot, archive the current active row so the restore is reversible. Use an atomic D1 batch when multiple writes are required, and never delete the source snapshot during restoration.
- After restoration, verify the active production row contains the expected user data and all fields required by the current schema. A successful request or deployment alone is not proof of a successful restore.
- Temporary recovery routes or controls must be authenticated, scoped to the current user's own snapshots, removed immediately after verification, and followed by a clean validated deployment.

# Development Server
- Always start this Sites project with development data enabled. The workspace API depends on the local D1 binding and development identity supplied by the Sites/Vite development configuration; do not use a plain preview that omits them.
- Start the app through Docker Compose so `vite.config.ts` loads `.openai/hosting.json` and provisions the local development bindings. For the shared preview, use `APP_PORT=3010 docker-compose up -d --build`.
- If the persisted local D1 workspace uses an obsolete schema and `/api/workspace` reports that the saved workspace is invalid, snapshot the obsolete local-development row before changing it. Only remove it after the snapshot is verified; then let the current starter bootstrap a fresh row and restore the snapshot with the minimum current-schema fields. Do not add permanent compatibility code or migrations for obsolete local data.
- Keep Docker published on localhost. For remote access, proxy `http://127.0.0.1:3010` through Tailscale Serve instead of exposing the development server on every host interface.

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
