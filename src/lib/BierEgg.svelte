<script>
  // Kleines Osterei auf der Statistikseite: Wie viele Biere pro Fahrt im Bordbistro?
  // Eingabe immer genau mit einer Kommastelle (z. B. 2,9). Wer die richtige Zahl trifft, bekommt den Song.
  // Der Song läuft über alle Seiten weiter (siehe music.svelte.js und die kleine Anzeige MiniPlayer).
  import { music, playSong, toggleSong, seekSong } from "./music.svelte.js";

  const ANSWER = "2,9";

  let value = $state("");
  let state = $state("idle"); // idle | wrong | right
  let hint = $state("");
  let shake = $state(false);

  const complete = $derived(/^\d,\d$/.test(value));

  // Nur Ziffern, genau zwei, das Komma setzt sich nach der ersten Ziffer von selbst
  function onInput(e) {
    const digits = e.currentTarget.value.replace(/\D/g, "").slice(0, 2);
    value = digits.length > 1 ? `${digits[0]},${digits[1]}` : digits;
    e.currentTarget.value = value;
    if (state === "wrong") {
      state = "idle";
      hint = "";
    }
  }

  const num = (s) => parseFloat(s.replace(",", "."));

  function guess(e) {
    e?.preventDefault();
    if (!complete) return;
    if (value === ANSWER) {
      state = "right";
      hint = "";
      playSong();
      return;
    }
    state = "wrong";
    const d = Math.abs(num(value) - num(ANSWER));
    hint = d <= 0.3 ? "Heiß, fast!" : d <= 1 ? "Warm." : d <= 2.5 ? "Eher kühl." : "Eiskalt.";
    shake = false;
    requestAnimationFrame(() => (shake = true));
  }

  function seek(e) {
    seekSong(+e.currentTarget.value / 1000);
  }

  // Noch mal raten: der Song läuft weiter, er wird über die kleine Anzeige ausgeschaltet
  function again() {
    state = "idle";
    value = "";
  }
</script>

