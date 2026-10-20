import { loadConfig } from "../lib/config.js";
import { isJwtExpired } from "../lib/auth.js";

export function whoami(): void {
  const config = loadConfig();
  if (!config?.user || !config.jwt || isJwtExpired(config.jwt)) {
    console.log("No active API session. Run `is-an-ai login` to authenticate.");
    process.exitCode = 1;
    return;
  }
  console.log(`${config.user.name} (${config.user.email})`);
}
