import { createRoot } from "react-dom/client";
import { App } from "@modelcontextprotocol/ext-apps";
import FocusHQ from "../app/focus-hq";
import { WorkspaceClientError, type WorkspaceClient, type WorkspaceSnapshot } from "../app/workspace-client";
import "../app/globals.css";
import "../app/interface.css";

const bridge = new App({ name: "FocusHQ", version: "2.1.0" }, {});
const listeners = new Set<() => void>();
bridge.ontoolresult = () => { for (const refresh of listeners) refresh(); };

async function call(name: string, args: Record<string, unknown>) {
  const result = await bridge.callServerTool({ name, arguments: args });
  if (result.isError) {
    const message = result.content?.find((item) => item.type === "text")?.text;
    throw new WorkspaceClientError(message ?? "Unable to sync FocusHQ.", Number(result._meta?.status) || 500);
  }
  const data = result.structuredContent as Record<string, unknown> | undefined;
  if (!data || typeof data.updatedAt !== "number") throw new Error("Invalid workspace response.");
  return data;
}

const client: WorkspaceClient = {
  async read(updatedAt) {
    const data = await call("get_workspace", {});
    if (!("workspace" in data)) throw new Error("Missing workspace.");
    return data.updatedAt === updatedAt ? null : data as WorkspaceSnapshot;
  },
  async save(workspace, expectedUpdatedAt) {
    const data = await call("save_workspace", { workspace, expectedUpdatedAt });
    return { updatedAt: data.updatedAt as number };
  },
  subscribe(refresh) {
    listeners.add(refresh);
    return () => { listeners.delete(refresh); };
  },
  accountLink: { label: "Open website", url: "https://focushq.work", open: () => bridge.openLink({ url: "https://focushq.work" }) },
};

const root = createRoot(document.getElementById("root")!);
root.render(<div className="app-shell"><main className="sync-gate" role="status"><h1>Connecting FocusHQ…</h1></main></div>);
bridge.connect().then(() => root.render(<FocusHQ client={client} />)).catch(() => {
  root.render(<div className="app-shell"><main className="sync-gate" role="alert"><h1>FocusHQ couldn’t connect</h1><p>Close this panel and reopen FocusHQ from your connected plugins.</p></main></div>);
});
