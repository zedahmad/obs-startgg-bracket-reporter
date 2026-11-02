import fs from "fs";
import path from "path";
import {
  mergeScoreboardSettings,
  type ScoreboardSettings,
} from "../core/scoreboardSettings";

declare global {
  namespace NodeJS {
    interface Process {
      pkg?: unknown;
    }
  }
}

export type AppConfig = {
  STARTGG_API_TOKEN?: string;
  TOURNAMENT_SLUG?: string;
  SCOREBOARD_SETTINGS?: ScoreboardSettings;
};

const appDir = process.pkg ? path.dirname(process.execPath) : process.cwd();
const configPath = path.join(appDir, "config.json");

export function readConfig(): AppConfig {
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          STARTGG_API_TOKEN: "",
          TOURNAMENT_SLUG: "",
        },
        null,
        2,
      ),
    );
  }

  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

export function saveConfig(config: AppConfig) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function getStartggApiKey() {
  const config = readConfig();

  return process.env.STARTGG_API_TOKEN || config.STARTGG_API_TOKEN || "";
}

export function getTournamentSlug() {
  const config = readConfig();

  return process.env.TOURNAMENT_SLUG || config.TOURNAMENT_SLUG || "";
}

export function getScoreboardSettings() {
  return mergeScoreboardSettings(readConfig().SCOREBOARD_SETTINGS);
}
