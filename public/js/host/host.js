import { api } from "../shared/api.js";
import { startPolling } from "../shared/state.js";
import {
  playSongToCompletion,
  stopPlayback,
  unlockPlayback
} from "./playback.js";
import {
  createTournamentFromForm,
  loadSongChoices
} from "./tournamentSetup.js";

const HOST_SECRET_KEY = "songClashHostSecret";
const COUNTDOWN_SECONDS = 3;
const VOTING_SECONDS = 30;
const BETWEEN_SONG_MS = 900;
const VOTING_POLL_MS = 1500;

const accessPanel = document.querySelector("#accessPanel");
const accessForm = document.querySelector("#accessForm");
const hostSecretInput = document.querySelector("#hostSecretInput");
const lockHostButton = document.querySelector("#lockHostButton");
const hostApp = document.querySelector("#hostApp");
const statusMessage = document.querySelector("#statusMessage");

const activeControls = document.querySelector("#activeControls");
const tournamentSetup = document.querySelector("#tournamentSetup");
const tournamentForm = document.querySelector("#tournamentForm");
const songChoices = document.querySelector("#songChoices");
const selectedSongCount = document.querySelector("#selectedSongCount");

const uploadCodeForm = document.querySelector("#uploadCodeForm");
const uploadCodeList = document.querySelector("#uploadCodeList");
const refreshUploadCodesButton = document.querySelector("#refreshUploadCodes");
const exportUploadCodesCsvButton = document.querySelector("#exportUploadCodesCsv");
const songAdminList = document.querySelector("#songAdminList");

const currentTournamentName = document.querySelector("#currentTournamentName");
const currentTournamentMeta = document.querySelector("#currentTournamentMeta");
const stateLabel = document.querySelector("#stateLabel");
const phaseTimer = document.querySelector("#phaseTimer");
const audienceCount = document.querySelector("#audienceCount");
const voteCount = document.querySelector("#voteCount");
const automationStatus = document.querySelector("#automationStatus");
const songATitle = document.querySelector("#songATitle");
const songBTitle = document.querySelector("#songBTitle");
const songACard = document.querySelector("#hostSongACard");
const songBCard = document.querySelector("#hostSongBCard");

const startTournamentButton = document.querySelector("#startTournament");
const enableAudioButton = document.querySelector("#enableAudio");
const resumeAutomationButton = document.querySelector("#resumeAutomation");
const pauseAutomationButton = document.querySelector("#pauseAutomation");
const skipAudioButton = document.querySelector("#skipAudio");

const tiePanel = document.querySelector("#tiePanel");
const tieAButton = document.querySelector("#tieA");
const tieBButton = document.querySelector("#tieB");

const manualRestartMatchButton = document.querySelector("#manualRestartMatch");
const manualOpenVotingButton = document.querySelector("#manualOpenVoting");
const manualCloseVotingButton = document.querySelector("#manualCloseVoting");
const manualAdvanceButton = document.querySelector("#manualAdvance");
const deleteTournamentButton = document.querySelector("#deleteTournament");

let hostSecret = sessionStorage.getItem(HOST_SECRET_KEY) || "";
let state = null;
let stateReceivedAt = Date.now();
let stopPolling = null;
let uploadCodes = [];

let automationPaused = true;
let automationRunning = false;
let automationToken = 0;

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

async function hostApi(path, options = {}) {
  return api(path, {
    ...options,
    headers: hostHeaders(options.headers)
  });
}

function showHost() {
  accessPanel.classList.add("hidden");
  hostApp.classList.remove("hidden");
}

function hideHost() {
  hostApp.classList.add("hidden");
  accessPanel.classList.remove("hidden");
}

function updateState(nextState) {
  state = nextState;
  stateReceivedAt = Date.now();
  renderState();
}

async function refreshState() {
  updateState(await api("/api/tournaments/state"));
}

