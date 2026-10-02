import { getChatGPTUser } from "../chatgpt-auth";
import { workspaceDatabase } from "../workspace-database";
import { workspaceStore } from "../workspace-store";
import { handleMcpRequest } from "./server";
import uiHtml from "./ui.generated.html?raw";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  return handleMcpRequest(request, user ? async () => workspaceStore(await workspaceDatabase(), user.userId) : null, uiHtml);
}

export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
