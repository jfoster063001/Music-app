import { api } from "../shared/api.js";
import { startPolling } from "../shared/state.js";
import { pausePlayback, playSong, stopPlayback } from "./playback.js";
import { createTournamentFromForm, loadSongChoices } from "./tournamentSetup.js";

const hostSecretKey = "songClashHostSecret";
const uploadSecretKey = "songClashUploadSecret";

const accessPanel = document.querySelector("#accessPanel");
const accessForm = document.querySelector("#accessForm");
const hostSecretInput = document.querySelector("#hostSecretInput");
const lockHostButton = document.querySelector("#lockHostButton");

const appPanel = document.querySelector("#hostApp");
const songChoices = document.querySelector("#songChoices");
const tournamentForm = document.querySelector("#tournamentForm");
const tournamentSetup = document.querySelector("#tournamentSetup");
const activeControls = document.querySelector("#activeControls");
const statusMessage = document.querySelector("#statusMessage");

const songAdminList = document.querySelector("#songAdminList");
const uploadForm = document.querySelector("#uploadForm");
const uploadSecretInput = document.querySelector("#uploadSecretInput");
const uploadCodeForm = document.querySelector("#uploadCodeForm");
const uploadCodeInput = document.querySelector("#uploadCodeInput");
const uploadCodeList = document.querySelector("#uploadCodeList");
const refreshUploadCodes = document.querySelector("#refreshUploadCodes");
const exportUploadCodesCsv = document.querySelector("#exportUploadCodesCsv");

const currentTournamentName = document.querySelector("#currentTournamentName");
const currentTournamentMeta = document.querySelector("#currentTournamentMeta");
const songATitle = document.querySelector("#songATitle");
const songAArtist = document.querySelector("#songAArtist");
const songBTitle = document.querySelector("#songBTitle");
const songBArtist = document.querySelector("#songBArtist");
const audienceCount = document.querySelector("#audienceCount");
const voteCount = document.querySelector("#voteCount");
const stateLabel = document.querySelector("#stateLabel");
const tiePanel = document.querySelector("#tiePanel");

let hostSecret = localStorage.getItem(hostSecretKey) || "";
let state = null;
let stopPolling = null;
let uploadCodes = [];

function setStatus(message, isError = false) {
  statusMessage.textContent = message || "";
  statusMessage.classList.toggle("error", isError);
}

function hostHeaders(extraHeaders = {}) {
  return {
    "x-host-secret": hostSecret,
    ...extraHeaders
  };
}

function uploadSecret() {
  return String(uploadSecretInput.value || "").trim();
}

function uploadHeaders(extraHeaders = {}) {
  return {
    "x-upload-secret": uploadSecret(),
    ...extraHeaders
  };
}

async function hostApi(path, options = {}) {
  return api(path, {
    ...options,
    headers: hostHeaders(options.headers)
  });
}

function hostPollInterval() {
  const phase = state?.tournament?.state;
  return phase === "voting" || phase === "results" ? 1500 : 3000;
}

function hideHost() {
  appPanel.classList.add("hidden");
  accessPanel.classList.remove("hidden");
}

function showHost() {
  accessPanel.classList.add("hidden");
  appPanel.classList.remove("hidden");
}

async function loadAdminSongs() {
  const { songs } = await hostApi("/api/songs/admin");

  if (!songs?.length) {
    songAdminList.innerHTML = "<p class='muted'>No songs uploaded yet.</p>";
    return;
  }

  songAdminList.innerHTML = songs.map(song => `
    <article class="song-admin-row">
      <div>
        <strong>${escapeHtml(song.title)}</strong>
        <span>${escapeHtml(song.artist || "Unknown Artist")}</span>
      </div>
      <button class="button danger" data-song-id="${song.id}">Delete</button>
    </article>
  `).join("");
}

function formatCodeStatus(code) {
  if (code.used_at) {
    return `Used at ${new Date(code.used_at).toLocaleString()}`;
  }

  return "Unused";
}

