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
