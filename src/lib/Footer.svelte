<footer class="footer">
  <div class="container">
    <div class="cols">
      <div class="about">
        <p class="brand">Trasse<b>26</b></p>
        <p>Eine Visualisierung meiner Bahnreisen. Uni-Projekt im Fach Information Design, 3. Semester.</p>
      </div>
      <div>
        <h4>Seiten</h4>
        <ul>
          <li><a href="#/karte">Karte</a></li>
          <li><a href="#/">Projekt</a></li>
          <li><a href="#/statistik">Statistik</a></li>
          <li><a href="#/ueber">So liest du die Karte</a></li>
        </ul>
      </div>
      <div>
        <h4>Quellen</h4>
        <ul>
          <li>DB-Reisehistorie (eigene Fahrten)</li>
          <li>
            Karte: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>,
            © <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a>,
            Daten © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
          </li>
        </ul>
      </div>
    </div>
    <p class="note">Kein offizielles Angebot der Deutschen Bahn.</p>
  </div>
</footer>

<style>
  .footer {
    margin-top: clamp(3rem, 6vw, 6rem);
    background: var(--panel);
    border-top: 1px solid var(--line);
    padding: clamp(2.5rem, 5vw, 4rem) 0 2rem;
    font-size: 0.98rem;
    color: var(--muted);
  }

  .cols {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1.4fr;
    gap: 2.5rem;
  }

  .brand {
    font-size: clamp(2rem, 3.4vw, 2.8rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1;
    color: var(--text);
    margin-bottom: 0.9rem;
  }

  .brand b {
    color: var(--red);
    margin-left: 0.2em;
  }

  h4 {
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text);
    margin-bottom: 0.8rem;
  }

  ul {
    list-style: none;
    display: grid;
    gap: 0.4rem;
  }

  a {
    text-underline-offset: 3px;
    text-decoration-color: var(--line);
    transition: color 160ms var(--ease), text-decoration-color 160ms var(--ease);
  }

  a:hover {
    color: var(--red);
    text-decoration-color: var(--red);
  }

  .note {
    margin-top: 2.5rem;
    padding-top: 1.2rem;
    border-top: 1px solid var(--line);
    font-size: 0.9rem;
  }

  @media (max-width: 800px) {
    .cols {
      grid-template-columns: 1fr;
      gap: 1.8rem;
    }
  }
</style>