function csvValue(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function uploadCodesCsv(codes) {
  const lines = ["code,status,created_at,used_at,used_song_id"];

  for (const code of codes) {
    const status = code.used_at ? "used" : "unused";

    lines.push([
      csvValue(code.code),
      csvValue(status),
      csvValue(code.created_at || ""),
      csvValue(code.used_at || ""),
      csvValue(code.used_song_id || "")
    ].join(","));
  }

  return lines.join("\n");
}

async function copyText(value) {
  await navigator.clipboard.writeText(value);
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadUploadCodes() {
  const { codes } = await hostApi("/api/upload-codes");
  uploadCodes = codes || [];

  if (!uploadCodes.length) {
    uploadCodeList.innerHTML = "<p class='muted'>No upload codes yet.</p>";
    return;
  }

  uploadCodeList.innerHTML = uploadCodes.map(code => `
    <article class="upload-code-row">
      <div>
        <strong>${escapeHtml(code.code)}</strong>
        <span>${escapeHtml(formatCodeStatus(code))}</span>
      </div>
      <button class="button" data-upload-action="copy" data-upload-code="${escapeHtml(code.code)}">Copy</button>
      <button class="button danger" data-upload-action="delete" data-upload-code="${escapeHtml(code.code)}">Delete</button>
    </article>
  `).join("");
}

async function refreshState() {
  state = await api("/api/tournaments/state");
  renderState();
}

async function unlockHost(secret) {
  hostSecret = String(secret || "").trim();

  if (!hostSecret) {
    throw new Error("Host secret is required");
  }

  localStorage.setItem(hostSecretKey, hostSecret);
  showHost();

  if (!uploadSecretInput.value && localStorage.getItem(uploadSecretKey)) {
    uploadSecretInput.value = localStorage.getItem(uploadSecretKey);
  }

  await Promise.all([
    refreshState(),
    loadSongChoices(songChoices, hostSecret),
    loadAdminSongs(),
    loadUploadCodes()
  ]);
}

async function boot() {
  hideHost();

  if (localStorage.getItem(uploadSecretKey)) {
    uploadSecretInput.value = localStorage.getItem(uploadSecretKey);
  }

  if (!hostSecret) return;

  try {
    await unlockHost(hostSecret);

    stopPolling = startPolling(refreshState, {
      interval: hostPollInterval,
      hiddenInterval: 8000,
      pauseWhenHidden: true
    });
  } catch (error) {
    setStatus(error.message, true);
    hostSecret = "";
    localStorage.removeItem(hostSecretKey);
    hideHost();
  }
}

accessForm.addEventListener("submit", async event => {
  event.preventDefault();
  setStatus("");

  try {
    await unlockHost(new FormData(accessForm).get("hostSecret"));

    if (stopPolling) stopPolling();
    stopPolling = startPolling(refreshState, {
      interval: hostPollInterval,
      hiddenInterval: 8000,
      pauseWhenHidden: true
    });

    setStatus("Host access granted.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

lockHostButton.addEventListener("click", () => {
  if (stopPolling) {
    stopPolling();
    stopPolling = null;
  }

  hostSecret = "";
  hostSecretInput.value = "";
  localStorage.removeItem(hostSecretKey);
  hideHost();
  setStatus("Host locked.");
});

uploadSecretInput.addEventListener("change", () => {
  localStorage.setItem(uploadSecretKey, uploadSecret());
});

tournamentForm.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    await createTournamentFromForm(tournamentForm, hostSecret);
    setStatus("Tournament created.");
    await Promise.all([refreshState(), loadAdminSongs()]);
  } catch (error) {
    setStatus(error.message, true);
  }
});

uploadForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!uploadSecret()) {
    setStatus("Upload secret is required.", true);
    return;
  }

  try {
    const formData = new FormData(uploadForm);
    await api("/api/songs/upload", {
      method: "POST",
      body: formData,
      headers: uploadHeaders()
    });

    localStorage.setItem(uploadSecretKey, uploadSecret());
    uploadForm.reset();
    uploadSecretInput.value = localStorage.getItem(uploadSecretKey) || "";

    await Promise.all([
      loadSongChoices(songChoices, hostSecret),
      loadAdminSongs()
    ]);

    setStatus("Song uploaded.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

uploadCodeForm.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const code = String(new FormData(uploadCodeForm).get("code") || "").trim();

    const created = await hostApi("/api/upload-codes", {
      method: "POST",
      body: { code }
    });

    uploadCodeInput.value = "";
    await loadUploadCodes();
    setStatus(`Upload code created: ${created.code}`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

uploadCodeList.addEventListener("click", async event => {
  const button = event.target.closest("button[data-upload-action][data-upload-code]");
  if (!button) return;

  const action = button.getAttribute("data-upload-action");
  const code = button.getAttribute("data-upload-code");
  if (!code) return;

  if (action === "copy") {
    try {
      await copyText(code);
      setStatus(`Copied upload code ${code}.`);
    } catch (error) {
      setStatus(error.message || "Unable to copy code.", true);
    }
    return;
  }

  if (action !== "delete") return;

  if (!confirm(`Delete upload code ${code}?`)) return;

  try {
    await hostApi(`/api/upload-codes/${encodeURIComponent(code)}`, {
      method: "DELETE"
    });
    await loadUploadCodes();
    setStatus(`Deleted upload code ${code}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

exportUploadCodesCsv.addEventListener("click", () => {
  if (!uploadCodes.length) {
    setStatus("No upload codes to export.", true);
    return;
  }

  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  downloadCsv(
    `song-clash-upload-codes-${timestamp}.csv`,
    uploadCodesCsv(uploadCodes)
  );
  setStatus("Upload codes CSV exported.");
});

refreshUploadCodes.addEventListener("click", async () => {
  try {
    await loadUploadCodes();
    setStatus("Upload code status refreshed.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

songAdminList.addEventListener("click", async event => {
  const button = event.target.closest("button[data-song-id]");
  if (!button) return;

  const songId = button.getAttribute("data-song-id");
  if (!songId) return;

  if (!confirm("Delete this song from the library?")) return;

  try {
    await hostApi(`/api/songs/${songId}`, { method: "DELETE" });

    await Promise.all([
      loadSongChoices(songChoices, hostSecret),
      loadAdminSongs(),
      refreshState()
    ]);

    setStatus("Song deleted.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.querySelector("#startTournament").addEventListener("click", async () => {
  if (!state?.tournament) return;

  try {
    await hostApi(`/api/tournaments/${state.tournament.id}/start`, {
      method: "POST"
    });
    await refreshState();
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.querySelector("#playA").addEventListener("click", async () => {
  if (!state?.matchup) return;
  await setMatchState("song_a");
  await playSong(state.matchup.songA.id);
});

document.querySelector("#playB").addEventListener("click", async () => {
  if (!state?.matchup) return;
  await setMatchState("song_b");
  await playSong(state.matchup.songB.id);
});

document.querySelector("#pauseAudio").addEventListener("click", pausePlayback);
document.querySelector("#stopAudio").addEventListener("click", stopPlayback);

document.querySelector("#openVoting").addEventListener("click", async () => {
  stopPlayback();
  await setMatchState("voting");
});

document.querySelector("#closeVoting").addEventListener("click", async () => {
  if (!state?.matchup) return;

  try {
    await hostApi(`/api/matchups/${state.matchup.id}/close-voting`, {
      method: "POST",
      body: {
        tournamentId: state.tournament.id
      }
    });

    tiePanel.classList.add("hidden");
    await refreshState();
  } catch (error) {
    if (error.status === 409 && error.data?.tie) {
      tiePanel.classList.remove("hidden");
      document.querySelector("#tieA").textContent =
        `Choose ${state.matchup.songA.title}`;
      document.querySelector("#tieB").textContent =
        `Choose ${state.matchup.songB.title}`;
      return;
    }

    setStatus(error.message, true);
  }
});

document.querySelector("#tieA").addEventListener("click", () => resolveTie(state.matchup.songA.id));
document.querySelector("#tieB").addEventListener("click", () => resolveTie(state.matchup.songB.id));

document.querySelector("#nextMatchup").addEventListener("click", async () => {
  if (!state?.tournament) return;

  try {
    await hostApi(`/api/tournaments/${state.tournament.id}/advance`, {
      method: "POST"
    });
    await refreshState();
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.querySelector("#deleteTournament").addEventListener("click", async () => {
  if (!state?.tournament) return;
  if (!confirm("Delete the current tournament setup?")) return;

  await hostApi(`/api/tournaments/${state.tournament.id}`, {
    method: "DELETE"
  });

  await refreshState();
});

async function resolveTie(winnerSongId) {
  await hostApi(`/api/matchups/${state.matchup.id}/close-voting`, {
    method: "POST",
    body: {
      tournamentId: state.tournament.id,
      winnerSongId
    }
  });

  tiePanel.classList.add("hidden");
  await refreshState();
}

async function setMatchState(nextState) {
  await hostApi(`/api/matchups/${state.matchup.id}/state`, {
    method: "POST",
    body: {
      tournamentId: state.tournament.id,
      state: nextState
    }
  });

  await refreshState();
}

function renderState() {
  const tournament = state?.tournament;
  const matchup = state?.matchup;

  tournamentSetup.classList.toggle(
    "hidden",
    Boolean(tournament && tournament.status === "active")
  );

  activeControls.classList.toggle("hidden", !tournament);

  if (!tournament) return;

  currentTournamentName.textContent = tournament.name;
  currentTournamentMeta.textContent =
    `${tournament.tournamentType.replaceAll("_", " ")} • ${tournament.status}`;
  stateLabel.textContent = tournament.state;
  audienceCount.textContent = state.audienceCount ?? 0;
  voteCount.textContent = state.votesSubmitted ?? 0;

  const startButton = document.querySelector("#startTournament");
  startButton.classList.toggle("hidden", tournament.status !== "setup");

  const nextButton = document.querySelector("#nextMatchup");
  nextButton.classList.toggle("hidden", tournament.state !== "results");

  if (matchup) {
    songATitle.textContent = matchup.songA.title;
    songAArtist.textContent = matchup.songA.artist || "";
    songBTitle.textContent = matchup.songB.title;
    songBArtist.textContent = matchup.songB.artist || "";
  } else {
    songATitle.textContent = "-";
    songAArtist.textContent = "";
    songBTitle.textContent = "-";
    songBArtist.textContent = "";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

boot().catch(error => setStatus(error.message, true));
