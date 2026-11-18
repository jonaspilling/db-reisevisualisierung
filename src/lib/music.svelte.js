// Der Song aus dem Osterei läuft auf der ganzen Website weiter, auch wenn die Seite gewechselt wird.
// Das Audio-Element lebt hier, außerhalb der Seiten: die kleine Anzeige (MiniPlayer) und das Osterei
// greifen beide auf denselben Zustand zu.
const SONG = "./audio/bordbistro.mp3";

export const music = $state({ active: false, playing: false, progress: 0, error: false });

let audio = null;

function ensure() {
  if (audio) return audio;
  audio = new Audio(SONG);
  audio.addEventListener("timeupdate", () => (music.progress = audio.duration ? audio.currentTime / audio.duration : 0));
  audio.addEventListener("play", () => (music.playing = true));
  audio.addEventListener("pause", () => (music.playing = false));
  // Ist der Song zu Ende, verschwindet die Anzeige von selbst
  audio.addEventListener("ended", () => {
    music.playing = false;
    music.progress = 0;
    music.active = false;
  });
  audio.addEventListener("error", () => {
    music.error = true;
    music.playing = false;
  });
  return audio;
}

// Von vorn abspielen (zählt als Klick der Person, deshalb erlaubt der Browser den Ton)
export function playSong() {
  const a = ensure();
  music.error = false;
  music.active = true;
  a.currentTime = 0;
  a.play().catch(() => {
    music.error = true;
    music.playing = false;
  });
}

export function toggleSong() {
  if (!audio) return playSong();
  if (audio.paused) audio.play().catch(() => (music.error = true));
  else audio.pause();
}

export function seekSong(fraction) {
  if (audio?.duration) audio.currentTime = fraction * audio.duration;
}

// Ausschalten: der Ton stoppt und die kleine Anzeige verschwindet
export function stopSong() {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  music.playing = false;
  music.progress = 0;
  music.active = false;
}
