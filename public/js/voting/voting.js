import { api } from "../shared/api.js";
import { startPolling } from "../shared/state.js";

const audienceIdKey = "songClashAudienceId";
const audienceNameKey = "songClashAudienceName";

let audienceId = localStorage.getItem(audienceIdKey);
if (!audienceId) {
  audienceId = crypto.randomUUID();
  localStorage.setItem(audienceIdKey, audienceId);
}

let joined = Boolean(localStorage.getItem(audienceNameKey));
let state = null;

function votingPollInterval() {
  const phase = state?.tournament?.state;

  if (!state?.tournament || phase === "setup" || phase === "waiting") {
    return 3500;
  }

  if (phase === "voting" && !state.viewerVoted) {
    return 1400;
  }

  if (phase === "results") {
    return 1700;
  }

  return 2500;
}

const joinScreen = document.querySelector("#joinScreen");
const waitingScreen = document.querySelector("#waitingScreen");
const votingScreen = document.querySelector("#votingScreen");
const resultScreen = document.querySelector("#resultScreen");
const noTournamentScreen = document.querySelector("#noTournamentScreen");

const joinForm = document.querySelector("#joinForm");
const songAButton = document.querySelector("#songAButton");
const songBButton = document.querySelector("#songBButton");
const votingMessage = document.querySelector("#votingMessage");
const liveVoteCount = document.querySelector("#liveVoteCount");

joinForm.addEventListener("submit", async event => {
  event.preventDefault();

  const displayName = new FormData(joinForm).get("displayName")?.trim();

  try {
    await api("/api/voting/join", {
      method: "POST",
      body: {
        audienceId,
        displayName
      }
    });

    localStorage.setItem(audienceNameKey, displayName || "Audience");
    joined = true;
    await refresh();
  } catch (error) {
    votingMessage.textContent = error.message;
  }
});

songAButton.addEventListener("click", () => vote(state.matchup.songA.id));
songBButton.addEventListener("click", () => vote(state.matchup.songB.id));

async function vote(selectedSongId) {
  try {
    state = await api("/api/voting/vote", {
      method: "POST",
      body: {
        audienceId,
        matchupId: state.matchup.id,
        selectedSongId
      }
    });

    render();
  } catch (error) {
    votingMessage.textContent = error.message;
  }
}

async function refresh() {
  state = await api(
    `/api/voting/state?audienceId=${encodeURIComponent(audienceId)}`
  );

  render();
}

function hideScreens() {
  for (const element of [
    joinScreen,
    waitingScreen,
    votingScreen,
    resultScreen,
    noTournamentScreen
  ]) {
    element.classList.add("hidden");
  }
}

function render() {
  hideScreens();
  votingMessage.textContent = "";

  if (!state?.tournament) {
    noTournamentScreen.classList.remove("hidden");
    return;
  }

  if (!joined) {
    joinScreen.classList.remove("hidden");
    return;
  }

  const tournamentState = state.tournament.state;

  if (tournamentState === "voting" && state.matchup) {
    votingScreen.classList.remove("hidden");

    liveVoteCount.textContent =
      `${state.votesSubmitted ?? 0} of ${state.audienceCount ?? 0} votes submitted`;

    songAButton.innerHTML = `
      <strong>${escapeHtml(state.matchup.songA.title)}</strong>
      <span>${escapeHtml(state.matchup.songA.artist)}</span>
    `;

    songBButton.innerHTML = `
      <strong>${escapeHtml(state.matchup.songB.title)}</strong>
      <span>${escapeHtml(state.matchup.songB.artist)}</span>
    `;

    songAButton.disabled = state.viewerVoted;
    songBButton.disabled = state.viewerVoted;

    if (state.viewerVoted) {
      votingMessage.textContent = "✓ Vote submitted. Waiting for results…";
    }

    return;
  }

  if (tournamentState === "results" && state.matchup) {
    resultScreen.classList.remove("hidden");

    const winner = state.matchup.winnerSongId === state.matchup.songA.id
      ? state.matchup.songA
      : state.matchup.songB;

    document.querySelector("#winnerName").textContent =
      winner ? winner.title : "Results are in";

    votingMessage.textContent =
      `Final vote count: ${state.votesSubmitted ?? 0} of ${state.audienceCount ?? 0}`;

    return;
  }

  liveVoteCount.textContent = "";

  waitingScreen.classList.remove("hidden");

  const messages = {
    setup: "The host is setting up the tournament.",
    waiting: "Waiting for the next matchup.",
    song_a: "Listen to Song A.",
    song_b: "Listen to Song B.",
    completed: "The tournament is complete!"
  };

  document.querySelector("#waitingMessage").textContent =
    messages[tournamentState] || "Waiting for the host.";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

startPolling(refresh, {
  interval: votingPollInterval,
  hiddenInterval: 10000,
  pauseWhenHidden: true
});
