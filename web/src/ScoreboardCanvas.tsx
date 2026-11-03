import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type RefObject,
} from "react";
import type {
  BackgroundSettings,
  ScoreboardSettings,
} from "./scoreboardSettings";

type PlayerPreview = {
  name: string;
  sponsor: string;
  countryCode: string;
  score: number;
};

type CharacterPreview = {
  codename: string;
  displayName: string;
  imagePath: string;
  defeated?: boolean;
};

type ScoreboardCanvasProps = {
  settings: ScoreboardSettings;
  player1?: PlayerPreview;
  player2?: PlayerPreview;
  player1Characters?: CharacterPreview[];
  player2Characters?: CharacterPreview[];
  round?: string;
  className?: string;
};

function backgroundValue(background: BackgroundSettings) {
  return (
    background.customCss.trim() ||
    `linear-gradient(${background.angle}deg, ${background.startColor}, ${background.endColor})`
  );
}

function countryCodeToFlag(countryCode: string) {
  return [...countryCode.toUpperCase()]
    .map((character) =>
      String.fromCodePoint(character.charCodeAt(0) + 127397),
    )
    .join("");
}

function fitPlayerName(
  ref: RefObject<HTMLSpanElement | null>,
  fontSize: number,
) {
  const element = ref.current;
  if (!element) return;
  const availableWidth = element.parentElement?.clientWidth ?? 0;

  element.style.fontSize = `${fontSize}px`;
  element.style.transform = "scaleX(1)";

  if (availableWidth <= 0 || element.scrollWidth <= availableWidth) return;
  element.style.transform = `scaleX(${Math.max(
    0.35,
    availableWidth / element.scrollWidth,
  )})`;
}

