<script>
  import { formatDuration, trainTypes } from "../lib/data.js";
  import { routeRanking, weekdayCounts, shortName } from "../lib/facts.js";
  import BierEgg from "../lib/BierEgg.svelte";

  let { trips, stations } = $props();

  const EARTH_KM = 40075;
  const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const nf = (n, d = 0) => n.toLocaleString("de-DE", { maximumFractionDigits: d });

  const totalKm = $derived(Math.round(trips.reduce((s, t) => s + t.km, 0)));
  const totalMinutes = $derived(trips.reduce((s, t) => s + t.minutes, 0));
  const hours = $derived(Math.round(totalMinutes / 60));
  const avgSpeed = $derived(Math.round(totalKm / (totalMinutes / 60)));
  const earthPct = $derived((totalKm / EARTH_KM) * 100);
  const longest = $derived(trips.reduce((a, b) => (b.km > a.km ? b : a)));
  const earliest = $derived(trips.reduce((a, b) => (toMin(b.abfahrt) < toMin(a.abfahrt) ? b : a)));
  const routes = $derived(routeRanking(trips, 5));
  const weekdays = $derived(weekdayCounts(trips));

  const perMonth = $derived.by(() => {
    const counts = Array(12).fill(0);
    for (const t of trips) counts[new Date(t.t0).getMonth()]++;
    const max = Math.max(...counts);
    return counts.map((n, i) => ({ label: MONTHS[i], n, h: n / max }));
  });

  const topStations = $derived.by(() => {
    const list = [...stations].sort((a, b) => b.visits - a.visits).slice(0, 6);
    const max = list[0].visits;
    return list.map((s) => ({ name: s.name, visits: s.visits, w: s.visits / max }));
  });

  const TYPE_COLORS = ["#ec0016", "#282d37", "#9aa1ab", "#f59a9a", "#b8000f"];
  const types = $derived.by(() => {
    const counts = new Map();
    for (const t of trips) for (const ty of trainTypes(t.zuege)) counts.set(ty, (counts.get(ty) || 0) + 1);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([name, n], i) => ({ name, n, w: (n / total) * 100, color: TYPE_COLORS[i % TYPE_COLORS.length] }));
  });

  function toMin(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }
</script>

