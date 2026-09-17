/**
 * Linear GraphQL documents.
 *
 * Two deliberate choices:
 *  - We resolve `viewer.id` first and filter on it, rather than an `isMe`
 *    comparator that isn't in the public filtering docs.
 *  - `relations` and `inverseRelations` use *different* field names for the
 *    other side of the relation (`relatedIssue` vs `issue`), because the issue
 *    is the source in one and the target in the other.
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

export const OPEN_ISSUES = /* GraphQL */ `
  query OpenIssues($assigneeId: ID!, $after: String) {
    issues(
      first: 100
      after: $after
      filter: {
        assignee: { id: { eq: $assigneeId } }
        state: { type: { nin: ["completed", "canceled"] } }
      }
    ) {
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

export const ACTIVE_PROJECTS = /* GraphQL */ `
  query ActiveProjects($after: String) {
    projects(first: 100, after: $after, filter: { state: { nin: ["completed", "canceled"] } }) {
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
      }
    }
  }
`;

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
  query CompletedSince($assigneeId: ID!, $since: DateTimeOrDuration!, $after: String) {
    issues(
      first: 100
      after: $after
      filter: { assignee: { id: { eq: $assigneeId } }, completedAt: { gte: $since } }
    ) {
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
