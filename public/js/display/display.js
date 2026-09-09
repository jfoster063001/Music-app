import { api } from "../shared/api.js";
import { startPolling } from "../shared/state.js";

const tournamentName = document.querySelector("#tournamentName");
const stateText = document.querySelector("#stateText");
const countdownPanel = document.querySelector("#countdownPanel");
const countdownLabel = document.querySelector("#countdownLabel");
const countdownValue = document.querySelector("#countdownValue");
const matchupPanel = document.querySelector("#matchupPanel");
const songA = document.querySelector("#songA");
const songB = document.querySelector("#songB");
const songACard = document.querySelector("#displaySongACard");
const songBCard = document.querySelector("#displaySongBCard");
const votingBanner = document.querySelector("#votingBanner");
const votingTimer = document.querySelector("#votingTimer");
const voteProgress = document.querySelector("#voteProgress");
const resultsPanel = document.querySelector("#resultsPanel");
const standings = document.querySelector("#standings");

const resultATitle = document.querySelector("#resultATitle");
const resultBTitle = document.querySelector("#resultBTitle");
const resultABar = document.querySelector("#resultABar");
const resultBBar = document.querySelector("#resultBBar");
const resultACount = document.querySelector("#resultACount");
const resultBCount = document.querySelector("#resultBCount");
const resultAPercent = document.querySelector("#resultAPercent");
const resultBPercent = document.querySelector("#resultBPercent");
const resultWinner = document.querySelector("#resultWinner");

let latestState = null;
let stateReceivedAt = Date.now();
let animatedMatchupId = null;
let animationToken = 0;

function updateState(nextState) {
  latestState = nextState;
  stateReceivedAt = Date.now();
  render(nextState);
}

async function refresh() {
  updateState(await api("/api/tournaments/state"));
}

function displayPollInterval() {
  const phase = latestState?.tournament?.state;

  if (phase === "voting" || phase === "results") return 650;
  if (latestState?.tournament?.phaseDetail?.startsWith("countdown_")) return 650;
  return 1400;
}

function phaseRemainingMs() {
  const end = Date.parse(latestState?.tournament?.phaseEndsAt || "");
  const serverAtReceive = Date.parse(latestState?.serverNow || "");

  if (!Number.isFinite(end) || !Number.isFinite(serverAtReceive)) {
    return null;
  }

  const estimatedServerNow = serverAtReceive + (Date.now() - stateReceivedAt);
  return Math.max(0, end - estimatedServerNow);
}

function countdownSeconds() {
  const remaining = phaseRemainingMs();
  return remaining == null ? null : Math.max(0, Math.ceil(remaining / 1000));
}

function renderLiveClock() {
  const tournament = latestState?.tournament;
  if (!tournament) return;

  const seconds = countdownSeconds();

  if (tournament.phaseDetail === "countdown_a") {
    countdownPanel.classList.remove("hidden");
    countdownLabel.textContent = "SONG A STARTS IN";
    countdownValue.textContent = Math.max(1, seconds ?? 3);
  } else if (tournament.phaseDetail === "countdown_b") {
    countdownPanel.classList.remove("hidden");
    countdownLabel.textContent = "SONG B STARTS IN";
    countdownValue.textContent = Math.max(1, seconds ?? 3);
  } else {
    countdownPanel.classList.add("hidden");
  }

  if (tournament.state === "voting") {
    votingTimer.textContent = seconds ?? 30;
  }
}

function phaseTitle(tournament) {
  if (tournament.phaseDetail === "countdown_a") return "Get ready for Song A";
  if (tournament.phaseDetail === "countdown_b") return "Get ready for Song B";
  if (tournament.state === "song_a") return "Now playing: Song A";
  if (tournament.state === "song_b") return "Now playing: Song B";
  if (tournament.state === "voting") return "Voting is open";
  if (tournament.state === "results") return "Results";
  if (tournament.state === "setup") return "Tournament setup";
  if (tournament.state === "waiting") return "Next matchup";
  if (tournament.state === "completed") return "Tournament complete";
  return tournament.state.replaceAll("_", " ");
}

