/**
 * Minimal Linear GraphQL client.
 *
 * Auth is a personal API key per workspace, sent raw in `Authorization` (no
 * `Bearer` — that prefix is for OAuth tokens only).
 */

const ENDPOINT = "https://api.linear.app/graphql";

export class LinearError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors?: unknown,
  ) {
    super(message);
    this.name = "LinearError";
  }
}

export type LinearClient = {
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
};

export function createLinearClient(apiKey: string): LinearClient {
  return {
    async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        body: JSON.stringify({ query, variables }),
        // Sync runs server-side on a schedule; never serve a stale response.
        cache: "no-store",
      });

      if (res.status === 429) {
        const reset = res.headers.get("X-RateLimit-Requests-Reset");
        throw new LinearError(
          `Linear rate limit hit${reset ? `, resets at ${reset}` : ""}.`,
          429,
        );
      }

      const body = (await res.json().catch(() => null)) as
        | { data?: T; errors?: Array<{ message: string }> }
        | null;

      if (!res.ok || !body) {
        throw new LinearError(`Linear returned ${res.status}.`, res.status);
      }

      if (body.errors?.length) {
        // Surface Linear's own message — it names the offending field, which is
        // the fastest way to find a schema drift.
        throw new LinearError(
          body.errors.map((e) => e.message).join("; "),
          res.status,
          body.errors,
        );
      }

      if (!body.data) throw new LinearError("Linear returned no data.", res.status);
      return body.data;
    },
  };
}

/** The shape every Linear paginated field returns. */
export type Connection<TNode> = {
  nodes: TNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

/**
 * Walks a Linear connection to the end, one page at a time.
 *
 * Both type parameters are inferred from `select`, so a caller writes
 * `paginate(client, Q, vars, (d: { issues: Connection<IssueNode> }) => d.issues)`
 * and gets `IssueNode[]` back with no casts.
 */
export async function paginate<TData, TNode>(
  client: LinearClient,
  query: string,
  variables: Record<string, unknown>,
  select: (data: TData) => Connection<TNode>,
  maxPages = 20,
): Promise<TNode[]> {
  const out: TNode[] = [];
  let after: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const connection = select(await client.request<TData>(query, { ...variables, after }));
    out.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  return out;
}
