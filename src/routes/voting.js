import { getPublicState } from "../services/tournamentService.js";
import { joinAudience, submitVote } from "../services/votingService.js";
import { json } from "../utils/response.js";

export function registerVotingRoutes(router) {
  router.get("/api/voting/state", async (request, env) => {
    const audienceId = new URL(request.url).searchParams.get("audienceId");
    return json(await getPublicState(env, audienceId));
  });

  router.post("/api/voting/join", async (request, env) => {
    const body = await request.json();

    if (!body.audienceId) {
      return json({ error: "audienceId is required" }, 400);
    }

    return json(
      await joinAudience(
        {
          audienceId: body.audienceId,
          displayName: body.displayName
        },
        env
      )
    );
  });

  router.post("/api/voting/vote", async (request, env) => {
    const body = await request.json();

    if (!body.audienceId || !body.matchupId || !body.selectedSongId) {
      return json({ error: "Missing voting fields" }, 400);
    }

    return json(
      await submitVote(
        {
          audienceId: body.audienceId,
          matchupId: body.matchupId,
          selectedSongId: body.selectedSongId
        },
        env
      )
    );
  });
}
