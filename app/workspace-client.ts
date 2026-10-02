export type WorkspaceSnapshot = {
  workspace: unknown;
  updatedAt: number;
  user?: { displayName: string; email: string };
};

export interface WorkspaceClient {
  read(updatedAt?: number): Promise<WorkspaceSnapshot | null>;
  save(workspace: unknown, expectedUpdatedAt: number): Promise<{ updatedAt: number }>;
  subscribe?(refresh: () => void): () => void;
  accountLink?: { label: string; url: string; open: () => Promise<unknown> };
}

export class WorkspaceClientError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function checkResponse(response: Response) {
  if (response.status === 401) window.location.assign("/signin-with-chatgpt?return_to=%2F");
  if (!response.ok) throw new WorkspaceClientError("Unable to sync the workspace.", response.status);
  return response.json();
}

export const browserWorkspaceClient: WorkspaceClient = {
  async read(updatedAt) {
    const response = await fetch("/api/workspace", {
      cache: "no-store",
      headers: updatedAt ? { "if-none-match": `"${updatedAt}"` } : undefined,
    });
    return response.status === 304 ? null : checkResponse(response);
  },
  async save(workspace, expectedUpdatedAt) {
    return checkResponse(await fetch("/api/workspace", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace, expectedUpdatedAt }),
    }));
  },
};