<div class="container">
  <div class="page-head split">
    <h1>Das Jahr in <span class="hl special">Zahlen</span></h1>
    <p class="lead">
      {trips.length} Fahrten im Überblick: Strecke, Zeit, Lieblingsorte und wann ich unterwegs war.
    </p>
  </div>

  <div class="report">
    <section class="panel figures-panel">
      <h2>Kennzahlen</h2>
      <dl class="figures">
        <div><dt>Fahrten</dt><dd>{trips.length}</dd></div>
        <div><dt>Gesamtstrecke</dt><dd>{nf(totalKm)} km</dd></div>
        <div><dt>Anteil am Erdumfang</dt><dd>{nf(earthPct)} %</dd></div>
        <div><dt>Zeit im Zug</dt><dd>{nf(hours)} Std.</dd></div>
        <div><dt>Durchschnittstempo</dt><dd>{nf(avgSpeed)} km/h</dd></div>
        <div><dt>Bahnhöfe besucht</dt><dd>{stations.length}</dd></div>
        <div>
          <dt>Längste Fahrt</dt>
          <dd>
            {nf(longest.km)} km
            <small>{shortName(longest.von)} → {shortName(longest.nach)}, {formatDuration(longest.minutes)}</small>
          </dd>
        </div>
        <div>
          <dt>Früheste Abfahrt</dt>
          <dd>
            {earliest.abfahrt} Uhr
            <small>{shortName(earliest.von)} → {shortName(earliest.nach)}, {earliest.datum}</small>
          </dd>
        </div>
      </dl>
    </section>

    <section class="panel months-panel">
      <h2>Fahrten pro Monat</h2>
      <div class="cols" style="--n:12" role="img" aria-label="Fahrten pro Monat">
        {#each perMonth as m}
          <div class="m" title="{m.label}: {m.n} Fahrten">
            <span class="n">{m.n || ""}</span>
            <div class="col"><i style="--h:{m.h}"></i></div>
            <span class="l">{m.label}</span>
          </div>
        {/each}
      </div>
    </section>

    <section class="panel third">
      <h2>Fahrten pro Wochentag</h2>
      <div class="cols" style="--n:7" role="img" aria-label="Fahrten pro Wochentag">
        {#each weekdays as d}
          <div class="m" title="{d.label}: {d.n} Fahrten">
            <span class="n">{d.n || ""}</span>
            <div class="col"><i style="--h:{d.h}"></i></div>
            <span class="l">{d.label}</span>
          </div>
        {/each}
      </div>
    </section>

    <section class="panel third">
      <h2>Meistbesuchte Bahnhöfe</h2>
      <ul class="bars">
        {#each topStations as s}
          <li>
            <span class="name">{shortName(s.name)}</span>
            <span class="bar"><i style="--w:{s.w}"></i></span>
            <b>{s.visits}×</b>
          </li>
        {/each}
      </ul>
    </section>

    <section class="panel third">
      <h2><span class="special">Lieblings</span>strecken</h2>
      <!-- Beide Bahnhöfe stehen ausgeschrieben untereinander, darunter der Balken über die ganze Breite -->
      <ul class="routes">
        {#each routes as r}
          <li>
            <span class="pair">
              <span>{r.a}</span>
              <span class="to" aria-hidden="true">⇄</span>
              <span>{r.b}</span>
            </span>
            <b class="cnt">{r.n}×</b>
            <span class="bar"><i style="--w:{r.w}"></i></span>
          </li>
        {/each}
      </ul>
    </section>

    <section class="panel full">
      <h2>Zuggattungen</h2>
      <div class="stack" role="img" aria-label="Anteile der Zuggattungen">
        {#each types as ty}
          <i style="width:{ty.w}%; background:{ty.color}" title="{ty.name}: {ty.n}"></i>
        {/each}
      </div>
      <ul class="legend">
        {#each types as ty}
          <li><i style="background:{ty.color}"></i>{ty.name} <b>{ty.n}</b></li>
        {/each}
      </ul>
    </section>

    <BierEgg />
  </div>
</div>

<style>
  .report {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 1.25rem;
  }

  .panel {
    display: flex;
    flex-direction: column;
    padding: clamp(1.2rem, 1.6vw, 1.7rem);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r);
  }

  .figures-panel {
    grid-column: span 5;
  }
  .months-panel {
    grid-column: span 7;
  }
  .third {
    grid-column: span 4;
  }
  .full {
    grid-column: span 12;
  }

  .panel h2 {
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  /* Kennzahlen als Liste mit Haarlinien, nicht als Kachelreihe */
  .figures {
    margin-top: 0.8rem;
  }

  .figures div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1.5rem;
    padding: 0.7rem 0;
    border-top: 1px solid var(--line);
  }

  .figures dt {
    color: var(--muted);
  }

  .figures dd {
    text-align: right;
    font-weight: 800;
    font-size: 1.1rem;
  }

  .figures small {
    display: block;
    font-weight: 400;
    font-size: 0.88rem;
    color: var(--muted);
  }

  /* Säulendiagramme */
  .cols {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: clamp(0.3rem, 0.7vw, 0.8rem);
    margin-top: 1.2rem;
    min-height: 12rem;
  }

  .m {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    height: 100%;
  }

  .m .col {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: flex-end;
  }

  .m .col i {
    display: block;
    width: 100%;
    height: calc(var(--h) * 100%);
    min-height: 0.1875rem;
    border-radius: var(--r);
    background: var(--red);
    opacity: calc(0.3 + var(--h) * 0.7);
    transition: opacity 160ms var(--ease);
  }

  .m:hover .col i {
    opacity: 1;
  }

  .m .n {
    font-size: 0.92rem;
    font-weight: 700;
    min-height: 1.2em;
  }

  .m .l {
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--muted);
  }

  /* Ranglisten */
  .bars {
    list-style: none;
    margin-top: 1.2rem;
    display: grid;
    gap: 0.85rem;
  }

  .bars li {
    display: grid;
    grid-template-columns: minmax(6.5rem, 11rem) 1fr 2.4rem;
    align-items: center;
    gap: 0.9rem;
  }

  .bars .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bars .bar {
    height: 0.5rem;
    border-radius: var(--r);
    background: var(--panel-2);
    overflow: hidden;
  }

  .bars .bar i {
    display: block;
    height: 100%;
    width: calc(var(--w) * 100%);
    border-radius: var(--r);
    background: var(--red);
  }

  .bars b {
    text-align: right;
  }

  /* Lieblingsstrecken: Name in voller Länge (darf umbrechen), Anzahl rechts, Balken darunter */
  .routes {
    list-style: none;
    margin-top: 1.2rem;
    display: grid;
    gap: 1.1rem;
  }

  .routes li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 0.4rem 0.9rem;
  }

  .routes .pair {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 0.5rem;
    font-weight: 700;
    line-height: 1.3;
  }

  .routes .to {
    color: var(--red);
    font-weight: 800;
  }

  .routes .cnt {
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
  }

  .routes .bar {
    grid-column: 1 / -1;
    height: 0.5rem;
    border-radius: var(--r);
    background: var(--panel-2);
    overflow: hidden;
  }

  .routes .bar i {
    display: block;
    height: 100%;
    width: calc(var(--w) * 100%);
    border-radius: var(--r);
    background: var(--red);
  }

  /* Zuggattungen */
  .stack {
    display: flex;
    gap: 2px;
    height: 2.4rem;
    margin-top: 1.2rem;
    border-radius: var(--r);
    overflow: hidden;
  }

  .stack i {
    display: block;
    height: 100%;
    min-width: 0.375rem;
  }

  .legend {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.6rem;
    margin-top: 1rem;
  }

  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .legend i {
    width: 0.625rem;
    height: 0.625rem;
    border-radius: var(--r);
  }

  .legend b {
    color: var(--muted);
    font-weight: 600;
  }

  @media (max-width: 1200px) {
    .figures-panel,
    .months-panel {
      grid-column: span 12;
    }
    .third {
      grid-column: span 6;
    }
  }

  @media (max-width: 760px) {
    .third {
      grid-column: span 12;
    }
    .bars li {
      grid-template-columns: 7rem 1fr 2.2rem;
    }
  }
</style>
