<script>
  import { reveal } from "../lib/actions.js";
  import { REGIONAL } from "../lib/regional.js";

  let { story } = $props();
</script>

<!-- Normale Fläche (keine angeheftete Bühne): schiebt sich über die letzte Szene -->
<section class="scene flow t-light" aria-labelledby="kulissen">
  <div class="sc-stage">
    <h2 id="kulissen" class="say wide" use:reveal>So ist das entstanden.</h2>

    <div class="cols">
      <div use:reveal>
        <h3>Woher die Daten kommen</h3>
        <p>
          Aus meiner persönlichen DB-Reisehistorie: Datum, Uhrzeit, Start, Ziel, Zugnummer und die wichtigsten
          Zwischenhalte. {story.trips.length} Fahrten, alles zusammen als CSV-Datei im Projekt.
        </p>
      </div>
      <div use:reveal={100}>
        <h3>Wie die Linien entstehen</h3>
        <p>
          Die Historie kennt nur Bahnhöfe, keine Gleise. Die Linien sind der kürzeste Weg entlang echter, in
          OpenStreetMap kartierter Gleise, S-Bahn-Strecken werden gemieden.
        </p>
      </div>
      <div use:reveal={200}>
        <h3>Was die Karte nicht weiß</h3>
        <p>
          Der tatsächlich gefahrene Weg kann abweichen, etwa bei Umleitungen. Alle Zahlen dieser Seite sind daraus
          berechnet und deshalb Näherungen.
        </p>
        <!-- Was in den Daten fehlt: Regionalverkehr von Arverio, mit den beiden Farben seiner Auftritte -->
        <p class="gap">
          <span class="duo" aria-hidden="true"></span>
          <span>
            Regionalverkehr fehlt ganz: <b>Arverio</b> in Bayern und Baden-Württemberg steht nicht in der
            DB-Reisehistorie, die nur Fernverkehr kennt.
            {#if REGIONAL.bayern.fahrten || REGIONAL.bawue.fahrten}
              Dazu kommen {REGIONAL.bayern.fahrten ? `${REGIONAL.bayern.fahrten} Fahrten in Bayern` : ""}{REGIONAL.bayern.fahrten && REGIONAL.bawue.fahrten ? " und " : ""}{REGIONAL.bawue.fahrten ? `${REGIONAL.bawue.fahrten} in Baden-Württemberg` : ""}.
            {/if}
          </span>
        </p>
      </div>
    </div>

    <p class="more" use:reveal={300}><a href="#/ueber">So liest du die Karte</a> · <a href="#/statistik">Alle Zahlen im Überblick</a></p>
  </div>
</section>

<style>
  .flow {
    height: auto;
    margin-top: -100svh;
  }

  .flow .sc-stage {
    position: relative;
    height: auto;
    min-height: 100svh;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    align-content: center;
  }

  .flow .sc-stage::after {
    display: none;
  }

  .cols {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(1.5rem, 3vw, 3rem);
    max-width: 78rem;
  }

  h3 {
    font-size: clamp(1.3rem, 2vw, 1.7rem);
    font-weight: 800;
    margin-bottom: 0.6rem;
  }

  /* Hinweisschild für den fehlenden Regionalverkehr: ein Abzeichen, halb Bayern-Blau, halb Baden-Württemberg-Gelb */
  .gap {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: start;
    gap: 0.7rem;
    margin-top: 0.9rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--line);
  }

  .gap b {
    color: var(--text);
  }

  .duo {
    width: 34px;
    height: 24px;
    margin-top: 0.15rem;
    border-radius: 7px;
    background: linear-gradient(115deg, #0a4aa0 0 50%, #ffd500 50% 100%);
    box-shadow: 0 0 0 1px rgba(40, 45, 55, 0.12);
  }

  .cols p {
    color: var(--muted);
    max-width: 30rem;
  }

  .more {
    font-weight: 700;
  }

  .more a {
    text-decoration-thickness: 2px;
    text-underline-offset: 0.2em;
    text-decoration-color: var(--red);
  }

  .more a:hover {
    color: var(--red);
  }

  @media (max-width: 860px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
</style>