<section class="egg" class:right={state === "right"} aria-labelledby="egg-title">
  <div class="left">
    <p class="kicker">Im Bordbistro</p>
    <h2 id="egg-title">Ø Biere pro Fahrt</h2>
    <p class="sub">Wie viele waren es im Schnitt? Tipp eine Zahl mit einer Kommastelle.</p>
  </div>

  {#if state !== "right"}
    <form class="guess" onsubmit={guess} class:shake>
      <label class="field">
        <span class="sr">Biere pro Fahrt, eine Kommastelle</span>
        <input
          type="text"
          inputmode="numeric"
          autocomplete="off"
          maxlength="3"
          placeholder="_,_"
          {value}
          oninput={onInput}
          class:bad={state === "wrong"}
          aria-describedby="egg-hint"
        />
      </label>
      <button type="submit" disabled={!complete}>Prost</button>
      <p id="egg-hint" class="hint" aria-live="polite">{hint}</p>
    </form>
  {:else}
    <div class="player">
      <div class="win">
        <b>{ANSWER}</b>
        <span>Genau richtig. Prost!</span>
      </div>
      <div class="now">
        <button type="button" class="pp" onclick={toggleSong} aria-label={music.playing ? "Pause" : "Abspielen"}>
          {#if music.playing}
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
          {:else}
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          {/if}
        </button>
        <div class="meta">
          <b>Bordbistro</b>
          <span>Teuterekordz</span>
          <input type="range" min="0" max="1000" value={Math.round(music.progress * 1000)} oninput={seek} aria-label="Position im Song" />
        </div>
        <div class="eq" class:on={music.playing} aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      {#if music.error}<p class="hint">Der Song lässt sich gerade nicht laden.</p>{/if}
      <button type="button" class="again" onclick={again}>Noch mal raten</button>
    </div>
  {/if}
</section>

<style>
  .egg {
    grid-column: span 12;
    padding: clamp(1.2rem, 1.6vw, 1.7rem);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: clamp(1rem, 3vw, 3rem);
    align-items: center;
    transition: background-color 400ms var(--ease), box-shadow 400ms var(--ease);
  }

  .egg.right {
    background: linear-gradient(135deg, #fff, #fff4f5);
    box-shadow: inset 0 0 0 1.5px var(--red);
  }

  .kicker {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--red);
    margin-bottom: 0.3rem;
  }

  h2 {
    font-size: clamp(1.5rem, 2.4vw, 2.1rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .sub {
    margin-top: 0.4rem;
    color: var(--muted);
    max-width: 28rem;
  }

  .guess {
    display: grid;
    grid-template-columns: auto auto;
    justify-content: start;
    align-items: center;
    gap: 0.6rem 0.9rem;
  }

  .field input {
    width: 7.2rem;
    padding: 0.35rem 0.6rem;
    text-align: center;
    font-family: var(--display);
    font-size: 2.6rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    border: 0;
    border-radius: 0.9rem;
    background: var(--panel);
    box-shadow: inset 0 0 0 1.5px var(--line);
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .field input::placeholder {
    color: #b4bac3;
  }

  .field input:focus {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--text);
  }

  .field input.bad {
    box-shadow: inset 0 0 0 2px var(--red);
  }

  .guess button {
    padding: 0.85rem 1.4rem;
    border-radius: 62.4375rem;
    background: var(--red);
    color: #fff;
    font-weight: 800;
    transition: background-color 160ms var(--ease), transform 160ms var(--ease), opacity 160ms var(--ease);
  }

  .guess button:hover:not(:disabled) {
    background: var(--red-dark);
  }

  .guess button:active:not(:disabled) {
    transform: scale(0.95);
  }

  .guess button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .hint {
    grid-column: 1 / -1;
    min-height: 1.4em;
    font-weight: 700;
    color: var(--red);
  }

  .guess.shake {
    animation: shake 420ms var(--ease);
  }

  @keyframes shake {
    20% {
      transform: translateX(-0.4rem);
    }
    45% {
      transform: translateX(0.35rem);
    }
    70% {
      transform: translateX(-0.2rem);
    }
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  /* ---- Richtig geraten: der Song ---- */
  .player {
    display: grid;
    gap: 0.9rem;
  }

  .win {
    display: flex;
    align-items: baseline;
    gap: 0.8rem;
  }

  .win b {
    font-family: var(--display);
    font-size: 3rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--red);
    animation: pop 600ms var(--ease) both;
  }

  .win span {
    font-weight: 700;
    font-size: 1.1rem;
  }

  @keyframes pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
  }

  .now {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
    padding: 0.9rem 1.1rem;
    border-radius: 1rem;
    background: #1a1e26;
    color: #fff;
  }

  .pp {
    width: 3.1rem;
    height: 3.1rem;
    border-radius: 50%;
    background: var(--red);
    color: #fff;
    display: grid;
    place-items: center;
    transition: transform 160ms var(--ease);
  }

  .pp:active {
    transform: scale(0.94);
  }

  .meta {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }

  .meta b {
    font-weight: 800;
  }

  .meta span {
    font-size: 0.85rem;
    color: #b9bfca;
  }

  .meta input {
    width: 100%;
    margin-top: 0.4rem;
    accent-color: var(--red);
  }

  .eq {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 1.8rem;
  }

  .eq i {
    width: 4px;
    height: 20%;
    border-radius: 2px;
    background: var(--red);
    transition: height 200ms var(--ease);
  }

  .eq.on i {
    animation: bar 700ms ease-in-out infinite alternate;
  }

  .eq.on i:nth-child(2) {
    animation-delay: -200ms;
    animation-duration: 560ms;
  }

  .eq.on i:nth-child(3) {
    animation-delay: -400ms;
    animation-duration: 800ms;
  }

  .eq.on i:nth-child(4) {
    animation-delay: -100ms;
    animation-duration: 640ms;
  }

  .eq.on i:nth-child(5) {
    animation-delay: -300ms;
    animation-duration: 760ms;
  }

  @keyframes bar {
    from {
      height: 18%;
    }
    to {
      height: 100%;
    }
  }

  .again {
    justify-self: start;
    font-weight: 700;
    color: var(--muted);
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 0.25rem;
  }

  .again:hover {
    color: var(--red);
  }

  @media (max-width: 760px) {
    .egg {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .guess.shake,
    .win b,
    .eq.on i {
      animation: none;
    }
  }
</style>
