import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeApiKey, loadDotEnv } from "./env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

await loadDotEnv(path.join(rootDir, ".env"));

const apiKey = process.env.ODDS_API_KEY;
console.log(`ODDS_API_KEY is ${describeApiKey(apiKey)}.`);

if (!apiKey || describeApiKey(apiKey) === "placeholder") {
  console.log("Add the real key from your The Odds API account dashboard to .env, then run this again.");
  process.exit(1);
}

const url = new URL("https://api.the-odds-api.com/v4/sports/");
url.searchParams.set("apiKey", apiKey);

const response = await fetch(url);
const body = await response.text();

if (!response.ok) {
  console.log(`The Odds API validation failed (${response.status}).`);
  console.log(body);
  process.exit(1);
}

const sports = JSON.parse(body);
const nfl = sports.find((sport) => sport.key === "americanfootball_nfl");
console.log("The Odds API key is valid.");
console.log(nfl ? `NFL sport key is available: ${nfl.key}` : "NFL is not currently listed by /sports.");
