(function () {
  "use strict";

  // ── Config ────────────────────────────────────────────────────────────────

  /** Read ?stream=<id> from URL; null = show first active match */
  const params = new URLSearchParams(window.location.search);
  const TARGET_STREAM_ID = params.get("stream") || null;
  const TARGET_DISPLAY_KEY = TARGET_STREAM_ID || "default";

  // ── DOM refs ──────────────────────────────────────────────────────────────

  const root        = document.getElementById("root");
  const p1Name      = document.getElementById("p1Name");
  const p2Name      = document.getElementById("p2Name");
  const p1Score     = document.getElementById("p1Score");
  const p2Score     = document.getElementById("p2Score");
  const p1Losers    = document.getElementById("p1Losers");
  const p2Losers    = document.getElementById("p2Losers");
  const matchLabel  = document.getElementById("matchLabel");
  const matchPill   = document.getElementById("matchPill");

  // ── State ─────────────────────────────────────────────────────────────────

  let currentMatch = null;
  let swapped = false;
  let displayVisible = true;
  let playerNameBaseFontSize = 28;

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
    const { canvas, text, elements } = settings;

    setPixelVariable("--canvas-width", canvas.width);
    setPixelVariable("--canvas-height", canvas.height);
    rootStyle.setProperty("--scoreboard-font-family", text.fontFamily);
    setPixelVariable("--player-name-size", text.playerNameSize);
    rootStyle.setProperty("--player-name-color", text.playerNameColor);
    setPixelVariable("--score-size", text.scoreSize);
    rootStyle.setProperty("--score-color", text.scoreColor);
    setPixelVariable("--round-size", text.roundSize);
    rootStyle.setProperty("--round-color", text.roundColor);

    for (const [key, element] of [
      ["p1", elements.player1],
      ["p2", elements.player2],
    ]) {
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

    setPixelVariable("--round-x", elements.round.x);
    setPixelVariable("--round-y", elements.round.y);
    setPixelVariable("--round-width", elements.round.width);
    setPixelVariable("--round-height", elements.round.height);
    rootStyle.setProperty(
      "--round-background",
      backgroundValue(elements.round.background),
    );

    playerNameBaseFontSize = text.playerNameSize;
    requestAnimationFrame(fitAllPlayerNames);
  }

  function fitPlayerName(el) {
    const baseFontSize = playerNameBaseFontSize;
    el.style.fontSize = `${baseFontSize}px`;
    el.style.letterSpacing = "0px";

    if (
      !el.textContent ||
      el.clientWidth <= 0 ||
      el.scrollWidth <= el.clientWidth
    ) return;

    const fittedSize = Math.max(
      8,
      Math.floor(baseFontSize * (el.clientWidth / el.scrollWidth))
    );
    el.style.fontSize = `${fittedSize}px`;

    if (el.scrollWidth > el.clientWidth && el.textContent.length > 1) {
      const overflow = el.scrollWidth - el.clientWidth;
      el.style.letterSpacing =
        `${Math.max(-2, -overflow / (el.textContent.length - 1))}px`;
    }
  }

  function fitAllPlayerNames() {
    fitPlayerName(p1Name);
    fitPlayerName(p2Name);
  }

  function setTextFade(el, newText) {
    if (el.textContent === newText) {
      fitPlayerName(el);
      return;
    }
    el.classList.add("changing");
    setTimeout(() => {
      el.textContent = newText;
      el.classList.remove("changing");
      requestAnimationFrame(() => fitPlayerName(el));
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

  function findMatch(matchMap) {
    if (!matchMap) return null;
    const matches = Object.values(matchMap);
    if (TARGET_STREAM_ID) {
      return matches.find(
        (m) => m.streamId === TARGET_STREAM_ID && m.status !== "complete"
      ) || null;
    }
    // No stream specified — use only the match explicitly selected in the app.
    return matches.find(
      (m) => Boolean(m.streamId) && m.status !== "complete"
    ) || null;
  }

  function renderMatch(match) {
    if (!match) {
      updateVisibility(false);
      currentMatch = null;
      return;
    }

    const isNew = !currentMatch || currentMatch.id !== match.id;

    // Determine display sides (respect swap)
    const leftPlayer  = swapped ? match.player2 : match.player1;
    const rightPlayer = swapped ? match.player1 : match.player2;
    const leftScore   = swapped ? match.score2  : match.score1;
    const rightScore  = swapped ? match.score1  : match.score2;

    // Player names
    setTextFade(p1Name, leftPlayer?.name ?? "P1");
    setTextFade(p2Name, rightPlayer?.name ?? "P2");

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
    const state = displayMap[TARGET_DISPLAY_KEY] || displayMap["default"];
    if (!state) return;

    const wasSwapped = swapped;
    swapped = state.swapped ?? false;
    displayVisible = state.visible ?? true;
    updateVisibility(displayVisible && Boolean(currentMatch));

    // Re-render if swap changed
    if (wasSwapped !== swapped && currentMatch) {
      renderMatch(currentMatch);
    }
  });

  socket.on("scoreboard:settings", (settings) => {
    applyScoreboardSettings(settings);
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