function render(state) {
  if (!state?.tournament) {
    tournamentName.textContent = "SONG CLASH";
    stateText.textContent = "Waiting for the next tournament";
    songA.textContent = "—";
    songB.textContent = "—";
    countdownPanel.classList.add("hidden");
    votingBanner.classList.add("hidden");
    resultsPanel.classList.add("hidden");
    standings.innerHTML = "";
    return;
  }

  const tournament = state.tournament;
  const matchup = state.matchup;

  tournamentName.textContent = tournament.name;
  stateText.textContent = phaseTitle(tournament).toUpperCase();

  matchupPanel.classList.toggle("hidden", tournament.state === "completed");

  if (matchup) {
    songA.textContent = matchup.songA.title;
    songB.textContent = matchup.songB.title;
  } else {
    songA.textContent = "—";
    songB.textContent = "—";
  }

  songACard.classList.toggle("active", tournament.state === "song_a");
  songBCard.classList.toggle("active", tournament.state === "song_b");
  songACard.classList.toggle("inactive", tournament.state === "song_b");
  songBCard.classList.toggle("inactive", tournament.state === "song_a");

  const voting = tournament.state === "voting";
  votingBanner.classList.toggle("hidden", !voting);

  voteProgress.textContent =
    voting || tournament.state === "results"
      ? `${state.votesSubmitted ?? 0} of ${state.audienceCount ?? 0} active audience vote${state.audienceCount === 1 ? "" : "s"} submitted`
      : "";

  if (tournament.state === "results" && matchup) {
    resultsPanel.classList.remove("hidden");

    if (animatedMatchupId !== matchup.id) {
      animatedMatchupId = matchup.id;
      void animateResults(state, ++animationToken);
    }
  } else {
    resultsPanel.classList.add("hidden");
    animationToken++;

    if (tournament.state !== "results") {
      animatedMatchupId = null;
    }
  }

  if (tournament.state === "completed" && state.standings) {
    standings.innerHTML = `
      <h2>Final Standings</h2>
      ${state.standings.map((song, index) => `
        <div class="standing-row">
          <strong>#${index + 1}</strong>
          <span>${escapeHtml(song.title)} — ${escapeHtml(song.artist)}</span>
          <span>${song.wins}-${song.losses}</span>
        </div>
      `).join("")}
    `;
  } else {
    standings.innerHTML = "";
  }

  renderLiveClock();
}

function shuffle(values) {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function renderResultNumbers(shownA, shownB, finalTotal) {
  const aPercent = finalTotal ? Math.round((shownA / finalTotal) * 100) : 0;
  const bPercent = finalTotal ? Math.round((shownB / finalTotal) * 100) : 0;

  resultACount.textContent = shownA;
  resultBCount.textContent = shownB;
  resultAPercent.textContent = `${aPercent}%`;
  resultBPercent.textContent = `${bPercent}%`;
  resultABar.style.width = `${aPercent}%`;
  resultBBar.style.width = `${bPercent}%`;
}

async function animateResults(state, token) {
  const matchup = state.matchup;
  const aVotes = Number(state.voteCounts?.songA || 0);
  const bVotes = Number(state.voteCounts?.songB || 0);
  const finalTotal = aVotes + bVotes;

  resultATitle.textContent = matchup.songA.title;
  resultBTitle.textContent = matchup.songB.title;
  resultWinner.textContent = "";
  resultWinner.classList.remove("reveal");
  renderResultNumbers(0, 0, Math.max(finalTotal, 1));

  const voteSequence = shuffle([
    ...Array(aVotes).fill("a"),
    ...Array(bVotes).fill("b")
  ]);

  const stepDelay = finalTotal
    ? Math.max(60, Math.min(260, Math.floor(3400 / finalTotal)))
    : 500;

  let shownA = 0;
  let shownB = 0;

  for (const vote of voteSequence) {
    if (token !== animationToken) return;

    if (vote === "a") shownA++;
    if (vote === "b") shownB++;

    renderResultNumbers(shownA, shownB, Math.max(finalTotal, 1));
    await new Promise(resolve => setTimeout(resolve, stepDelay));
  }

  if (token !== animationToken) return;

  const winner = matchup.winnerSongId === matchup.songA.id
    ? matchup.songA
    : matchup.songB;

  resultWinner.textContent = winner
    ? `🏆 ${winner.title} wins!`
    : "Results finalized";

  void resultWinner.offsetWidth;
  resultWinner.classList.add("reveal");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

setInterval(renderLiveClock, 100);

startPolling(refresh, {
  interval: displayPollInterval,
  hiddenInterval: 5000,
  pauseWhenHidden: false
});