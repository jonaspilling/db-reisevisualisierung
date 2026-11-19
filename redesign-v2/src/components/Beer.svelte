<script>
  // Ein Pils-Tulpenglas mit Stiel und Fuß. fill 0 = leer, 1 = voll mit Schaumkrone bis zum Rand.
  // Im Glas steigen Bläschen vom Boden auf; "over" lässt die Krone über den Rand quellen.
  // Über children lässt sich im selben Koordinatensystem (220 × 420) etwas dazuzeichnen, z. B. der Zapfhahn.
  // marks: Eichstriche als Anteile (0 bis 1) des vollen Glases, gestrichelt quer durchs Glas.
  let { fill = 1, id = "b", stroke = 4, bubbles = 5, over = false, marks = [], children } = $props();

  const TOP = 30; // Glasrand
  const FLOOR = 322; // Boden der Schale (darunter beginnt der Stiel)
  const FULL = 78; // Bierspiegel bei vollem Glas (darüber die Schaumkrone)

  const bowl = "M60 30H160C172 90 180 160 156 224C140 266 120 296 118 322H102C100 296 80 266 64 224C40 160 48 90 60 30Z";
  const glass =
    "M60 30H160C172 90 180 160 156 224C140 266 120 296 118 322V368C118 376 150 380 164 392C170 398 160 406 110 406C60 406 50 398 56 392C70 380 102 376 102 368V322C100 296 80 266 64 224C40 160 48 90 60 30Z";

  const level = $derived(FLOOR - fill * (FLOOR - FULL)); // y des Bierspiegels
  const foamH = $derived(fill > 0.02 ? 12 + 36 * fill : 0);
  const top = $derived(level - foamH); // y der Schaumoberkante
  const bumps = [34, 58, 82, 106, 130, 154, 178, 202];
</script>

<svg viewBox="0 0 220 420" aria-hidden="true" class="beer">
  <defs>
    <!-- Schale, nach oben verlängert, damit die Schaumkrone über den Rand ragen darf -->
    <clipPath id="bowl-{id}"><path d="M62 -40L60 30C48 90 40 160 64 224C80 266 100 296 102 322H118C120 296 140 266 156 224C180 160 172 90 160 30L158 -40Z" /></clipPath>
    <clipPath id="beer-{id}"><rect x="0" y={level} width="220" height={Math.max(0, FLOOR - level)} /></clipPath>
    <linearGradient id="gold-{id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd43d" />
      <stop offset="1" stop-color="#e08a00" />
    </linearGradient>
    <linearGradient id="shade-{id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7a3d00" stop-opacity=".28" />
      <stop offset=".3" stop-color="#fff" stop-opacity=".16" />
      <stop offset=".7" stop-color="#fff" stop-opacity="0" />
      <stop offset="1" stop-color="#7a3d00" stop-opacity=".3" />
    </linearGradient>
  </defs>

  <!-- leeres Glas: leicht getönt, damit man die Schale sieht -->
  <path d={glass} fill="rgba(200,225,235,.1)" />

  <g clip-path="url(#bowl-{id})">
    {#if fill > 0.005}
      <!-- Bier -->
      <rect x="0" y={level} width="220" height={FLOOR - level + 2} fill="url(#gold-{id})" />
      <rect x="0" y={level} width="220" height={FLOOR - level + 2} fill="url(#shade-{id})" />
      <!-- Bläschen: steigen vom Boden bis zum Bierspiegel -->
      <g clip-path="url(#beer-{id})">
        {#each Array.from({ length: bubbles }, (_, k) => k) as k}
          <circle class="bub" cx={86 + ((k * 23) % 50)} cy={FLOOR - 6} r={1.8 + (k % 3) * 0.9} fill="#fff7d6" opacity=".7" style="--k:{k}; --rise:{-(FLOOR - level)}px" />
        {/each}
      </g>
      <!-- Schaum: dichte Krone mit Wölkchen oben, dunklerer Übergang zum Bier -->
      {#if foamH > 0}
        <g class="foam">
          <rect x="0" y={top + 10} width="220" height={foamH - 8} fill="#fff6dc" />
          <rect x="0" y={level - 2} width="220" height="7" fill="#f2d98f" opacity=".85" />
          {#each bumps as bx, k}
            <circle cx={bx} cy={top + 12 + (k % 2) * 3} r={15 + (k % 3) * 2.5} fill="#fffaf0" />
          {/each}
        </g>
      {/if}
    {/if}
  </g>

  <!-- Eichstriche -->
  {#each marks as m}
    {@const y = FLOOR - m * (FLOOR - FULL)}
    <path d="M44 {y}H176" clip-path="url(#bowl-{id})" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width={stroke * 0.5} stroke-dasharray="10 8" />
  {/each}

  <!-- Reflexe auf dem Glas -->
  <path d="M74 62C66 110 66 160 80 214" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round" />
  <path d="M146 78C152 112 152 140 146 170" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="3" stroke-linecap="round" />
  <path d="M110 372V330" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="3" stroke-linecap="round" />
  <ellipse cx="110" cy="398" rx="40" ry="3.5" fill="#fff" fill-opacity=".22" />

  <!-- Kontur -->
  <path d={glass} fill="none" stroke="var(--ink)" stroke-width={stroke} stroke-linejoin="round" />
  <path d="M60 30H160" stroke="var(--ink)" stroke-width={stroke + 1.5} stroke-linecap="round" />

  {#if over}
    <!-- Schaum quillt über den Rand und läuft außen herunter -->
    <g class="over">
      <circle cx="70" cy="24" r="15" fill="#fffaf0" />
      <circle cx="110" cy="14" r="19" fill="#fffaf0" />
      <circle cx="150" cy="24" r="15" fill="#fffaf0" />
      <path d="M52 30C44 40 48 62 58 64L64 34Z" fill="#fffaf0" />
      <path d="M168 30C176 42 172 70 160 72L156 34Z" fill="#fffaf0" />
    </g>
  {/if}

  {@render children?.()}
</svg>

<style>
  .beer {
    display: block;
    overflow: visible;
  }

  .bub {
    animation: rise 3s linear infinite;
    animation-delay: calc(var(--k) * -0.62s);
  }

  @keyframes rise {
    from {
      transform: translateY(0);
      opacity: 0.8;
    }
    to {
      transform: translateY(var(--rise));
      opacity: 0.15;
    }
  }

  .foam {
    animation: bob 2.6s ease-in-out infinite;
  }

  @keyframes bob {
    50% {
      transform: translateY(-1.5px);
    }
  }

  .over {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @keyframes pop {
    from {
      transform: scale(0.4);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bub,
    .foam,
    .over {
      animation: none;
    }
  }
</style>