export default function ScoreboardCanvas({
  settings,
  player1 = {
    name: "PLAYER ONE",
    sponsor: "SPONSOR",
    countryCode: "US",
    score: 2,
  },
  player2 = {
    name: "PLAYER TWO",
    sponsor: "SPONSOR",
    countryCode: "JP",
    score: 1,
  },
  player1Characters = [
    {
      codename: "Ryu",
      displayName: "Ryu",
      imagePath: "/assets/characters/sf3ts/Ryu.png",
      defeated: true,
    },
    {
      codename: "Chun-Li",
      displayName: "Chun-Li",
      imagePath: "/assets/characters/sf3ts/Chun-Li.png",
    },
    {
      codename: "Ken",
      displayName: "Ken",
      imagePath: "/assets/characters/sf3ts/Ken.png",
    },
  ],
  player2Characters = [
    {
      codename: "Yun",
      displayName: "Yun",
      imagePath: "/assets/characters/sf3ts/Yun.png",
    },
    {
      codename: "Makoto",
      displayName: "Makoto",
      imagePath: "/assets/characters/sf3ts/Makoto.png",
    },
    {
      codename: "Dudley",
      displayName: "Dudley",
      imagePath: "/assets/characters/sf3ts/Dudley.png",
      defeated: true,
    },
  ],
  round = "WINNERS FINAL",
  className = "",
}: ScoreboardCanvasProps) {
  const p1NameRef = useRef<HTMLSpanElement>(null);
  const p2NameRef = useRef<HTMLSpanElement>(null);
  const { canvas, elements, text } = settings;
  const showSponsors = text.sponsorTagsEnabled;
  const showSeparator =
    showSponsors &&
    text.sponsorTagSeparatorEnabled &&
    Boolean(text.sponsorTagSeparator);
  const showFlags = text.playerFlagsEnabled;

  useLayoutEffect(() => {
    let active = true;
    const fitNames = () => {
      if (!active) return;
      fitPlayerName(p1NameRef, text.playerNameSize);
      fitPlayerName(p2NameRef, text.playerNameSize);
    };

    fitNames();
    window.addEventListener("resize", fitNames);
    if (document.fonts?.ready) {
      void document.fonts.ready.then(fitNames);
    }

    return () => {
      active = false;
      window.removeEventListener("resize", fitNames);
    };
  }, [settings, player1, player2, text.playerNameSize]);

  const variables = {
    "--canvas-width": `${canvas.width}px`,
    "--canvas-height": `${canvas.height}px`,
    "--scoreboard-font-family": text.fontFamily,
    "--player-name-size": `${text.playerNameSize}px`,
    "--player-name-color": text.playerNameColor,
    "--sponsor-tag-size": `${text.sponsorTagSize}px`,
    "--sponsor-tag-color": text.sponsorTagColor,
    "--sponsor-tag-weight": String(text.sponsorTagWeight),
    "--score-size": `${text.scoreSize}px`,
    "--score-color": text.scoreColor,
    "--round-size": `${text.roundSize}px`,
    "--round-color": text.roundColor,
    "--p1-x": `${elements.player1.x}px`,
    "--p1-y": `${elements.player1.y}px`,
    "--p1-width": `${elements.player1.width}px`,
    "--p1-height": `${elements.player1.height}px`,
    "--p1-score-width": `${elements.player1.scoreWidth}px`,
    "--p1-name-background": backgroundValue(
      elements.player1.nameBackground,
    ),
    "--p1-score-background": backgroundValue(
      elements.player1.scoreBackground,
    ),
    "--p1-display": elements.player1.enabled ? "flex" : "none",
    "--p2-x": `${elements.player2.x}px`,
    "--p2-y": `${elements.player2.y}px`,
    "--p2-width": `${elements.player2.width}px`,
    "--p2-height": `${elements.player2.height}px`,
    "--p2-score-width": `${elements.player2.scoreWidth}px`,
    "--p2-name-background": backgroundValue(
      elements.player2.nameBackground,
    ),
    "--p2-score-background": backgroundValue(
      elements.player2.scoreBackground,
    ),
    "--p2-display": elements.player2.enabled ? "flex" : "none",
    "--p1-characters-x": `${elements.player1Characters.x}px`,
    "--p1-characters-y": `${elements.player1Characters.y}px`,
    "--p1-characters-width": `${elements.player1Characters.width}px`,
    "--p1-characters-height": `${elements.player1Characters.height}px`,
    "--p1-characters-display": elements.player1Characters.enabled
      ? "flex"
      : "none",
    "--p2-characters-x": `${elements.player2Characters.x}px`,
    "--p2-characters-y": `${elements.player2Characters.y}px`,
    "--p2-characters-width": `${elements.player2Characters.width}px`,
    "--p2-characters-height": `${elements.player2Characters.height}px`,
    "--p2-characters-display": elements.player2Characters.enabled
      ? "flex"
      : "none",
    "--round-x": `${elements.round.x}px`,
    "--round-y": `${elements.round.y}px`,
    "--round-width": `${elements.round.width}px`,
    "--round-height": `${elements.round.height}px`,
    "--round-background": backgroundValue(elements.round.background),
    "--round-display": elements.round.enabled ? "block" : "none",
  } as CSSProperties;

  return (
    <div
      id="scoreboard-root"
      className={`scoreboard-canvas visible ${className}`.trim()}
      style={variables}
    >
      <div id="match-info">
        <div id="matchPill">
          <span id="matchLabel">{round}</span>
        </div>
      </div>

      <div id="p1-block">
        <div className="name-panel p1">
          <div className="losers-badge" id="p1Losers">
            L
          </div>
          <span className="player-flag" id="p1Flag" hidden={!showFlags}>
            {countryCodeToFlag(player1.countryCode)}
          </span>
          <div className="player-name">
            <span className="player-name-text" id="p1Name" ref={p1NameRef}>
              <span
                className="sponsor-tag"
                id="p1Sponsor"
                hidden={!showSponsors}
              >
                {player1.sponsor}
              </span>
              <span
                className="sponsor-separator"
                id="p1SponsorSeparator"
                hidden={!showSeparator}
              >
                {text.sponsorTagSeparator}
              </span>
              <span className="player-tag" id="p1Tag">
                {player1.name}
              </span>
            </span>
          </div>
        </div>
        <div className="score-box">
          <span className="score-val" id="p1Score">
            {player1.score}
          </span>
        </div>
      </div>

      <div id="p2-block">
        <div className="score-box">
          <span className="score-val" id="p2Score">
            {player2.score}
          </span>
        </div>
        <div className="name-panel p2">
          <div className="player-name">
            <span className="player-name-text" id="p2Name" ref={p2NameRef}>
              <span className="player-tag" id="p2Tag">
                {player2.name}
              </span>
              <span
                className="sponsor-separator"
                id="p2SponsorSeparator"
                hidden={!showSeparator}
              >
                {text.sponsorTagSeparator}
              </span>
              <span
                className="sponsor-tag"
                id="p2Sponsor"
                hidden={!showSponsors}
              >
                {player2.sponsor}
              </span>
            </span>
          </div>
          <div className="losers-badge" id="p2Losers">
            L
          </div>
          <span className="player-flag" id="p2Flag" hidden={!showFlags}>
            {countryCodeToFlag(player2.countryCode)}
          </span>
        </div>
      </div>

      <div
        className="character-rail p1"
        id="p1Characters"
        hidden={player1Characters.length === 0}
      >
        {player1Characters.map((character) => (
          <div
            className={`character-icon ${
              character.defeated ? "is-defeated" : ""
            }`}
            key={character.codename}
          >
            <img
              src={character.imagePath}
              alt={character.displayName}
              draggable={false}
            />
          </div>
        ))}
      </div>

      <div
        className="character-rail p2"
        id="p2Characters"
        hidden={player2Characters.length === 0}
      >
        {[...player2Characters].reverse().map((character) => (
          <div
            className={`character-icon ${
              character.defeated ? "is-defeated" : ""
            }`}
            key={character.codename}
          >
            <img
              src={character.imagePath}
              alt={character.displayName}
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
