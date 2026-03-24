import { OAuth2Client } from "google-auth-library";

let client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }
  if (!client) {
    client = new OAuth2Client(audience);
  }
  return client;
}

export type GoogleTokenPayload = {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
};

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload> {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }

  const ticket = await getClient().verifyIdToken({
    idToken,
    audience,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Invalid Google token payload");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name,
    picture: payload.picture,
  };
}
