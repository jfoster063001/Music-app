import { api } from "../shared/api.js";
import { startPolling } from "../shared/state.js";

const AUDIENCE_ID_KEY = "songClashAudienceId";
const AUDIENCE_NAME_KEY = "songClashAudienceName";

let audienceId = localStorage.getItem(AUDIENCE_ID_KEY);

if (!audienceId) {
  audienceId = crypto.randomUUID();
  localStorage.setItem(AUDIENCE_ID_KEY, audienceId);
}

let state = null;
let stateReceivedAt = Date.now();

const noTournamentScreen = document.querySelector("#noTournamentScreen");
const joinScreen = document.querySelector("#joinScreen");
const waitingScreen = document.querySelector("#waitingScreen");
const votingScreen = document.querySelector("#votingScreen");
const resultScreen = document.querySelector("#resultScreen");
const completedScreen = document.querySelector("#completedScreen");

const joinForm = document.querySelector("#joinForm");
const displayNameInput = document.querySelector("#displayNameInput");
const waitingEyebrow = document.querySelector("#waitingEyebrow");
const waitingMessage = document.querySelector("#waitingMessage");
const waitingCountdown = document.querySelector("#waitingCountdown");
const waitingPulse = document.querySelector("#waitingPulse");
const votingCountdown = document.querySelector("#votingCountdown");
const songAButton = document.querySelector("#songAButton");
const songBButton = document.querySelector("#songBButton");
const liveVoteCount = document.querySelector("#liveVoteCount");
const winnerName = document.querySelector("#winnerName");
const finalVoteCount = document.querySelector("#finalVoteCount");
const votingMessage = document.querySelector("#votingMessage");

const savedName = localStorage.getItem(AUDIENCE_NAME_KEY);
if (savedName && savedName !== "Audience") {
  displayNameInput.value = savedName;
}

function updateState(nextState) {
  state = nextState;
  stateReceivedAt = Date.now();
  render();
}

function votingPollInterval() {
  const phase = state?.tournament?.state;

  if (!state?.tournament) return 2500;
  if (phase === "voting") return 700;
  if (phase === "results") return 900;
  if (state.tournament.phaseDetail?.startsWith("countdown_")) return 700;
  return 1600;
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

function remainingSeconds() {
  const remaining = phaseRemainingMs();
  return remaining == null ? null : Math.max(0, Math.ceil(remaining / 1000));
}

function setMessage(message, isError = false) {
  votingMessage.textContent = message || "";
  votingMessage.classList.toggle("error", isError);
}

async function refresh() {
  updateState(
    await api(`/api/voting/state?audienceId=${encodeURIComponent(audienceId)}`)
  );
}

function hideScreens() {
  for (const element of [
    noTournamentScreen,
    joinScreen,
    waitingScreen,
    votingScreen,
    resultScreen,
    completedScreen
  ]) {
    element.classList.add("hidden");
  }
}

function renderClock() {
  if (!state?.tournament) return;

  const seconds = remainingSeconds();
  const detail = state.tournament.phaseDetail;

  if (detail === "countdown_a" || detail === "countdown_b") {
    waitingCountdown.textContent = Math.max(1, seconds ?? 3);
  } else {
    waitingCountdown.textContent = "";
  }

  if (state.tournament.state === "voting") {
    votingCountdown.textContent = seconds ?? 30;
  }
}

function render() {
  hideScreens();
  setMessage("");

  if (!state?.tournament) {
    noTournamentScreen.classList.remove("hidden");
    return;
  }

  const tournament = state.tournament;

  if (tournament.state === "completed") {
    completedScreen.classList.remove("hidden");
    return;
  }

  if (!state.viewerJoined) {
    joinScreen.classList.remove("hidden");
    return;
  }

  if (tournament.state === "voting" && state.matchup) {
    votingScreen.classList.remove("hidden");

    liveVoteCount.textContent =
      `${state.votesSubmitted ?? 0} of ${state.audienceCount ?? 0} active audience votes submitted`;

    songAButton.innerHTML = `<strong>${escapeHtml(state.matchup.songA.title)}</strong>`;
    songBButton.innerHTML = `<strong>${escapeHtml(state.matchup.songB.title)}</strong>`;

    songAButton.disabled = Boolean(state.viewerVoted);
    songBButton.disabled = Boolean(state.viewerVoted);

    if (state.viewerVoted) {
      setMessage("✓ Vote submitted. Waiting for everyone else…");
    }

    renderClock();
    return;
  }

  if (tournament.state === "results" && state.matchup) {
    resultScreen.classList.remove("hidden");

    const winner = state.matchup.winnerSongId === state.matchup.songA.id
      ? state.matchup.songA
      : state.matchup.songB;

    winnerName.textContent = winner
      ? `${winner.title} wins!`
      : "Results are in!";

    finalVoteCount.textContent =
      `${state.votesSubmitted ?? 0} total vote${state.votesSubmitted === 1 ? "" : "s"}`;

    return;
  }

  waitingScreen.classList.remove("hidden");
  waitingPulse.classList.remove("hidden");
  waitingEyebrow.textContent = "GET READY";

  if (tournament.phaseDetail === "countdown_a") {
    waitingMessage.textContent = "Song A starts in";
    waitingPulse.classList.add("hidden");
  } else if (tournament.phaseDetail === "countdown_b") {
    waitingMessage.textContent = "Song B starts in";
    waitingPulse.classList.add("hidden");
  } else if (tournament.state === "song_a") {
    waitingMessage.textContent = "Listen to Song A";
  } else if (tournament.state === "song_b") {
    waitingMessage.textContent = "Listen to Song B";
  } else if (tournament.state === "setup") {
    waitingEyebrow.textContent = "JOINED";
    waitingMessage.textContent = "The host is setting up the tournament";
  } else {
    waitingMessage.textContent = "Waiting for the next matchup";
  }

  renderClock();
}

joinForm.addEventListener("submit", async event => {
  event.preventDefault();
  setMessage("");

  const displayName = String(
    new FormData(joinForm).get("displayName") || ""
  ).trim();

  try {
    updateState(
      await api("/api/voting/join", {
        method: "POST",
        body: {
          audienceId,
          displayName
        }
      })
    );

    localStorage.setItem(AUDIENCE_NAME_KEY, displayName || "Audience");
  } catch (error) {
    setMessage(error.message, true);
  }
});

songAButton.addEventListener("click", () => vote(state?.matchup?.songA.id));
songBButton.addEventListener("click", () => vote(state?.matchup?.songB.id));

async function vote(selectedSongId) {
  if (!selectedSongId || !state?.matchup) return;

  songAButton.disabled = true;
  songBButton.disabled = true;
  setMessage("Submitting vote…");

  try {
    updateState(
      await api("/api/voting/vote", {
        method: "POST",
        body: {
          audienceId,
          matchupId: state.matchup.id,
          selectedSongId
        }
      })
    );

    setMessage("✓ Vote submitted. Waiting for everyone else…");
  } catch (error) {
    songAButton.disabled = false;
    songBButton.disabled = false;
    setMessage(error.message, true);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

setInterval(renderClock, 100);

startPolling(refresh, {
  interval: votingPollInterval,
  hiddenInterval: 8000,
  pauseWhenHidden: false
});