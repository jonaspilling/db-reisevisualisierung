<script>
  import { ui } from "./ui.svelte.js";

  let dlg;

  // Das Fenster folgt dem Zustand: showModal() sperrt den Hintergrund und gibt Escape und Fokusführung gratis dazu
  $effect(() => {
    if (!dlg) return;
    if (ui.info && !dlg.open) dlg.showModal();
    else if (!ui.info && dlg.open) dlg.close();
  });

  const close = () => (ui.info = false);

  // Klick neben das Fenster schließt es
  function backdrop(e) {
    if (e.target === dlg) close();
  }
</script>

<dialog bind:this={dlg} class="sheet" onclose={close} onclick={backdrop} aria-labelledby="info-title">
  <div class="panel">
    <header class="head">
      <h2 id="info-title">Trasse<b>26</b></h2>
      <button class="x" type="button" onclick={close} aria-label="Info schließen">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none" /></svg>
      </button>
    </header>

    <div class="body">
      <p class="lead">
        Meine Bahnreisen 2026, nachgezeichnet auf dem echten Gleisnetz. Ein Uni-Projekt im Fach Information Design,
        3. Semester.
      </p>

      <section>
        <h3>So bedienst du es</h3>
        <ul class="tips">
          <li><b>Projekt</b> ist die Geschichte zum Scrollen: Zahlen, Vergleiche und Fakten zum Jahr.</li>
          <li><b>Karte</b> ist zum Erkunden: Linien überfahren, Fahrten anklicken, das Jahr abspielen, in 3D kippen.</li>
          <li>Breite und Farbe der Linien zeigen, wie oft ein Abschnitt gefahren wurde.</li>
        </ul>
      </section>

      <section>
        <h3>Kontakt</h3>
        <ul class="links">
          <li><a href="https://github.com/jonaspilling/db-reisevisualisierung" target="_blank" rel="noopener">Code und Projekt auf GitHub</a></li>
          <li><a href="https://github.com/jonaspilling/db-reisevisualisierung/issues" target="_blank" rel="noopener">Fragen und Hinweise als Issue</a></li>
        </ul>
      </section>

      <section>
        <h3>Quellen</h3>
        <p class="small">
          Fahrten: eigene DB-Reisehistorie. Karte: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>,
          © <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a>, Daten ©
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>; Satellit: Esri.
          Kein offizielles Angebot der Deutschen Bahn.
        </p>
      </section>

      <nav class="more" aria-label="Weitere Seiten">
        <a href="#/statistik" onclick={close}>Statistik</a>
        <a href="#/ueber" onclick={close}>So liest du die Karte</a>
      </nav>
    </div>
  </div>
</dialog>

<style>
  .sheet {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--text);
    max-width: none;
    max-height: none;
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
  }

  .sheet:not([open]) {
    display: none;
  }

  .sheet[open] {
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  /* Hintergrund: Seite dunkelt leicht ab und wird unscharf */
  .sheet::backdrop {
    background: rgba(20, 24, 32, 0.38);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  .sheet[open]::backdrop {
    animation: fade 260ms var(--ease) both;
  }

  .panel {
    width: min(34rem, 100%);
    max-height: min(42rem, calc(100svh - 2rem));
    display: flex;
    flex-direction: column;
    border-radius: 1.5rem;
    background: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(22px) saturate(1.6);
    -webkit-backdrop-filter: blur(22px) saturate(1.6);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 0 0 1px rgba(40, 45, 55, 0.08),
      0 2rem 4rem -1.5rem rgba(20, 24, 32, 0.55);
    overflow: hidden;
  }

  .sheet[open] .panel {
    animation: rise 420ms var(--ease) both;
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(1.25rem) scale(0.97);
    }
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.1rem 1.25rem 0.4rem 1.5rem;
  }

  h2 {
    font-family: var(--display);
    font-size: 1.6rem;
    font-weight: 900;
    letter-spacing: -0.03em;
    text-transform: uppercase;
    line-height: 1;
  }

  h2 b {
    color: var(--red);
    margin-left: 0.2em;
  }

  .x {
    width: 2.5rem;
    height: 2.5rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(40, 45, 55, 0.07);
    color: var(--text);
    transition: background-color 160ms var(--ease), transform 160ms var(--ease);
  }

  .x:hover {
    background: rgba(40, 45, 55, 0.14);
  }

  .x:active {
    transform: scale(0.92);
  }

  .body {
    padding: 0.4rem 1.5rem 1.5rem;
    overflow-y: auto;
    display: grid;
    gap: 1.25rem;
  }

  .lead {
    font-size: 1.1rem;
    line-height: 1.45;
  }

  h3 {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 0.5rem;
  }

  ul {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.45rem;
  }

  .tips li {
    line-height: 1.4;
  }

  .links a,
  .small a {
    color: var(--text);
    text-decoration-color: var(--red);
    text-underline-offset: 0.2rem;
  }

  .small {
    font-size: 0.9rem;
    line-height: 1.45;
    color: var(--muted);
  }

  .more {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .more a {
    padding: 0.55rem 1rem;
    border-radius: 62.4375rem;
    background: var(--text);
    color: #fff;
    font-weight: 700;
    font-size: 0.92rem;
    text-decoration: none;
    transition: background-color 160ms var(--ease), transform 160ms var(--ease);
  }

  .more a:hover {
    background: var(--red);
  }

  .more a:active {
    transform: scale(0.96);
  }

  /* Handy: das Fenster sitzt unten wie ein Blatt */
  @media (max-width: 560px) {
    .sheet[open] {
      place-items: end center;
      padding: 0.5rem;
    }

    .panel {
      max-height: calc(100svh - 1rem);
      border-radius: 1.5rem 1.5rem 1.25rem 1.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet[open]::backdrop,
    .sheet[open] .panel {
      animation: none;
    }
  }
</style>
