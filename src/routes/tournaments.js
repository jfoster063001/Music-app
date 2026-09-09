import {
  createTournament,
  deleteCurrentTournament,
  getCurrentTournament,
  getPublicState,
  startTournament
} from "../services/tournamentService.js";
import { requireSecret } from "../utils/secrets.js";
import { json } from "../utils/response.js";

export function registerTournamentRoutes(router) {
  router.get("/api/tournaments/current", async (request, env) => {
    requireSecret(request, env, {
      envKey: "HOST_SECRET",
      headerName: "x-host-secret",
      queryName: "hostSecret",
      label: "host secret"
    });

    return json({ tournament: await getCurrentTournament(env) });
  });

  router.get("/api/tournaments/state", async (_request, env) => {
    return json(await getPublicState(env));
  });

  router.post("/api/tournaments", async (request, env) => {
    requireSecret(request, env, {
      envKey: "HOST_SECRET",
      headerName: "x-host-secret",
      queryName: "hostSecret",
      label: "host secret"
    });

    const body = await request.json();

    const tournament = await createTournament({
      name: body.name,
      tournamentType: body.tournamentType,
      songIds: body.songIds,
      userId: null
    }, env);

    return json({ tournament }, 201);
  });

  router.post("/api/tournaments/:id/start", async (request, env) => {
    requireSecret(request, env, {
      envKey: "HOST_SECRET",
      headerName: "x-host-secret",
      queryName: "hostSecret",
      label: "host secret"
    });

    return json(await startTournament(request.params.id, env));
  });

  router.delete("/api/tournaments/:id", async (request, env) => {
    requireSecret(request, env, {
      envKey: "HOST_SECRET",
      headerName: "x-host-secret",
      queryName: "hostSecret",
      label: "host secret"
    });

    await deleteCurrentTournament(request.params.id, env);
    return json({ ok: true });
  });
}
