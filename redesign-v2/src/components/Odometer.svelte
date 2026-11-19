<script>
  // Kilometerzähler: jede Stelle ein Rad. Das niedrigste läuft stetig, höhere springen beim Übertrag mit.
  let { value = 0, digits = 4, label = "" } = $props();

  const wheels = $derived.by(() => {
    const raw = Math.max(0, value);
    const v = Math.abs(raw - Math.round(raw)) < 0.05 ? Math.round(raw) : raw;
    const out = [];
    for (let k = digits - 1; k >= 0; k--) {
      const base = Math.floor(v / 10 ** k) % 10;
      const pos = k === 0 ? v % 10 : base + Math.max(0, (v % 10 ** k) - (10 ** k - 1));
      out.push({ k, pos });
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
        <span class="strip" style="transform: translate3d(0, calc({w.pos} * -1em), 0)">
          {#each STRIP as d}<span>{d}</span>{/each}
        </span>
      </span>
    {/if}
  {/each}
</span>

<style>
  .odo {
    display: inline-flex;
    height: 1em;
    line-height: 1;
    overflow: hidden;
    vertical-align: top;
    -webkit-mask-image: linear-gradient(transparent 0, #000 14%, #000 86%, transparent 100%);
    mask-image: linear-gradient(transparent 0, #000 14%, #000 86%, transparent 100%);
  }

  .wheel {
    display: block;
    height: 1em;
    overflow: hidden;
    min-width: 0.56em;
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
