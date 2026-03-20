import { google } from "googleapis";
import { config } from "./env";
import { getSupabaseClient } from "./supabase";

async function getOAuthTokens(): Promise<any | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("Settings")
      .select("value")
      .eq("key", "google_drive_oauth_tokens")
      .single();

    if (error || !data?.value) {
      return null;
    }

    return JSON.parse(data.value) as any;
  } catch (error) {
    console.error("Failed to retrieve OAuth tokens:", error);
    return null;
  }
}

export async function saveOAuthTokens(tokens: any): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("Settings")
    .upsert({
      key: "google_drive_oauth_tokens",
      value: JSON.stringify(tokens),
    });

  if (error) {
    throw new Error(`Failed to save OAuth tokens: ${error.message}`);
  }
}

/**
 * Creates and returns an authenticated Google Drive v3 client
 * using the configured service-account credentials.
 */
export async function initializeDriveClient() {

  try {
    const clientId = config.googleDrive.clientId;
    const clientSecret = config.googleDrive.clientSecret;
    const redirectUri = config.googleDrive.redirectUri;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        "Missing Google OAuth credentials: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI must be set"
      );
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Get stored tokens
    const tokens = await getOAuthTokens();
    if (!tokens) {
      throw new Error(
        "Google Drive not connected. Please connect your Google Drive account in Settings."
      );
    }

    // Set credentials
    oauth2Client.setCredentials(tokens);

    // Always save refreshed tokens back to database
    oauth2Client.on("tokens", async (newTokens) => {
      console.log("🔄 OAuth tokens refreshed");
      try {
        await saveOAuthTokens({
          access_token: newTokens.access_token!,
          // Keep existing refresh_token if a new one isn't provided
          refresh_token: newTokens.refresh_token || tokens.refresh_token,
          scope: tokens.scope,
          token_type: newTokens.token_type || tokens.token_type,
          expiry_date: newTokens.expiry_date || tokens.expiry_date,
        });
        console.log("✓ Refreshed tokens saved to database");
      } catch (saveError) {
        console.error("⚠️ Failed to save refreshed tokens:", saveError);
      }
    });

    // Proactively refresh the token if it's expired or about to expire (within 5 minutes)
    const now = Date.now();
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    if (tokens.expiry_date && tokens.expiry_date - now < bufferMs) {
      console.log("🔄 Access token expired or expiring soon, refreshing...");
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        console.log("✓ Access token refreshed proactively");
      } catch (refreshError) {
        console.error("⚠️ Failed to proactively refresh token:", refreshError);
        throw new Error(
          "Google Drive access token expired and refresh failed. Please re-connect your Google Drive account in Settings."
        );
      }
    }

    // Create and return Drive client
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    console.log("✓ Google Drive client initialized with OAuth2");
    return drive;
  } catch (error) {
    console.error("Failed to initialize Google Drive client:", error);
    throw new Error(
      `Google Drive initialization failed: ${error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Returns the configured root Google Drive folder ID, or null if unset.
 */
export function getDefaultDriveFolderId(): string | null {
  return config.googleDrive.defaultFolderId;
}
