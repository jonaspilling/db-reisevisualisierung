<script>
  // Kilometerzähler: jede Stelle ist ein Rad. Das niedrigste Rad läuft stetig,
  // die höheren Räder springen erst beim Übertrag mit (wie ein echter Zähler).
  let { value = 0, digits = 4, label = "" } = $props();

  const wheels = $derived.by(() => {
    const v = Math.max(0, value);
    const out = [];
    for (let k = digits - 1; k >= 0; k--) {
      const base = Math.floor(v / 10 ** k) % 10;
      // Höhere Räder rollen erst im letzten Kilometer vor dem Übertrag weiter (wenn alle Stellen darunter auf 9 stehen)
      const pos = k === 0 ? v % 10 : base + Math.max(0, (v % 10 ** k) - (10 ** k - 1));
      out.push({ k, pos });
      // Tausenderpunkt vor jeder dritten Stelle
      if (k > 0 && k % 3 === 0) out.push({ sep: true, k: `s${k}` });
    }
    return out;
  });

  const STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
</script>

<span class="odo" role="img" aria-label={label || String(Math.round(value))}>
  {#each wheels as w (w.k)}
    {#if w.sep}
      <span class="sep" aria-hidden="true">.</span>
    {:else}
      <span class="wheel" aria-hidden="true">
        <span class="strip" style="transform: translateY(calc({w.pos} * -1em))">
          {#each STRIP as d}<span>{d}</span>{/each}
        </span>
      </span>
    {/if}
  {/each}
</span>

<style>
  .odo {
    display: inline-flex;
    align-items: flex-start;
    height: 1em;
    line-height: 1;
    overflow: hidden;
    vertical-align: top;
    /* Die Räder laufen leicht ineinander aus: oben und unten weich */
    -webkit-mask-image: linear-gradient(transparent 0, #000 12%, #000 88%, transparent 100%);
    mask-image: linear-gradient(transparent 0, #000 12%, #000 88%, transparent 100%);
  }

  .wheel {
    display: block;
    height: 1em;
    overflow: hidden;
    min-width: 0.62em;
    text-align: center;
  }

  .strip {
    display: flex;
    flex-direction: column;
    will-change: transform;
  }

  .strip span {
    display: block;
    height: 1em;
    line-height: 1;
  }

  .sep {
    display: block;
    height: 1em;
    padding-inline: 0.02em;
  }
</style>
