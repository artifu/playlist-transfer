import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { importPKCS8, SignJWT } from "jose";

loadEnv();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const teamId = requireEnv("APPLE_TEAM_ID");
  const keyId = requireEnv("APPLE_KEY_ID");
  const privateKeyPath = resolve(requireEnv("APPLE_MUSIC_PRIVATE_KEY_PATH"));
  const privateKeyPem = await readFile(privateKeyPath, "utf8");
  const privateKey = await importPKCS8(privateKeyPem, "ES256");

  const token = await new SignJWT({})
    .setProtectedHeader({
      alg: "ES256",
      kid: keyId
    })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(privateKey);

  console.log(token);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
