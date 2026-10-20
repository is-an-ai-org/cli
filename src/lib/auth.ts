import { execSync } from "child_process";
import { loadConfig } from "./config.js";

export type AuthMode = "api" | "pr";

export interface AuthContext {
  mode: AuthMode;
  jwt?: string;
  githubToken?: string;
}

function getGhAuthToken(): string | null {
  try {
    return execSync("gh auth token", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

export function isJwtExpired(jwt: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString());
    return typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function resolveAuth(preferredMode?: AuthMode): AuthContext {
  const config = loadConfig();

  if (preferredMode === "api") {
    if (!config?.jwt || isJwtExpired(config.jwt)) {
      throw new Error("No active API session. Run `is-an-ai login` to authenticate.");
    }
    return { mode: "api", jwt: config.jwt };
  }

  // Check JWT first
  if (config?.jwt && !isJwtExpired(config.jwt)) {
    if (!preferredMode) {
      return { mode: "api", jwt: config.jwt };
    }
  }

  // Check GitHub token
  const ghToken = process.env.GITHUB_TOKEN || getGhAuthToken();
  if (ghToken) {
    if (!preferredMode || preferredMode === "pr") {
      return { mode: "pr", githubToken: ghToken };
    }
  }

  // If preferred mode is pr but no github token
  if (preferredMode === "pr" && !ghToken) {
    throw new Error("No GitHub token found. Set GITHUB_TOKEN or install GitHub CLI (`gh`).");
  }

  throw new Error(
    "No authentication available.\n" +
    "  - Run `is-an-ai login` for API mode\n" +
    "  - Set GITHUB_TOKEN or install GitHub CLI (`gh`) for PR mode"
  );
}