function phaseRemainingMs() {
  const end = Date.parse(state?.tournament?.phaseEndsAt || "");
  const serverAtReceive = Date.parse(state?.serverNow || "");

  if (!Number.isFinite(end) || !Number.isFinite(serverAtReceive)) {
    return null;
  }

  const estimatedServerNow = serverAtReceive + (Date.now() - stateReceivedAt);
  return Math.max(0, end - estimatedServerNow);
}

function formatPhaseLabel() {
  const tournament = state?.tournament;
  if (!tournament) return "—";

  const remaining = phaseRemainingMs();

  if (tournament.phaseDetail === "countdown_a") {
    return `Song A in ${Math.max(1, Math.ceil((remaining || 0) / 1000))}`;
  }

  if (tournament.phaseDetail === "countdown_b") {
    return `Song B in ${Math.max(1, Math.ceil((remaining || 0) / 1000))}`;
  }

  if (tournament.state === "voting" && remaining != null) {
    return `${Math.ceil(remaining / 1000)}s`;
  }

  if (tournament.state === "results" && remaining != null) {
    return `${Math.ceil(remaining / 1000)}s`;
  }

  if (tournament.state === "song_a") return "Playing A";
  if (tournament.state === "song_b") return "Playing B";
  if (tournament.state === "completed") return "Complete";

  return "—";
}

function updatePhaseClock() {
  phaseTimer.textContent = formatPhaseLabel();
}

