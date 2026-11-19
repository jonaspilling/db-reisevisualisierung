<script>
  // Info: woher die Daten kommen, wie die Linien entstehen, was die Karte nicht weiß, Kontakt.
  import { onMount } from "svelte";
  import { gsap, reduce, reveal, stagger } from "../lib/motion.js";

  let { data } = $props();
  const { trips, stations } = data;
  let root;

  onMount(() => {
    const ctx = gsap.context(() => {
      if (!reduce) gsap.from(".title .l", { yPercent: 115, duration: 1.1, ease: "power4.out", stagger: 0.1, delay: 0.1 });
    }, root);
    return () => ctx.revert();
  });

  const blocks = [
    {
      h: "Woher die Daten kommen",
      p: `Aus meiner persönlichen DB-Reisehistorie: Datum, Uhrzeit, Start, Ziel, Zugnummer und alle Zwischenhalte. ${trips.length} Fahrten und ${stations.length} Bahnhöfe, alles zusammen als CSV-Datei im Projekt.`,
    },
    {
      h: "Wie die Linien entstehen",
      p: "Die Historie kennt nur Bahnhöfe, keine Gleise. Die Linien folgen deshalb echten, in OpenStreetMap kartierten Zugverbindungen: der kürzeste Weg über die Gleise, die Fernzüge normalerweise befahren. S-Bahn-Strecken werden gemieden. Im Einzelfall kann der tatsächlich gefahrene Weg abweichen.",
    },
    {
      h: "Was die Karte nicht weiß",
      p: "Den Regionalverkehr. Ich fahre das ganze Jahr über deutlich mehr Regionalzüge, bei ganz verschiedenen Anbietern. Das steht nicht in der Reisehistorie und lässt sich nicht messen. Alle Zahlen hier sind aus den Fernverkehrsfahrten berechnet und deshalb Näherungen.",
    },
    {
      h: "So liest du die Karte",
      p: "Jede Fahrt ist eine rote Linie. Wo sich Linien überlagern, wird es heller: dort bin ich öfter gefahren. Ein Klick auf einen Bahnhof zeigt nur die Fahrten, die dort gehalten haben. Mit der Zeitleiste spielst du das Jahr Fahrt für Fahrt ab.",
    },
  ];
</script>

<main class="page" bind:this={root}>
  <section class="hero">
    <p class="mono kick">Hinter dem Tresen</p>
    <h1 class="title">
      <span class="mask"><span class="l">Das ist</span></span>
      <span class="mask"><span class="l"><span class="acc red">Info.</span></span></span>
    </h1>
    <p class="lead">Ein Uni-Projekt im Fach Information Design, 3. Semester: mein Bahnjahr als Daten.</p>
  </section>

  <section class="blocks" use:stagger={{ selector: "article", each: 0.12 }}>
    {#each blocks as b, i}
      <article>
        <span class="mono n">0{i + 1}</span>
        <h2>{b.h}</h2>
        <p>{b.p}</p>
      </article>
    {/each}
  </section>

  <section class="contact" use:reveal>
    <h2>Fragen oder <span class="acc red">Hinweise?</span></h2>
    <p>
      <a class="btn" href="https://github.com/jonaspilling/db-reisevisualisierung" target="_blank" rel="noopener">Projekt auf GitHub <span aria-hidden="true">→</span></a>
    </p>
    <p class="mono note">Kein offizielles Angebot der Deutschen Bahn.</p>
  </section>
</main>

<style>
  .hero {
    padding: calc(var(--bar-h) + 4rem) var(--pad) 2rem;
    max-width: 82rem;
    margin: 0 auto;
  }

  .kick {
    color: var(--ink-2);
    margin-bottom: 1rem;
  }

  .title {
    font-size: calc(var(--ds) * clamp(3.6rem, 13vw, 12rem));
    line-height: 0.88;
  }

  .l {
    display: inline-block;
  }

  .lead {
    margin-top: 1.4rem;
    max-width: 34rem;
    color: var(--ink-2);
    font-size: clamp(1.05rem, 1.5vw, 1.25rem);
  }

  .blocks {
    max-width: 82rem;
    margin: 0 auto;
    padding: 3rem var(--pad);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(0.8rem, 1.6vw, 1.4rem);
  }

  article {
    padding: clamp(1.4rem, 3vw, 2.4rem);
    border-radius: 1.6rem;
    background: var(--bg-2);
    border: 1px solid var(--line);
    transition: border-color 300ms var(--ease), transform 300ms var(--ease);
  }

  article:hover {
    border-color: var(--red);
    transform: translateY(-4px);
  }

  .n {
    color: var(--red-ink);
  }

  article h2 {
    font-size: clamp(1.8rem, 3.2vw, 3rem);
    margin: 0.6rem 0 0.9rem;
  }

  article p {
    color: var(--ink-2);
    max-width: 34rem;
  }

  .contact {
    max-width: 82rem;
    margin: 0 auto;
    padding: clamp(3rem, 8vh, 6rem) var(--pad) clamp(4rem, 10vh, 7rem);
    display: grid;
    gap: 1.4rem;
    justify-items: start;
  }

  .contact h2 {
    font-size: calc(var(--ds) * clamp(2.4rem, 7vw, 7rem));
  }

  .note {
    color: var(--ink-2);
  }

  @media (max-width: 760px) {
    .blocks {
      grid-template-columns: 1fr;
    }
  }
</style>
