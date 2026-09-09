import {
  advanceTournament,
  completeCurrentMatchup,
  setTournamentState
} from "../services/tournamentService.js";
import { requireSecret } from "../utils/secrets.js";
import { json } from "../utils/response.js";

export function registerMatchupRoutes(router) {
  router.post("/api/matchups/:id/state", async (request, env) => {
    requireSecret(request, env, {
      envKey: "HOST_SECRET",
      headerName: "x-host-secret",
      label: "host secret"
    });

    const body = await request.json();

    return json(
      await setTournamentState(
        body.tournamentId,
        request.params.id,
        body.state,
        env,
        {
          phaseDetail: body.phaseDetail,
          durationSeconds: body.durationSeconds
        }
      )
    );
  });

  router.post("/api/matchups/:id/close-voting", async (request, env) => {
    requireSecret(request, env, {
      envKey: "HOST_SECRET",
      headerName: "x-host-secret",
      label: "host secret"
    });

    const body = await request.json();

    return json(
      await completeCurrentMatchup(
        body.tournamentId,
        request.params.id,
        body.winnerSongId || null,
        env
      )
    );
  });

  router.post("/api/tournaments/:id/advance", async (request, env) => {
    requireSecret(request, env, {
      envKey: "HOST_SECRET",
      headerName: "x-host-secret",
      label: "host secret"
    });

    return json(await advanceTournament(request.params.id, env));
  });
}