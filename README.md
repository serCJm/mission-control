# Mission Control

A calm, full-stack workspace for organizing areas, projects, and the few tasks
that matter most. It runs on [vinext](https://github.com/cloudflare/vinext),
with Cloudflare D1 and Drizzle support.

## Prerequisites

- Docker with Docker Compose

## Quick Start

```bash
docker-compose up --build
```

Open [http://localhost:3000](http://localhost:3000). The source directory is
mounted into the container, while project dependencies stay in a Docker volume.
The container refreshes that volume automatically whenever either package
manifest changes.
If port 3000 is already in use, choose another host port with
`APP_PORT=3001 docker-compose up`.

Run project tooling through the container; the common commands are listed under
[Useful Commands](#useful-commands).

To add or update a dependency, run npm through the container so it updates both
`package.json` and `package-lock.json` without installing anything on the host:

```bash
docker-compose run --rm app npm install <package>
```

This project does not use `wrangler.jsonc`.

`.openai/hosting.json` identifies the existing Mission Control Site. Preserve its
`project_id` when publishing updates so the app and plugin keep the same data.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `docker-compose up`: start local development
- `docker-compose run --rm app npm run build`: verify the vinext build output
- `docker-compose run --rm app npm test`: build and run the test suite
- `docker-compose run --rm app npm run lint`: run ESLint
- `docker-compose run --rm app npm run db:generate`: generate Drizzle migrations
  after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## License

Released under the [MIT License](LICENSE).

## ChatGPT plugin extension

The existing Site declares `mcp` in `.openai/hosting.json` and serves a stateless
Streamable HTTP MCP endpoint at `/mcp`. Sites provisions the private plugin and
manages OAuth. Install or connect the Site's plugin through ChatGPT's **Plugins →
Personal → Created by you**. Do not create a second local MCP connection.

`open_mission_control` provides sidebar and conversation-panel entrypoints.
The embedded view supports area/project filters, task capture, completion, and
reading notes. The full app remains the calendar, routines, and weekly-review
editor. Chat tools also support creating/editing projects and project notes:

- `get_workspace`, `open_mission_control`
- `create_task`, `update_task`
- `create_project`, `update_project`, `save_project_note`

All data-bearing calls use the authenticated Site user ID and the same D1 row as
the website. Discovery and UI resources contain no workspace data. Read the
workspace before mutations and supply its `updatedAt` as `expectedUpdatedAt`.
The server atomically rejects stale writes, including browser saves. No database
schema change or data reset is required. Unknown saved formats are preserved.

The UI uses the official MCP Apps bridge, with no direct API calls or credentials
in the iframe. `npm run build` and `npm run dev` generate its self-contained HTML
from `plugin-ui/`; after editing that directory during development, run
`docker-compose exec app npm run build:plugin-ui`.

Validation (inside Docker): `npm run typecheck`, `npm run build`, and
`node --test`. MCP tests use a temporary isolated D1 database, never the persisted
development or production workspace.

Official implementation references:
[Build an MCP server](https://developers.openai.com/plugins/build/mcp-server),
[Plugin extensions](https://developers.openai.com/plugins/build/extensions), and
[MCP Apps UI](https://developers.openai.com/plugins/build/chatgpt-ui).
