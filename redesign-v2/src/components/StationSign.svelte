<script>
  // Bahnhofsschild über jedem Abschnitt: hängt an zwei Ketten und schwingt beim Erscheinen.
  import { swing } from "../lib/motion.js";

  let { no = 1, name = "", sub = "" } = $props();
</script>

<div class="sign" use:swing>
  <i class="chain l" aria-hidden="true"></i>
  <i class="chain r" aria-hidden="true"></i>
  <div class="plate">
    <span class="no mono">Halt {no}</span>
    <b>{name}</b>
    {#if sub}<small class="mono">{sub}</small>{/if}
  </div>
</div>

<style>
  .sign {
    position: relative;
    width: fit-content;
    max-width: 100%;
    padding-top: 2.4rem;
  }

  .chain {
    position: absolute;
    top: 0;
    width: 3px;
    height: 2.6rem;
    background: repeating-linear-gradient(#8a8f94 0 6px, #51565a 6px 9px);
  }

  .chain.l {
    left: 14%;
  }

  .chain.r {
    right: 14%;
  }

  .plate {
    display: grid;
    gap: 0.1rem;
    padding: 1.3rem 1.6rem 0.9rem;
    border-radius: 0.7rem;
    background: linear-gradient(var(--red) 0 0.55rem, transparent 0.55rem), var(--paper);
    color: var(--paper-ink);
    box-shadow: inset 0 0 0 3px var(--paper), inset 0 0 0 5px var(--paper-ink), 0 14px 30px rgba(0, 0, 0, 0.4);
  }

  .no {
    color: var(--red);
    font-weight: 500;
  }

  b {
    font-family: var(--font-display);
    font-weight: var(--fw);
    font-size: calc(var(--ds) * clamp(1.5rem, 3.6vw, 2.7rem));
    letter-spacing: var(--ls);
    line-height: 1;
  }

  small {
    color: var(--paper-ink-2);
    font-size: 0.68rem;
  }
</style>