function formatDisplayCode(code) {
  const value = String(code || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return value.length === 10
    ? `${value.slice(0, 5)}-${value.slice(5)}`
    : value;
}

function formatCodeStatus(code) {
  if (code.used_at) {
    return `Used ${new Date(`${code.used_at.replace(" ", "T")}Z`).toLocaleString()}`;
  }

  if (code.reserved_at) {
    return "Upload in progress";
  }

  return "Unused";
}

function csvValue(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function uploadCodesCsv(codes) {
  const lines = ["code,status,created_at,reserved_at,used_at,used_song_id"];

  for (const code of codes) {
    const status = code.used_at
      ? "used"
      : code.reserved_at
        ? "reserved"
        : "unused";

    lines.push([
      csvValue(code.code),
      csvValue(status),
      csvValue(code.created_at || ""),
      csvValue(code.reserved_at || ""),
      csvValue(code.used_at || ""),
      csvValue(code.used_song_id || "")
    ].join(","));
  }

  return lines.join("\n");
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

async function copyText(value) {
  await navigator.clipboard.writeText(value);
}

async function loadUploadCodes() {
  const { codes } = await hostApi("/api/upload-codes");
  uploadCodes = codes || [];

  if (!uploadCodes.length) {
    uploadCodeList.innerHTML = "<p class='muted'>No upload codes yet.</p>";
    return;
  }

  uploadCodeList.innerHTML = uploadCodes.map(code => `
    <article class="upload-code-row ${code.used_at ? "used" : ""}">
      <div>
        <strong>${escapeHtml(formatDisplayCode(code.code))}</strong>
        <span>${escapeHtml(formatCodeStatus(code))}</span>
      </div>
      <button class="button" type="button" data-upload-action="copy" data-upload-code="${escapeHtml(code.code)}">Copy</button>
      <button class="button danger" type="button" data-upload-action="delete" data-upload-code="${escapeHtml(code.code)}" ${code.used_at ? "disabled" : ""}>Delete</button>
    </article>
  `).join("");
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
      <button class="button danger" type="button" data-song-id="${escapeHtml(song.id)}">Delete</button>
    </article>
  `).join("");
}

function updateSelectedCount() {
  const selected = songChoices.querySelectorAll('input[name="songIds"]:checked').length;
  selectedSongCount.textContent = `${selected} selected`;
}

async function unlockHost(secret) {
  const candidate = String(secret || "").trim();

  if (!candidate) {
    throw new Error("Host secret is required");
  }

  hostSecret = candidate;

  // Validate once before loading every protected host endpoint.
  await hostApi("/api/tournaments/current");

  sessionStorage.setItem(HOST_SECRET_KEY, hostSecret);
  showHost();

  await Promise.all([
    refreshState(),
    loadSongChoices(songChoices, hostSecret),
    loadAdminSongs(),
    loadUploadCodes()
  ]);

  updateSelectedCount();
}

function hostPollInterval() {
  const phase = state?.tournament?.state;

  if (phase === "voting" || phase === "results") {
    return 1500;
  }

  return 3000;
}

function startHostPolling() {
  if (stopPolling) stopPolling();

 stopPolling = startPolling(refreshState, {
  interval: hostPollInterval,
  hiddenInterval: 10000,
  pauseWhenHidden: false
});
}

function pauseAutomation(message = "Automatic game paused.") {
  automationPaused = true;
  automationRunning = false;
  automationToken++;
  stopPlayback();
  renderAutomationStatus();
  setStatus(message);
}

function isRunActive(token) {
  return !automationPaused && token === automationToken;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitWithToken(ms, token) {
  const finishAt = Date.now() + Math.max(0, ms);

  while (Date.now() < finishAt) {
    if (!isRunActive(token)) return false;
    await delay(Math.min(150, finishAt - Date.now()));
  }

  return isRunActive(token);
}

async function setMatchState(
  nextState,
  phaseDetail = nextState,
  durationSeconds = 0
) {
  if (!state?.matchup || !state?.tournament) {
    throw new Error("There is no active matchup.");
  }

  updateState(
    await hostApi(`/api/matchups/${state.matchup.id}/state`, {
      method: "POST",
      body: {
        tournamentId: state.tournament.id,
        state: nextState,
        phaseDetail,
        durationSeconds
      }
    })
  );
}

async function runSongA(token) {
  if (!isRunActive(token) || !state?.matchup) return;

  await setMatchState("song_a", "playing_a");
  const result = await playSongToCompletion(state.matchup.songA.id);

  if (!isRunActive(token)) return;

  if (result !== "ended" && result !== "stopped") {
    return;
  }

  if (!(await waitWithToken(BETWEEN_SONG_MS, token))) return;
  await runCountdownB(token);
}

async function runCountdownB(token) {
  if (!isRunActive(token)) return;

  await setMatchState("waiting", "countdown_b", COUNTDOWN_SECONDS);
  if (!(await waitWithToken(COUNTDOWN_SECONDS * 1000, token))) return;
  await runSongB(token);
}

async function runSongB(token) {
  if (!isRunActive(token) || !state?.matchup) return;

  await setMatchState("song_b", "playing_b");
  const result = await playSongToCompletion(state.matchup.songB.id);

  if (!isRunActive(token)) return;

  if (result !== "ended" && result !== "stopped") {
    return;
  }

  if (!(await waitWithToken(BETWEEN_SONG_MS, token))) return;
  await openAutomaticVoting(token);
}

async function openAutomaticVoting(token) {
  if (!isRunActive(token)) return;

  stopPlayback();
  await setMatchState("voting", "voting", VOTING_SECONDS);
  await monitorVoting(token);
}

async function monitorVoting(token) {
  if (!isRunActive(token)) return;

  if (!state?.tournament?.phaseEndsAt) {
    await setMatchState("voting", "voting", VOTING_SECONDS);
  }

  while (isRunActive(token)) {
    await refreshState();

    if (!state?.tournament || state.tournament.state !== "voting") {
      return;
    }

    const activeAudience = Number(state.audienceCount || 0);
    const submitted = Number(state.votesSubmitted || 0);
    const remaining = phaseRemainingMs();

    const everyoneVoted = activeAudience > 0 && submitted >= activeAudience;
    const timeExpired = remaining != null && remaining <= 0;

    if (everyoneVoted || timeExpired) {
      break;
    }

    if (!(await waitWithToken(VOTING_POLL_MS, token))) return;
  }

  if (!isRunActive(token)) return;
  await closeVotingForResults(token);
}

async function closeVotingForResults(token, forcedWinnerId = null) {
  if (!state?.matchup || !state?.tournament) return false;

  try {
    updateState(
      await hostApi(`/api/matchups/${state.matchup.id}/close-voting`, {
        method: "POST",
        body: {
          tournamentId: state.tournament.id,
          winnerSongId: forcedWinnerId
        }
      })
    );

    tiePanel.classList.add("hidden");
    return true;
  } catch (error) {
    if (error.status === 409 && error.data?.tie) {
      automationPaused = true;
      automationRunning = false;
      automationToken++;

      tiePanel.classList.remove("hidden");
      tieAButton.textContent = `Choose ${state.matchup.songA.title}`;
      tieBButton.textContent = `Choose ${state.matchup.songB.title}`;
      renderAutomationStatus();
      setStatus("Voting is tied. Choose the winner to continue.", true);
      return false;
    }

    throw error;
  }
}

async function waitForResultsAndAdvance(token) {
  if (!isRunActive(token)) return;

  let remaining = phaseRemainingMs();

  if (remaining == null) {
    remaining = 6000;
  }

  if (!(await waitWithToken(remaining, token))) return;

  updateState(
    await hostApi(`/api/tournaments/${state.tournament.id}/advance`, {
      method: "POST"
    })
  );

  await waitWithToken(700, token);
}

async function runAutomaticGame() {
  if (automationRunning || automationPaused) return;
  if (!state?.tournament || state.tournament.status !== "active") return;

  const token = ++automationToken;
  automationRunning = true;
  renderAutomationStatus();

  try {
    while (isRunActive(token)) {
      await refreshState();

      const tournament = state?.tournament;

      if (!tournament || tournament.status !== "active") {
        break;
      }

      if (!state.matchup && tournament.state !== "results") {
        break;
      }

      if (tournament.state === "results") {
        await waitForResultsAndAdvance(token);
        continue;
      }

      if (tournament.state === "voting") {
        await monitorVoting(token);
        continue;
      }

      if (tournament.state === "song_b") {
        await runSongB(token);
        continue;
      }

      if (
        tournament.state === "waiting" &&
        tournament.phaseDetail === "countdown_b"
      ) {
        await runCountdownB(token);
        continue;
      }

      if (tournament.state === "song_a") {
        await runSongA(token);
        continue;
      }

      // A fresh matchup or a recovered waiting state always starts at Song A.
      await setMatchState("waiting", "countdown_a", COUNTDOWN_SECONDS);

      if (!(await waitWithToken(COUNTDOWN_SECONDS * 1000, token))) {
        break;
      }

      await runSongA(token);
    }
  } catch (error) {
    if (token === automationToken) {
      automationPaused = true;
      setStatus(error.message, true);
    }
  } finally {
    if (token === automationToken) {
      automationRunning = false;
    }

    renderAutomationStatus();
  }
}

function renderAutomationStatus() {
  if (automationRunning && !automationPaused) {
    automationStatus.textContent = "Running";
    automationStatus.style.color = "var(--success)";
    return;
  }

  automationStatus.textContent = "Paused";
  automationStatus.style.color = "";
}

function renderState() {
  const tournament = state?.tournament;
  const matchup = state?.matchup;

  activeControls.classList.toggle("hidden", !tournament);
  tournamentSetup.classList.toggle(
    "hidden",
    Boolean(tournament && tournament.status === "active")
  );

  if (!tournament) {
    renderAutomationStatus();
    return;
  }

  currentTournamentName.textContent = tournament.name;
  currentTournamentMeta.textContent =
    `${tournament.tournamentType.replaceAll("_", " ")} • ${tournament.status}`;
  stateLabel.textContent = tournament.phaseDetail || tournament.state;
  audienceCount.textContent = state.audienceCount ?? 0;
  voteCount.textContent = state.votesSubmitted ?? 0;

  startTournamentButton.classList.toggle("hidden", tournament.status !== "setup");
  resumeAutomationButton.disabled = tournament.status !== "active";
  pauseAutomationButton.disabled = tournament.status !== "active";
  skipAudioButton.disabled = !["song_a", "song_b"].includes(tournament.state);
  manualAdvanceButton.disabled = tournament.state !== "results";
  manualCloseVotingButton.disabled = tournament.state !== "voting";

  if (matchup) {
    songATitle.textContent = matchup.songA.title;
    songBTitle.textContent = matchup.songB.title;
  } else {
    songATitle.textContent = "—";
    songBTitle.textContent = "—";
  }

  songACard.classList.toggle("active", tournament.state === "song_a");
  songBCard.classList.toggle("active", tournament.state === "song_b");

  if (tournament.state !== "voting") {
    tiePanel.classList.add("hidden");
  }

  renderAutomationStatus();
  updatePhaseClock();
}

async function resolveTie(winnerSongId) {
  if (!state?.matchup) return;

  try {
    const closed = await closeVotingForResults(automationToken, winnerSongId);
    if (!closed) return;

    automationPaused = false;
    setStatus("Tie resolved. Automatic game continuing.");
    void runAutomaticGame();
  } catch (error) {
    setStatus(error.message, true);
  }
}

accessForm.addEventListener("submit", async event => {
  event.preventDefault();
  setStatus("");

  try {
    await unlockHost(new FormData(accessForm).get("hostSecret"));
    startHostPolling();
    setStatus("Host access granted.");
  } catch (error) {
    hostSecret = "";
    sessionStorage.removeItem(HOST_SECRET_KEY);
    hideHost();
    setStatus(error.message, true);
  }
});

lockHostButton.addEventListener("click", () => {
  pauseAutomation("Host locked.");

  if (stopPolling) {
    stopPolling();
    stopPolling = null;
  }

  hostSecret = "";
  hostSecretInput.value = "";
  sessionStorage.removeItem(HOST_SECRET_KEY);
  hideHost();
});

songChoices.addEventListener("change", updateSelectedCount);

tournamentForm.addEventListener("submit", async event => {
  event.preventDefault();
  setStatus("");

  try {
    await createTournamentFromForm(tournamentForm, hostSecret);
    await Promise.all([
      refreshState(),
      loadAdminSongs()
    ]);
    setStatus("Tournament created. Click Start Tournament when the display and speakers are ready.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

uploadCodeForm.addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const created = await hostApi("/api/upload-codes", {
      method: "POST"
    });

    await loadUploadCodes();

    const displayCode = formatDisplayCode(created.code);
    setStatus(`Upload code created: ${displayCode}`);

    try {
      await copyText(displayCode);
      setStatus(`Upload code created and copied: ${displayCode}`);
    } catch {
      // Clipboard permission is optional.
    }
  } catch (error) {
    setStatus(error.message, true);
  }
});

refreshUploadCodesButton.addEventListener("click", async () => {
  try {
    await loadUploadCodes();
    setStatus("Upload code status refreshed.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

exportUploadCodesCsvButton.addEventListener("click", () => {
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

uploadCodeList.addEventListener("click", async event => {
  const button = event.target.closest("button[data-upload-action][data-upload-code]");
  if (!button) return;

  const action = button.dataset.uploadAction;
  const code = button.dataset.uploadCode;
  if (!code) return;

  if (action === "copy") {
    try {
      await copyText(formatDisplayCode(code));
      setStatus(`Copied ${formatDisplayCode(code)}.`);
    } catch (error) {
      setStatus(error.message || "Unable to copy code.", true);
    }
    return;
  }

  if (action !== "delete") return;
  if (!confirm(`Delete upload code ${formatDisplayCode(code)}?`)) return;

  try {
    await hostApi(`/api/upload-codes/${encodeURIComponent(code)}`, {
      method: "DELETE"
    });
    await loadUploadCodes();
    setStatus("Upload code deleted.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

songAdminList.addEventListener("click", async event => {
  const button = event.target.closest("button[data-song-id]");
  if (!button) return;

  const songId = button.dataset.songId;
  if (!songId) return;
  if (!confirm("Delete this song from the library?")) return;

  try {
    await hostApi(`/api/songs/${encodeURIComponent(songId)}`, {
      method: "DELETE"
    });

    await Promise.all([
      loadSongChoices(songChoices, hostSecret),
      loadAdminSongs(),
      refreshState()
    ]);

    updateSelectedCount();
    setStatus("Song deleted.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

startTournamentButton.addEventListener("click", async () => {
  if (!state?.tournament) return;

  try {
    setStatus("Enabling audio and starting tournament…");
    await unlockPlayback();

    updateState(
      await hostApi(`/api/tournaments/${state.tournament.id}/start`, {
        method: "POST"
      })
    );

    automationPaused = false;
    setStatus("Tournament started. Automatic game is running.");
    void runAutomaticGame();
  } catch (error) {
    automationPaused = true;
    renderAutomationStatus();
    setStatus(error.message, true);
  }
});

enableAudioButton.addEventListener("click", async () => {
  try {
    await unlockPlayback();
    setStatus("Audio is enabled for automatic playback.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

resumeAutomationButton.addEventListener("click", async () => {
  if (!state?.tournament || state.tournament.status !== "active") return;

  try {
    await unlockPlayback();
    automationPaused = false;
    setStatus("Automatic game resumed.");
    void runAutomaticGame();
  } catch (error) {
    setStatus(error.message, true);
  }
});

pauseAutomationButton.addEventListener("click", () => {
  pauseAutomation();
});

skipAudioButton.addEventListener("click", () => {
  stopPlayback();
  setStatus("Current song skipped.");
});

tieAButton.addEventListener("click", () => resolveTie(state?.matchup?.songA.id));
tieBButton.addEventListener("click", () => resolveTie(state?.matchup?.songB.id));

manualRestartMatchButton.addEventListener("click", async () => {
  if (!state?.matchup) return;

  pauseAutomation("Manual recovery mode enabled.");

  try {
    await setMatchState("waiting", "ready");
    setStatus("Current matchup reset to ready. Click Resume Automatic Game.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

manualOpenVotingButton.addEventListener("click", async () => {
  if (!state?.matchup) return;

  pauseAutomation("Manual voting mode enabled.");

  try {
    await setMatchState("voting", "voting", VOTING_SECONDS);
    setStatus("Voting opened for 30 seconds. Resume Automatic Game to auto-close it.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

manualCloseVotingButton.addEventListener("click", async () => {
  if (!state?.matchup) return;

  pauseAutomation("Manual recovery mode enabled.");

  try {
    await closeVotingForResults(automationToken);
  } catch (error) {
    setStatus(error.message, true);
  }
});

manualAdvanceButton.addEventListener("click", async () => {
  if (!state?.tournament) return;

  pauseAutomation("Manual recovery mode enabled.");

  try {
    updateState(
      await hostApi(`/api/tournaments/${state.tournament.id}/advance`, {
        method: "POST"
      })
    );
    setStatus("Advanced to the next matchup. Click Resume Automatic Game.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

deleteTournamentButton.addEventListener("click", async () => {
  if (!state?.tournament) return;
  if (!confirm("Delete the current unfinished tournament?")) return;

  pauseAutomation("Tournament automation stopped.");

  try {
    await hostApi(`/api/tournaments/${state.tournament.id}`, {
      method: "DELETE"
    });

    await Promise.all([
      refreshState(),
      loadSongChoices(songChoices, hostSecret),
      loadAdminSongs()
    ]);

    updateSelectedCount();
    setStatus("Tournament deleted.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function boot() {
  hideHost();

  if (!hostSecret) return;

  try {
    await unlockHost(hostSecret);
    startHostPolling();
    setStatus("Host session restored.");
  } catch (error) {
    hostSecret = "";
    sessionStorage.removeItem(HOST_SECRET_KEY);
    hideHost();
    setStatus("Saved host secret was rejected. Enter it again.", true);
  }
}

setInterval(updatePhaseClock, 200);
boot().catch(error => setStatus(error.message, true));
