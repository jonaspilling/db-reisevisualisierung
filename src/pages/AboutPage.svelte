<script>
  import { reveal } from "../lib/actions.js";

  let { trips, stations } = $props();

  const totalKm = $derived(Math.round(trips.reduce((s, t) => s + t.km, 0)));
</script>

<div class="container">
  <div class="page-head split">
    <h1>So liest du die <span class="hl">Karte</span></h1>
    <p class="lead" use:reveal={160}>
      Ein Uni-Projekt aus dem Fach Information Design: {trips.length} Bahnfahrten, {totalKm.toLocaleString("de-DE")}
      Kilometer und {stations.length} Bahnhöfe, auf einer Karte zu Linien gezeichnet.
    </p>
  </div>

  <!-- Drei Schritte -->
  <section class="steps" aria-label="Bedienung">
    <article use:reveal>
      <span class="no">1</span>
      <h2>Breite und Farbe zeigen, wie oft</h2>
      <p>
        Jede Strecke ist eine Linie auf der Karte. Je öfter du einen Abschnitt gefahren bist, desto breiter und
        kräftiger wird sie: Dunkles Schiefer heißt einmal, leuchtendes DB-Rot ist dein Dauerbrenner. In 3D wächst
        eine Mauer aus der Strecke, je höher, desto öfter gefahren.
      </p>
      <div class="legend">
        <div class="bar"></div>
        <div class="labels"><span>1× gefahren</span><span>am häufigsten</span></div>
      </div>
    </article>

    <article use:reveal={100}>
      <span class="no">2</span>
      <h2>Überfahren und anklicken</h2>
      <p>
        Fahre mit der Maus über eine Linie: Die zugehörigen Fahrten treten hervor, der Rest tritt zurück, und eine
        Karte nennt Datum und Strecke. Die Ansicht ist festgelegt, nur 2D und 3D lassen sich umschalten.
      </p>
      <div class="demo">
        <div class="chip-demo">
          <b>München → Frankfurt</b>
          <span>ICE 524 · 397 km · 3 h 18 min</span>
        </div>
      </div>
    </article>

    <article use:reveal={200}>
      <span class="no">3</span>
      <h2>Das Jahr abspielen</h2>
      <p>
        Unten auf der Karte läuft eine Zeitleiste. Mit Play zeichnen sich die Fahrten nacheinander ein, jede für sich,
        und jeder Ort blendet kurz seinen Namen ein. Die Zeit zwischen zwei Reisen läuft im Schnelldurchlauf. Du kannst jederzeit am Regler ziehen.
      </p>
      <div class="demo">
        <div class="track"><i></i><b></b></div>
      </div>
    </article>
  </section>

  <!-- Hintergründe -->
  <section class="info">
    <div use:reveal>
      <h2>Woher die Daten kommen</h2>
      <p>
        Die Fahrten stammen aus meiner persönlichen DB-Reisehistorie: Datum, Uhrzeit, Start, Ziel, Zugnummer und
        die wichtigsten Zwischenhalte. Alles zusammen liegt als CSV-Datei im Projekt.
      </p>
    </div>
    <div use:reveal={100}>
      <h2>Wie die Linien entstehen</h2>
      <p>
        Die Historie enthält nur Bahnhöfe, keine Gleise. Die Linien sind deshalb der kürzeste Weg entlang echter, in
        OpenStreetMap kartierter Gleise zwischen den Halten.
      </p>
    </div>
    <div use:reveal={200}>
      <h2>Was die Karte nicht weiß</h2>
      <p>
        Der tatsächlich gefahrene Weg kann leicht abweichen, etwa bei Umleitungen. Auch die Höhe ist eine Näherung:
        Gezählt wird in Rasterzellen von drei Kilometern.
      </p>
    </div>
  </section>

  <div class="cta" use:reveal>
    <a class="btn" href="#/">Zur Karte <span aria-hidden="true">→</span></a>
    <a class="btn ghost" href="#/statistik">Statistik</a>
  </div>
</div>

<style>
  .steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: clamp(1.5rem, 3vw, 3rem);
    margin-bottom: clamp(3rem, 6vw, 5rem);
  }

  .steps article {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.2rem 0 0;
    border-top: 2px solid var(--red);
  }

  .no {
    font-family: var(--display);
    font-size: 3rem;
    font-weight: 800;
    line-height: 1;
    color: var(--red);
  }

  .steps h2 {
    font-size: clamp(1.7rem, 2.2vw, 2.1rem);
    font-weight: 800;
    margin-top: 0.2rem;
  }

  .steps p {
    color: var(--muted);
  }

  .legend,
  .demo {
    margin-top: auto;
    padding-top: 1rem;
  }

  .bar {
    height: 10px;
    border-radius: var(--r);
    background: linear-gradient(
      90deg,
      rgb(255, 218, 212),
      rgb(255, 84, 92) 45%,
      rgb(246, 20, 44) 75%,
      rgb(226, 0, 30)
    );
  }

  .labels {
    display: flex;
    justify-content: space-between;
    margin-top: 0.4rem;
    font-size: 0.88rem;
    font-weight: 600;
  }

  .chip-demo {
    padding: 0.9rem 1.1rem;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r);
    box-shadow: var(--shadow);
    display: grid;
    gap: 0.2rem;
  }

  .chip-demo b {
    font-size: 1.15rem;
    font-weight: 800;
  }

  .chip-demo span {
    font-size: 0.92rem;
    color: var(--muted);
  }

  .track {
    position: relative;
    height: 4px;
    margin: 1rem 0.5rem;
    border-radius: var(--r);
    background: var(--panel-2);
  }

  .track i {
    position: absolute;
    inset: 0 auto 0 0;
    width: 62%;
    border-radius: var(--r);
    background: var(--red);
  }

  .track b {
    position: absolute;
    left: 62%;
    top: 50%;
    width: 24px;
    height: 24px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: #fff;
    border: 4px solid var(--red);
    box-shadow: 0 2px 8px rgba(40, 45, 55, 0.35);
  }

  .info {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: clamp(1.5rem, 3vw, 3rem);
    padding-top: clamp(1.5rem, 3vw, 2.5rem);
    border-top: 1px solid var(--line);
    margin-bottom: clamp(2rem, 4vw, 3rem);
  }

  .info h2 {
    font-size: 1.5rem;
    font-weight: 800;
    margin-bottom: 0.6rem;
  }

  .info p {
    color: var(--muted);
  }

  .cta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
  }

  @media (max-width: 1100px) {
    .steps {
      grid-template-columns: 1fr;
    }
    .info {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 620px) {
    .info {
      grid-template-columns: 1fr;
    }
  }
</style>
