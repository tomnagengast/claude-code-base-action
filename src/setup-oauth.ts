import { mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

interface StoredCredentials {
  claudeAiOauth: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
  };
}

interface RefreshTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function refreshAccessToken(refreshToken: string): Promise<RefreshTokenResponse> {
  const response = await fetch("https://api.anthropic.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<RefreshTokenResponse>;
}

async function loadCredentials(): Promise<StoredCredentials | null> {
  const claudeDir = join(homedir(), ".claude");
  const credentialsPath = join(claudeDir, ".credentials.json");

  try {
    const credentialsContent = await readFile(credentialsPath, "utf-8");
    return JSON.parse(credentialsContent);
  } catch (error) {
    return null;
  }
}

async function saveCredentials(credentials: StoredCredentials): Promise<void> {
  const claudeDir = join(homedir(), ".claude");
  const credentialsPath = join(claudeDir, ".credentials.json");

  await mkdir(claudeDir, { recursive: true });
  await writeFile(credentialsPath, JSON.stringify(credentials, null, 2));
}

export async function ensureValidToken(): Promise<void> {
  const credentials = await loadCredentials();
  
  if (!credentials) {
    throw new Error("No OAuth credentials found. Please set up OAuth first.");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = credentials.claudeAiOauth.expiresAt;

  // Check if token expires within the next 5 minutes (300 seconds buffer)
  if (expiresAt - now <= 300) {
    console.log("Access token expired or expiring soon, refreshing...");
    
    try {
      const refreshResponse = await refreshAccessToken(credentials.claudeAiOauth.refreshToken);
      
      // Update credentials with new token
      credentials.claudeAiOauth.accessToken = refreshResponse.access_token;
      credentials.claudeAiOauth.refreshToken = refreshResponse.refresh_token;
      credentials.claudeAiOauth.expiresAt = now + refreshResponse.expires_in;
      
      await saveCredentials(credentials);
      console.log("Access token refreshed successfully");
    } catch (error) {
      throw new Error(`Failed to refresh OAuth token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export async function setupOAuthCredentials(credentials: OAuthCredentials) {
  const claudeDir = join(homedir(), ".claude");
  const credentialsPath = join(claudeDir, ".credentials.json");

  // Create the .claude directory if it doesn't exist
  await mkdir(claudeDir, { recursive: true });

  // Create the credentials JSON structure
  const credentialsData = {
    claudeAiOauth: {
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      expiresAt: parseInt(credentials.expiresAt),
      scopes: ["user:inference", "user:profile"],
    },
  };

  // Write the credentials file
  await writeFile(credentialsPath, JSON.stringify(credentialsData, null, 2));

  console.log(`OAuth credentials written to ${credentialsPath}`);
}
