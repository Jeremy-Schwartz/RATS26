import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export async function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = await readFile(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim().replace(/^\uFEFF/, "");
    const value = normalizeEnvValue(trimmed.slice(separatorIndex + 1));
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function normalizeEnvValue(value) {
  return value.trim().replace(/^["']|["']$/g, "");
}

export function describeApiKey(apiKey) {
  if (!apiKey) {
    return "missing";
  }

  if (/your_.*key|api_key_here|placeholder/i.test(apiKey)) {
    return "placeholder";
  }

  return `configured (${apiKey.length} characters)`;
}
