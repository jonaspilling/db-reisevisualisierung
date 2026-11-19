<script>
  import { reveal } from "../lib/actions.js";
  import { goTo } from "../lib/jump.js";

  let { story } = $props();

  // "Von vorn" heißt ganz nach oben, zum Anfang der Seite
  function top(e) {
    e.preventDefault();
    goTo(0);
  }
</script>

<section class="outro t-red" aria-labelledby="outro">
  <div class="inner">
    <h2 id="outro" class="say" use:reveal>Jetzt die <span class="special">Karte</span>.</h2>
    <p class="sub" use:reveal={120}>
      Alle {story.trips.length} Fahrten zum Anklicken, mit Zeitleiste zum Abspielen und in 3D.
    </p>
    <div class="actions" use:reveal={220}>
      <a class="go" href="#/karte">Zur Karte <span aria-hidden="true">→</span></a>
      <a class="again" href="#/projekt" onclick={top}>Die Fakten noch mal von vorn</a>
    </div>
  </div>
</section>

<style>
  .outro {
    position: relative;
    background: var(--s-bg);
    color: var(--s-fg);
    padding: clamp(5rem, 14vh, 9rem) var(--pad);
    display: grid;
    align-content: center;
    min-height: 80svh;
  }

  .inner {
    display: grid;
    gap: clamp(1.2rem, 3vh, 2rem);
    justify-items: start;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 1.6rem;
    align-items: center;
    margin-top: 0.5rem;
  }

  .go {
    display: inline-flex;
    align-items: center;
    gap: 0.8rem;
    padding: 1rem 1.7rem;
    border-radius: var(--r);
    background: #fff;
    color: var(--red);
    font-weight: 800;
    font-size: 1.2rem;
    text-decoration: none;
    transition:
      transform 200ms var(--ease),
      box-shadow 200ms var(--ease);
  }

  .go:hover {
    background: var(--text);
    color: #fff;
  }

  .go:active {
    transform: scale(0.97);
  }

  .again {
    color: #fff;
    font-weight: 700;
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 0.25em;
  }

  .again:hover {
    text-decoration-color: transparent;
  }
</style>
