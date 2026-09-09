import { api } from "./shared/api.js";

const list = document.querySelector("#publicSongList");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderSongs(songs) {
  if (!songs?.length) {
    list.innerHTML = "<p class='muted'>No songs uploaded yet.</p>";
    return;
  }

  list.innerHTML = songs.map((song, index) => `
    <div class="public-song-row">
      <strong>#${index + 1}</strong>
      <span>${escapeHtml(song.title)}</span>
    </div>
  `).join("");
}

async function refreshSongs() {
  try {
    const { songs } = await api("/api/songs");
    renderSongs(songs);
  } catch {
    list.innerHTML = "<p class='muted'>Unable to load songs right now.</p>";
  }
}

refreshSongs();
setInterval(refreshSongs, 10000);
