<script>
  import { music, toggleSong, stopSong } from "./music.svelte.js";

  let { onMap = false } = $props();
</script>

{#if music.active}
  <div class="mini" class:onmap={onMap} role="region" aria-label="Song">
    <button type="button" class="pp" onclick={toggleSong} aria-label={music.playing ? "Pause" : "Weiter abspielen"}>
      {#if music.playing}
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
      {/if}
    </button>
    <div class="eq" class:on={music.playing} aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="txt"><b>Bordbistro</b><span>Teuterekordz</span></div>
    <button type="button" class="x" onclick={stopSong} aria-label="Song ausschalten">
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" fill="none" /></svg>
    </button>
    <i class="line" style="width:{music.progress * 100}%" aria-hidden="true"></i>
  </div>
{/if}

<style>
  .mini {
    position: fixed;
    z-index: 2900;
    left: 0.9rem;
    bottom: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.3rem 0.35rem 0.3rem 0.35rem;
    border-radius: 62.4375rem;
    background: rgba(26, 30, 38, 0.94);
    color: #fff;
    box-shadow: 0 0.6rem 1.4rem -0.7rem rgba(0, 0, 0, 0.7);
    overflow: hidden;
    animation: in 420ms var(--ease) both;
  }

  /* Kartenansicht: über der Zeitleiste im unteren Rahmen, im Kartenfenster unten links */
  .mini.onmap {
    left: 5.2rem;
    bottom: 6.5rem;
  }

  @keyframes in {
    from {
      opacity: 0;
      transform: translateY(0.8rem) scale(0.95);
    }
  }

  .pp {
    flex: none;
    width: 1.9rem;
    height: 1.9rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--red);
    color: #fff;
    transition: transform 160ms var(--ease);
  }

  .pp:active {
    transform: scale(0.92);
  }

  .eq {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 0.95rem;
  }

  .eq i {
    width: 3px;
    height: 25%;
    border-radius: 1.5px;
    background: var(--red);
  }

  .eq.on i {
    animation: bar 640ms ease-in-out infinite alternate;
  }

  .eq.on i:nth-child(2) {
    animation-delay: -160ms;
    animation-duration: 520ms;
  }

  .eq.on i:nth-child(3) {
    animation-delay: -320ms;
    animation-duration: 720ms;
  }

  .eq.on i:nth-child(4) {
    animation-delay: -80ms;
    animation-duration: 600ms;
  }

  @keyframes bar {
    from {
      height: 20%;
    }
    to {
      height: 100%;
    }
  }

  .txt {
    display: grid;
    line-height: 1.1;
    min-width: 0;
  }

  .txt b {
    font-size: 0.78rem;
    font-weight: 800;
  }

  .txt span {
    font-size: 0.68rem;
    color: #b9bfca;
  }

  .x {
    flex: none;
    width: 1.7rem;
    height: 1.7rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #b9bfca;
    transition: background-color 160ms var(--ease), color 160ms var(--ease);
  }

  .x:hover {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
  }

  .line {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    background: var(--red);
  }

  @media (max-width: 899px) {
    .mini.onmap {
      left: 1.1rem;
      bottom: 9.6rem;
    }
  }

  @media (max-width: 560px) {
    .mini {
      left: 0.6rem;
      bottom: 0.6rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mini,
    .eq.on i {
      animation: none;
    }
  }
</style>
