let audio = null;
let activeResolve = null;
let activeCleanup = null;

const SILENT_AUDIO =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA";

function getAudio() {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
  }

  return audio;
}

function clearActivePlayback(result = null) {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  if (activeResolve) {
    const resolve = activeResolve;
    activeResolve = null;
    resolve(result);
  }
}

export async function unlockPlayback() {
  const player = getAudio();
  const previousMuted = player.muted;

  try {
    player.muted = true;
    player.src = SILENT_AUDIO;
    await player.play();
    player.pause();
    player.currentTime = 0;
    player.removeAttribute("src");
    player.load();
  } finally {
    player.muted = previousMuted;
  }
}

export function playSongToCompletion(songId) {
  const player = getAudio();

  clearActivePlayback("replaced");

  player.pause();
  player.currentTime = 0;
  player.src = `/api/songs/${encodeURIComponent(songId)}/stream`;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      player.removeEventListener("ended", onEnded);
      player.removeEventListener("error", onError);
    };

    const finish = result => {
      cleanup();
      activeCleanup = null;
      activeResolve = null;
      resolve(result);
    };

    const onEnded = () => finish("ended");

    const onError = () => {
      cleanup();
      activeCleanup = null;
      activeResolve = null;
      reject(new Error("The song could not be played."));
    };

    activeResolve = finish;
    activeCleanup = cleanup;

    player.addEventListener("ended", onEnded, { once: true });
    player.addEventListener("error", onError, { once: true });

    player.play().catch(error => {
      cleanup();
      activeCleanup = null;
      activeResolve = null;

      const message = error?.name === "NotAllowedError"
        ? "Browser blocked automatic audio. Click Enable Audio, then Resume Automatic Game."
        : error?.message || "Unable to start audio playback.";

      reject(new Error(message));
    });
  });
}

export function pausePlayback() {
  getAudio().pause();
}

export async function resumePlayback() {
  await getAudio().play();
}

export function stopPlayback() {
  const player = getAudio();
  player.pause();

  try {
    player.currentTime = 0;
  } catch {
    // Ignore if media metadata has not loaded yet.
  }

  clearActivePlayback("stopped");
}

export function isPlaybackPaused() {
  return getAudio().paused;
}
