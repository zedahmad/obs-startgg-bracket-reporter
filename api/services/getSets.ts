import { startggClient } from "./startgg";
import { gql } from "graphql-request";
import { getTournamentVariables } from "./tournamentIdentifier";

const GET_SETS = gql`
  query GetSets($id: ID, $slug: String, $page: Int!) {
    tournament(id: $id, slug: $slug) {
      events {
        sets(page: $page, perPage: 50) {
          pageInfo {
            totalPages
          }
          nodes {
            id
            fullRoundText
            state

            stream {
              id
              streamName
            }

            slots {
              entrant {
                id
                name
                participants {
                  gamerTag
                  prefix
                  user {
                    location {
                      country
                    }
                  }
                }
              }
              standing {
                stats {
                  score {
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function getSets(identifier: string) {
  const tournamentVariables = getTournamentVariables(identifier);
  const setsById = new Map<string, any>();
  let page = 1;
  let totalPages = 1;

  do {
    const data = await startggClient.request(GET_SETS, {
      ...tournamentVariables,
      page,
    });
    const tournament = data.tournament;

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const events = tournament.events ?? [];
    totalPages = Math.max(
      totalPages,
      ...events.map((event: any) => event.sets?.pageInfo?.totalPages ?? 1),
    );

    for (const event of events) {
      for (const set of event.sets?.nodes ?? []) {
        if (set?.id) {
          setsById.set(String(set.id), set);
        }
      }
    }

    page++;
  } while (page <= totalPages);

  return [...setsById.values()];
}
