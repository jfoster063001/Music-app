import { api } from "../shared/api.js";

function withHostSecret(secret, options = {}) {
  return {
    ...options,
    headers: {
      "x-host-secret": secret,
      ...(options.headers || {})
    }
  };
}

export async function loadSongChoices(container, hostSecret) {
  const { songs } = await api(
    "/api/songs/admin",
    withHostSecret(hostSecret)
  );

  if (!songs.length) {
    container.innerHTML = "<p class='muted'>Upload at least two songs first.</p>";
    return;
  }

  container.innerHTML = songs.map(song => `
    <label class="song-choice">
      <input type="checkbox" name="songIds" value="${song.id}">
      <span>
        <strong>${escapeHtml(song.title)}</strong>
        <small>${escapeHtml(song.artist)}</small>
      </span>
    </label>
  `).join("");
}

export async function createTournamentFromForm(form, hostSecret) {
  const formData = new FormData(form);
  const songIds = formData.getAll("songIds");

  return api("/api/tournaments", {
    ...withHostSecret(hostSecret),
    method: "POST",
    body: {
      name: formData.get("name"),
      tournamentType: formData.get("tournamentType"),
      songIds
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
