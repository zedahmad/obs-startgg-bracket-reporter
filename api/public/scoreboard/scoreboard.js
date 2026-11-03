(function () {
  "use strict";

  // ── DOM refs ──────────────────────────────────────────────────────────────

  const root        = document.getElementById("scoreboard-root");
  const p1Name      = document.getElementById("p1Name");
  const p2Name      = document.getElementById("p2Name");
  const p1Flag      = document.getElementById("p1Flag");
  const p2Flag      = document.getElementById("p2Flag");
  const p1Sponsor   = document.getElementById("p1Sponsor");
  const p2Sponsor   = document.getElementById("p2Sponsor");
  const p1Separator = document.getElementById("p1SponsorSeparator");
  const p2Separator = document.getElementById("p2SponsorSeparator");
  const p1Tag       = document.getElementById("p1Tag");
  const p2Tag       = document.getElementById("p2Tag");
  const p1Score     = document.getElementById("p1Score");
  const p2Score     = document.getElementById("p2Score");
  const p1Characters = document.getElementById("p1Characters");
  const p2Characters = document.getElementById("p2Characters");
  const matchLabel  = document.getElementById("matchLabel");
  const matchPill   = document.getElementById("matchPill");
  const p1Identity  = {
    container: p1Name,
    flag: p1Flag,
    sponsor: p1Sponsor,
    separator: p1Separator,
    tag: p1Tag,
  };
  const p2Identity  = {
    container: p2Name,
    flag: p2Flag,
    sponsor: p2Sponsor,
    separator: p2Separator,
    tag: p2Tag,
  };

  // ── State ─────────────────────────────────────────────────────────────────

  let currentMatch = null;
  let currentDraft = null;
  let swapped = false;
  let displayVisible = true;
  let playerNameBaseFontSize = 28;
  let sponsorTagsEnabled = true;
  let playerFlagsEnabled = false;
  let sponsorTagSeparator = "|";
  let sponsorTagSeparatorEnabled = false;
  let countryCodeLookup = null;
  let displayState = {};

  // ── Helpers ───────────────────────────────────────────────────────────────

  function flashScore(el) {
    el.classList.remove("flash");
    // Trigger reflow so the animation re-runs
    void el.offsetWidth;
    el.classList.add("flash");
  }

  function backgroundValue(background) {
    return background.customCss.trim() ||
      `linear-gradient(${background.angle}deg, ${background.startColor}, ${background.endColor})`;
  }

  function setPixelVariable(name, value) {
    document.documentElement.style.setProperty(name, `${value}px`);
  }

  function applyScoreboardSettings(settings) {
    const rootStyle = document.documentElement.style;
    const canvasStyle = root.style;
    const { canvas, text, elements } = settings;

    setPixelVariable("--canvas-width", canvas.width);
    setPixelVariable("--canvas-height", canvas.height);
    canvasStyle.setProperty("--canvas-width", `${canvas.width}px`);
    canvasStyle.setProperty("--canvas-height", `${canvas.height}px`);
    rootStyle.setProperty("--scoreboard-font-family", text.fontFamily);
    setPixelVariable("--player-name-size", text.playerNameSize);
    rootStyle.setProperty("--player-name-color", text.playerNameColor);
    setPixelVariable("--sponsor-tag-size", text.sponsorTagSize);
    rootStyle.setProperty("--sponsor-tag-color", text.sponsorTagColor);
    rootStyle.setProperty("--sponsor-tag-weight", text.sponsorTagWeight);
    setPixelVariable("--score-size", text.scoreSize);
    rootStyle.setProperty("--score-color", text.scoreColor);
    setPixelVariable("--round-size", text.roundSize);
    rootStyle.setProperty("--round-color", text.roundColor);

    for (const [key, element] of [
      ["p1", elements.player1],
      ["p2", elements.player2],
    ]) {
      rootStyle.setProperty(
        `--${key}-display`,
        element.enabled ? "flex" : "none",
      );
      setPixelVariable(`--${key}-x`, element.x);
      setPixelVariable(`--${key}-y`, element.y);
      setPixelVariable(`--${key}-width`, element.width);
      setPixelVariable(`--${key}-height`, element.height);
      setPixelVariable(`--${key}-score-width`, element.scoreWidth);
      rootStyle.setProperty(
        `--${key}-name-background`,
        backgroundValue(element.nameBackground),
      );
      rootStyle.setProperty(
        `--${key}-score-background`,
        backgroundValue(element.scoreBackground),
      );
    }

    for (const [key, element] of [
      ["p1", elements.player1Characters],
      ["p2", elements.player2Characters],
    ]) {
      rootStyle.setProperty(
        `--${key}-characters-display`,
        element.enabled ? "flex" : "none",
      );
      setPixelVariable(`--${key}-characters-x`, element.x);
      setPixelVariable(`--${key}-characters-y`, element.y);
      setPixelVariable(`--${key}-characters-width`, element.width);
      setPixelVariable(`--${key}-characters-height`, element.height);
    }

    setPixelVariable("--round-x", elements.round.x);
    setPixelVariable("--round-y", elements.round.y);
    setPixelVariable("--round-width", elements.round.width);
    setPixelVariable("--round-height", elements.round.height);
    rootStyle.setProperty(
      "--round-background",
      backgroundValue(elements.round.background),
    );
    rootStyle.setProperty(
      "--round-display",
      elements.round.enabled ? "block" : "none",
    );

    playerNameBaseFontSize = text.playerNameSize;
    sponsorTagsEnabled = text.sponsorTagsEnabled;
    playerFlagsEnabled = text.playerFlagsEnabled;
    sponsorTagSeparator = text.sponsorTagSeparator;
    sponsorTagSeparatorEnabled = text.sponsorTagSeparatorEnabled;

    if (currentMatch) {
      renderMatch(currentMatch);
    } else {
      requestAnimationFrame(fitAllPlayerNames);
    }
  }

  function fitPlayerName(el) {
    const baseFontSize = playerNameBaseFontSize;
    const availableWidth = el.parentElement?.clientWidth ?? 0;

    el.style.fontSize = `${baseFontSize}px`;
    el.style.transform = "scaleX(1)";

    if (
      !el.textContent ||
      availableWidth <= 0 ||
      el.scrollWidth <= availableWidth
    ) return;

    const fittedScale = Math.max(0.35, availableWidth / el.scrollWidth);
    el.style.transform = `scaleX(${fittedScale})`;
  }

  function fitAllPlayerNames() {
    fitPlayerName(p1Name);
    fitPlayerName(p2Name);
  }

  function normalizeCountryName(country) {
    return country
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function getCountryCodeLookup() {
    if (countryCodeLookup) return countryCodeLookup;

    countryCodeLookup = new Map([
      ["england", "GB"],
      ["northern ireland", "GB"],
      ["scotland", "GB"],
      ["united states of america", "US"],
      ["wales", "GB"],
    ]);

    if (typeof Intl.DisplayNames !== "function") return countryCodeLookup;

    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    for (let first = 65; first <= 90; first++) {
      for (let second = 65; second <= 90; second++) {
        const code = String.fromCharCode(first, second);
        const countryName = displayNames.of(code);
        if (countryName && countryName !== code) {
          countryCodeLookup.set(normalizeCountryName(countryName), code);
        }
      }
    }

    return countryCodeLookup;
  }

  function countryToFlag(country) {
    const normalizedCountry = country?.trim() || "";
    const countryCode = /^[A-Za-z]{2}$/.test(normalizedCountry)
      ? normalizedCountry.toUpperCase()
      : getCountryCodeLookup().get(normalizeCountryName(normalizedCountry));

    if (!countryCode) return "";

    return [...countryCode]
      .map((character) => String.fromCodePoint(character.charCodeAt(0) + 127397))
      .join("");
  }

  function setPlayerIdentity(refs, player, fallbackName) {
    const playerName = player?.name ?? fallbackName;
    const sponsor = sponsorTagsEnabled ? player?.sponsor?.trim() || "" : "";
    const flag = playerFlagsEnabled
      ? countryToFlag(player?.country)
      : "";
    const separator =
      sponsor && sponsorTagSeparatorEnabled ? sponsorTagSeparator : "";
    const identity = JSON.stringify([flag, sponsor, separator, playerName]);

    if (refs.container.dataset.identity === identity) {
      fitPlayerName(refs.container);
      return;
    }
    refs.container.classList.add("changing");
    setTimeout(() => {
      refs.flag.textContent = flag;
      refs.flag.hidden = !flag;
      refs.sponsor.textContent = sponsor;
      refs.sponsor.hidden = !sponsor;
      refs.separator.textContent = separator;
      refs.separator.hidden = !separator;
      refs.tag.textContent = playerName;
      refs.container.dataset.identity = identity;
      refs.container.classList.remove("changing");
      requestAnimationFrame(() => fitPlayerName(refs.container));
    }, 200);
  }

  function updateVisibility(visible) {
    if (visible) {
      root.classList.remove("hidden");
      root.classList.add("visible");
    } else {
      root.classList.remove("visible");
      root.classList.add("hidden");
    }
  }

  function applyDisplayState() {
    swapped = displayState.swapped ?? false;
    displayVisible = displayState.visible ?? true;
  }

  function findMatch(matchMap) {
    if (!matchMap) return null;
    return Object.values(matchMap).find(
      (match) => match.isScoreboardMatch && match.status !== "complete"
    ) || null;
  }

  function renderCharacterRail(container, picks, defeated, isRight, ruleset) {
    const characters = picks
      .map((codename) =>
        ruleset.characters.find((character) => character.codename === codename)
      )
      .filter(Boolean);
    const ordered = isRight ? [...characters].reverse() : characters;
    const defeatedSet = new Set(defeated);

    container.innerHTML = "";
    container.hidden = ordered.length === 0;
    for (const character of ordered) {
      const slot = document.createElement("div");
      slot.className = `character-icon${
        defeatedSet.has(character.codename) ? " is-defeated" : ""
      }`;

      const image = document.createElement("img");
      image.src = character.imagePath;
      image.alt = character.displayName;
      slot.appendChild(image);
      container.appendChild(slot);
    }
  }

  function renderDraft() {
    if (
      !currentMatch ||
      !currentDraft ||
      currentDraft.phase === "idle" ||
      currentDraft.matchId !== currentMatch.id ||
      !currentDraft.ruleset
    ) {
      p1Characters.hidden = true;
      p2Characters.hidden = true;
      return;
    }

    const leftPicks = swapped
      ? currentDraft.teamBPicks
      : currentDraft.teamAPicks;
    const rightPicks = swapped
      ? currentDraft.teamAPicks
      : currentDraft.teamBPicks;
    const leftDefeated = swapped
      ? currentDraft.teamBDefeated
      : currentDraft.teamADefeated;
    const rightDefeated = swapped
      ? currentDraft.teamADefeated
      : currentDraft.teamBDefeated;

    renderCharacterRail(
      p1Characters,
      leftPicks,
      leftDefeated,
      false,
      currentDraft.ruleset,
    );
    renderCharacterRail(
      p2Characters,
      rightPicks,
      rightDefeated,
      true,
      currentDraft.ruleset,
    );
  }

  function renderMatch(match) {
    if (!match) {
      updateVisibility(false);
      currentMatch = null;
      renderDraft();
      return;
    }

    applyDisplayState();
    const isNew = !currentMatch || currentMatch.id !== match.id;

    // Determine display sides (respect swap)
    const leftPlayer  = swapped ? match.player2 : match.player1;
    const rightPlayer = swapped ? match.player1 : match.player2;
    const leftScore   = swapped ? match.score2  : match.score1;
    const rightScore  = swapped ? match.score1  : match.score2;

    // Player identity
    setPlayerIdentity(p1Identity, leftPlayer, "P1");
    setPlayerIdentity(p2Identity, rightPlayer, "P2");

    // Scores
    const prevLeft  = parseInt(p1Score.textContent, 10);
    const prevRight = parseInt(p2Score.textContent, 10);

    if (isNew || leftScore !== prevLeft) {
      p1Score.textContent = String(leftScore);
      if (!isNew) flashScore(p1Score);
    }
    if (isNew || rightScore !== prevRight) {
      p2Score.textContent = String(rightScore);
      if (!isNew) flashScore(p2Score);
    }

    // Match label
    const label = match.round ? match.round.toUpperCase() : "";
    matchLabel.textContent = label;
    if (label) {
      matchPill.classList.remove("empty");
    } else {
      matchPill.classList.add("empty");
    }

    currentMatch = match;
    renderDraft();
    updateVisibility(displayVisible);
  }

  // ── Socket.io ─────────────────────────────────────────────────────────────

  const socket = io({ transports: ["websocket"] });

  socket.on("connect", () => {
    console.log("[scoreboard] connected");
  });

  socket.on("match:update", (matchMap) => {
    const match = findMatch(matchMap);
    renderMatch(match);
  });

  socket.on("scoreboard:display", (displayMap) => {
    const wasSwapped = swapped;
    displayState = displayMap || {};
    applyDisplayState();
    updateVisibility(displayVisible && Boolean(currentMatch));

    // Re-render if swap changed
    if (wasSwapped !== swapped && currentMatch) {
      renderMatch(currentMatch);
    }
  });

  socket.on("scoreboard:settings", (settings) => {
    applyScoreboardSettings(settings);
  });

  socket.on("draft:update", (state) => {
    currentDraft = state;
    renderDraft();
  });

  socket.on("disconnect", () => {
    console.warn("[scoreboard] disconnected — will reconnect automatically");
  });

  window.addEventListener("resize", fitAllPlayerNames);
  if (document.fonts?.ready) {
    document.fonts.ready.then(fitAllPlayerNames);
  }

  // Show initially as hidden until first data arrives
  root.classList.add("hidden");

})();
