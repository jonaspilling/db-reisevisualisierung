<script>
  import { reveal } from "../lib/actions.js";

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
          Aus meiner persönlichen DB-Reisehistorie: Datum, Uhrzeit, Start, Ziel, Zugnummer und alle Zwischenhalte.
          {story.trips.length} Fahrten, alles zusammen als CSV-Datei im Projekt.
        </p>
      </div>
      <div use:reveal={100}>
        <h3>Wie die Linien entstehen</h3>
        <p>
          Die Historie kennt nur Bahnhöfe, keine Gleise. Die Linien folgen deshalb echten, in OpenStreetMap
          kartierten Zugverbindungen: der kürzeste Weg über die Gleise, die Fernzüge normalerweise befahren.
          S-Bahn-Strecken werden gemieden. Im Einzelfall kann der tatsächlich gefahrene Weg abweichen.
        </p>
      </div>
      <div use:reveal={200}>
        <h3>Was die Karte nicht weiß</h3>
        <p>
          Den Regionalverkehr. Ich fahre das ganze Jahr über deutlich mehr Regionalzüge, bei ganz verschiedenen
          Anbietern. Das steht nicht in der DB-Reisehistorie und lässt sich deshalb nicht messen. Alle Zahlen dieser
          Seite sind aus den Fernverkehrsfahrten berechnet und deshalb Näherungen.
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
