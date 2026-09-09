let audio = null;

function getAudio() {
  if (!audio) {
    audio = new Audio();
    audio.preload = "metadata";
  }
  return audio;
}

export async function playSong(songId) {
  const player = getAudio();

  if (player.src !== new URL(`/api/songs/${songId}/stream`, location.origin).href) {
    player.src = `/api/songs/${songId}/stream`;
  }

  await player.play();
}

export function pausePlayback() {
  getAudio().pause();
}

export function stopPlayback() {
  const player = getAudio();
  player.pause();
  player.currentTime = 0;
}
