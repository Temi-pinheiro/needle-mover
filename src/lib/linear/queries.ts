/**
 * Linear GraphQL documents.
 *
 * Three deliberate choices:
 *  - We resolve `viewer.id` first and filter on it, rather than an `isMe`
 *    comparator that isn't in the public filtering docs.
 *  - `relations` and `inverseRelations` use *different* field names for the
 *    other side of the relation (`relatedIssue` vs `issue`), because the issue
 *    is the source in one and the target in the other.
 *  - Filters are passed as variables rather than written inline, so a venture
 *    scoped to one team and a venture spanning a whole organisation share one
 *    document instead of two that can drift apart.
 */

export const VIEWER = /* GraphQL */ `
  query Viewer {
    viewer {
      id
      name
      email
    }
    organization {
      id
      name
      urlKey
    }
  }
`;

/** Teams a key can reach, for the venture picker. */
export const TEAMS = /* GraphQL */ `
  query Teams {
    teams(first: 100) {
      nodes {
        id
        key
        name
      }
    }
  }
`;

export const OPEN_ISSUES = /* GraphQL */ `
  query OpenIssues($filter: IssueFilter!, $after: String) {
    issues(first: 100, after: $after, filter: $filter) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        identifier
        title
        url
        priority
        estimate
        dueDate
        updatedAt
        state {
          name
          type
        }
        project {
          id
        }
        relations {
          nodes {
            type
            relatedIssue {
              id
              state {
                type
              }
            }
          }
        }
        inverseRelations {
          nodes {
            type
            issue {
              id
              state {
                type
              }
            }
          }
        }
      }
    }
  }
`;

/** Open issues assigned to `assigneeId`, narrowed to one team when given. */
export function openIssuesFilter(assigneeId: string, teamId?: string | null) {
  return {
    assignee: { id: { eq: assigneeId } },
    state: { type: { nin: ["completed", "canceled"] } },
    ...(teamId ? { team: { id: { eq: teamId } } } : {}),
  };
}

export const ACTIVE_PROJECTS = /* GraphQL */ `
  query ActiveProjects($filter: ProjectFilter!, $after: String) {
    projects(first: 100, after: $after, filter: $filter) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        state
        targetDate
        progress
        priority
      }
    }
  }
`;

/** Active projects, narrowed to those one team can reach when given. */
export function activeProjectsFilter(teamId?: string | null) {
  return {
    state: { nin: ["completed", "canceled"] },
    ...(teamId ? { accessibleTeams: { id: { eq: teamId } } } : {}),
  };
}

/**
 * Scope estimate for one project: the sum of estimates across *all* its open
 * issues, not just TP's. Fetched separately because it is the only query that
 * needs issues we don't otherwise care about.
 */
export const PROJECT_SCOPE = /* GraphQL */ `
  query ProjectScope($projectId: String!, $after: String) {
    project(id: $projectId) {
      id
      issues(first: 250, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          estimate
          state {
            type
          }
        }
      }
    }
  }
`;

/** The workflow states available to an issue's team, for Start and Done. */
export const ISSUE_TEAM_STATES = /* GraphQL */ `
  query IssueTeamStates($issueId: String!) {
    issue(id: $issueId) {
      id
      state {
        id
        type
      }
      team {
        id
        states(first: 100) {
          nodes {
            id
            name
            type
            position
          }
        }
      }
    }
  }
`;

export const SET_ISSUE_STATE = /* GraphQL */ `
  mutation SetIssueState($issueId: String!, $stateId: String!) {
    issueUpdate(id: $issueId, input: { stateId: $stateId }) {
      success
      issue {
        id
        state {
          name
          type
        }
      }
    }
  }
`;

/**
 * Per-team estimation settings. Estimates are a team-level feature in Linear:
 * if a team has them switched off, every one of its issues returns a null
 * estimate and both scope share and calendar fit fall back to neutral.
 */
export const TEAM_ESTIMATION = /* GraphQL */ `
  query TeamEstimation {
    teams(first: 50) {
      nodes {
        id
        key
        name
        issueEstimationType
        issueEstimationAllowZero
      }
    }
  }
`;

/**
 * Issues completed since an instant.
 *
 * The recap cannot read this from our cache: sync deletes issues that have
 * left the open set, which is exactly the set the recap is about. It also has
 * to include issues closed directly in Linear, not only those closed through
 * the app.
 */
export const COMPLETED_SINCE = /* GraphQL */ `
  query CompletedSince($filter: IssueFilter!, $after: String) {
    issues(first: 100, after: $after, filter: $filter) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        identifier
        title
        url
        completedAt
        estimate
        project {
          id
          name
        }
      }
    }
  }
`;

/** Completed since an instant, narrowed to one team when given. */
export function completedSinceFilter(assigneeId: string, since: string, teamId?: string | null) {
  return {
    assignee: { id: { eq: assigneeId } },
    completedAt: { gte: since },
    ...(teamId ? { team: { id: { eq: teamId } } } : {}),
  };
}

/**
 * Posts a project update. Verified against the live schema: `projectId` is the
 * only required field, `health` is optional and deliberately omitted — closing
 * a few issues is not evidence a project is on track, and claiming it would be
 * the app asserting something it cannot know.
 */
export const PROJECT_UPDATE_CREATE = /* GraphQL */ `
  mutation PostProjectUpdate($projectId: String!, $body: String!) {
    projectUpdateCreate(input: { projectId: $projectId, body: $body }) {
      success
      projectUpdate {
        id
        url
      }
    }
  }
`;

/** The teams a project belongs to, for filing an issue in a whole-org venture. */
export const PROJECT_TEAMS = /* GraphQL */ `
  query ProjectTeams($projectId: String!) {
    project(id: $projectId) {
      id
      teams(first: 10) {
        nodes {
          id
        }
      }
    }
  }
`;

/**
 * Creates an issue from an approved capture. Returns the same fields as
 * OPEN_ISSUES so the result maps straight into the cache with toIssueRow; a
 * brand-new issue has no relations, so those are left out.
 */
export const CREATE_ISSUE = /* GraphQL */ `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        title
        url
        priority
        estimate
        dueDate
        updatedAt
        state {
          name
          type
        }
        project {
          id
        }
      }
    }
  }
`;
