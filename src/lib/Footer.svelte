<script>
  import { router, isHomePath } from "./router.svelte.js";
  import { goTo } from "./jump.js";
  import Logo from "./Logo.svelte";

  // "Projekt" in der Fußzeile bringt immer ganz nach oben: auf der Startseite gleitet die Seite hoch,
  // von Statistik oder Erklärung geht es zur Startseite und dort an den Anfang (nicht an die letzte Stelle).
  function toTop(e) {
    e.preventDefault();
    if (isHomePath(router.path)) {
      goTo(0);
      return;
    }
    location.hash = "#/";
    setTimeout(() => window.scrollTo({ top: 0, behavior: "instant" }), 60);
  }
</script>

<footer class="footer" id="info">
  <div class="container">
    <div class="cols">
      <div class="about">
        <p class="brand"><Logo size={44} /><span>Bord<b>bistro</b></span></p>
        <p>
          Eine Visualisierung meiner Bahnreisen 2026: 16 Fernverkehrsfahrten, nachgezeichnet auf dem echten Gleisnetz
          und als scrollbare Geschichte erzählt. Uni-Projekt im Fach Information Design, 3. Semester.
        </p>
      </div>
      <div>
        <h4>Kontakt</h4>
        <ul>
          <li><a href="https://github.com/jonaspilling/db-reisevisualisierung" target="_blank" rel="noopener">Code und Projekt auf GitHub</a></li>
          <li><a href="https://github.com/jonaspilling/db-reisevisualisierung/issues" target="_blank" rel="noopener">Fragen und Hinweise als Issue</a></li>
        </ul>
      </div>
      <div>
        <h4>Seiten</h4>
        <ul>
          <li><a href="#/karte">Karte</a></li>
          <li><a href="#/" onclick={toTop}>Projekt</a></li>
          <li><a href="#/statistik">Statistik</a></li>
          <li><a href="#/ueber">So liest du die Karte</a></li>
        </ul>
      </div>
      <div>
        <h4>Quellen</h4>
        <ul>
          <li>DB-Reisehistorie (eigene Fahrten)</li>
          <li>
            Karte: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>,
            © <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a>,
            Daten © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
          </li>
        </ul>
      </div>
    </div>
    <p class="note">Kein offizielles Angebot der Deutschen Bahn.</p>
  </div>
</footer>

<style>
  .footer {
    margin-top: clamp(3rem, 6vw, 6rem);
    background: var(--panel);
    border-top: 1px solid var(--line);
    padding: clamp(2.5rem, 5vw, 4rem) 0 2rem;
    font-size: 0.98rem;
    color: var(--muted);
  }

  .cols {
    display: grid;
    grid-template-columns: 1.7fr 1.1fr 0.9fr 1.4fr;
    gap: 2.5rem;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    font-family: var(--display);
    font-size: clamp(2rem, 3.4vw, 2.8rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
    color: var(--text);
    margin-bottom: 0.9rem;
  }

  .brand b {
    color: var(--red);
    margin-left: 0;
  }

  h4 {
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text);
    margin-bottom: 0.8rem;
  }

  ul {
    list-style: none;
    display: grid;
    gap: 0.4rem;
  }

  a {
    text-underline-offset: 0.1875rem;
    text-decoration-color: var(--line);
    transition: color 160ms var(--ease), text-decoration-color 160ms var(--ease);
  }

  a:hover {
    color: var(--red);
    text-decoration-color: var(--red);
  }

  .note {
    margin-top: 2.5rem;
    padding-top: 1.2rem;
    border-top: 1px solid var(--line);
    font-size: 0.9rem;
  }

  @media (max-width: 800px) {
    .cols {
      grid-template-columns: 1fr;
      gap: 1.8rem;
    }
  }
</style>
