<script>
  import { PAGES } from "../lib/route.svelte.js";
  import Logo from "./Logo.svelte";
</script>

<footer class="foot">
  <div class="wrap">
    <div class="about">
      <div class="mark"><Logo size={46} /><span>Bord<b>bistro</b></span></div>
      <p>
        Meine Bahnreisen 2026, nachgezeichnet auf dem echten Gleisnetz. Ein Uni-Projekt im Fach Information Design,
        3. Semester.
      </p>
    </div>
    <nav aria-label="Seiten">
      <h4 class="mono">Seiten</h4>
      {#each PAGES as p}<a href={"#" + p.path}>{p.label}</a>{/each}
    </nav>
    <div>
      <h4 class="mono">Quellen</h4>
      <p>Fahrten: eigene DB-Reisehistorie. Gleise und Karte: OpenStreetMap, OpenFreeMap. Kein offizielles Angebot der Deutschen Bahn.</p>
    </div>
  </div>
</footer>

<style>
  .foot {
    background: var(--bg-2);
    border-top: 1px solid var(--line);
    padding: clamp(2.5rem, 6vw, 4.5rem) var(--pad) 2.5rem;
    color: var(--ink-2);
    font-size: 0.98rem;
  }

  .wrap {
    max-width: 78rem;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1.6fr 0.8fr 1.2fr;
    gap: 2.5rem;
  }

  .mark {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(1.8rem, 3vw, 2.4rem);
    letter-spacing: -0.04em;
    color: var(--ink);
    margin-bottom: 0.9rem;
  }

  .mark b {
    color: var(--red-ink);
  }

  h4 {
    color: var(--ink);
    margin-bottom: 0.8rem;
  }

  nav {
    display: grid;
    gap: 0.35rem;
    align-content: start;
  }

  nav a {
    text-decoration: none;
    width: fit-content;
    transition: color 200ms var(--ease), transform 200ms var(--ease);
  }

  nav a:hover {
    color: var(--ink);
    transform: translateX(4px);
  }

  @media (max-width: 760px) {
    .wrap {
      grid-template-columns: 1fr;
    }
  }
</style>
