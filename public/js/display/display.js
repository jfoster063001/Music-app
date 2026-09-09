import { api } from "../shared/api.js";
import { startPolling } from "../shared/state.js";

const tournamentName = document.querySelector("#tournamentName");
const stateText = document.querySelector("#stateText");
const songA = document.querySelector("#songA");
const songB = document.querySelector("#songB");
const artistA = document.querySelector("#artistA");
const artistB = document.querySelector("#artistB");
const voteProgress = document.querySelector("#voteProgress");
const results = document.querySelector("#results");
const standings = document.querySelector("#standings");

let latestState = null;

function percent(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

async function refresh() {
  latestState = await api("/api/tournaments/state");
  render(latestState);
}

function displayPollInterval() {
  const phase = latestState?.tournament?.state;
  return phase === "voting" || phase === "results" ? 1500 : 3500;
}

function render(state) {
  if (!state.tournament) {
    tournamentName.textContent = "SONG CLASH";
    stateText.textContent = "Waiting for the next tournament";
    songA.textContent = "—";
    songB.textContent = "—";
    results.classList.add("hidden");
    return;
  }

  tournamentName.textContent = state.tournament.name;
  stateText.textContent = state.tournament.state.replaceAll("_", " ").toUpperCase();

  if (state.matchup) {
    songA.textContent = state.matchup.songA.title;
    artistA.textContent = state.matchup.songA.artist;
    songB.textContent = state.matchup.songB.title;
    artistB.textContent = state.matchup.songB.artist;
  }

  voteProgress.textContent =
    (state.tournament.state === "voting" || state.tournament.state === "results")
      ? `${state.votesSubmitted} of ${state.audienceCount} vote${state.audienceCount === 1 ? "" : "s"} submitted`
      : "";

  if (state.tournament.state === "results" && state.matchup) {
    const aVotes = state.voteCounts?.songA || 0;
    const bVotes = state.voteCounts?.songB || 0;
    const total = aVotes + bVotes;

    results.classList.remove("hidden");
    results.innerHTML = `
      <h2>Results</h2>
      <div class="result-row">
        <span>${escapeHtml(state.matchup.songA.title)}</span>
        <strong>${percent(aVotes, total)}%</strong>
      </div>
      <div class="result-row">
        <span>${escapeHtml(state.matchup.songB.title)}</span>
        <strong>${percent(bVotes, total)}%</strong>
      </div>
    `;
  } else {
    results.classList.add("hidden");
  }

  if (state.tournament.state === "completed" && state.standings) {
    standings.innerHTML = state.standings.map((song, index) => `
      <div class="standing-row">
        <strong>#${index + 1}</strong>
        <span>${escapeHtml(song.title)} — ${escapeHtml(song.artist)}</span>
        <span>${song.wins}-${song.losses}</span>
      </div>
    `).join("");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

startPolling(refresh, {
  interval: displayPollInterval,
  hiddenInterval: 8000,
  pauseWhenHidden: true
});
