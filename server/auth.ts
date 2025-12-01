// Google OAuth authentication using Passport
import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

// Extend Express.User to include our user data
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
    }
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

async function upsertUser(profile: Profile) {
  const email = profile.emails?.[0]?.value || "";
  const firstName = profile.name?.givenName || null;
  const lastName = profile.name?.familyName || null;
  const profileImageUrl = profile.photos?.[0]?.value || null;

  await storage.upsertUser({
    id: profile.id,
    email,
    firstName,
    lastName,
    profileImageUrl,
  });

  return {
    id: profile.id,
    email,
    firstName,
    lastName,
    profileImageUrl,
  };
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    console.warn("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not found, skipping Google Auth setup");
    passport.serializeUser((user: Express.User, cb) => cb(null, user));
    passport.deserializeUser((user: Express.User, cb) => cb(null, user));
    return;
  }

  // Configure Google Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL: "/api/auth/google/callback",
        scope: ["profile", "email"],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = await upsertUser(profile);
          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );

  // Serialize user to session
  passport.serializeUser((user: Express.User, cb) => {
    cb(null, user);
  });

  // Deserialize user from session
  passport.deserializeUser((user: Express.User, cb) => {
    cb(null, user);
  });

  // Google OAuth login route
  app.get("/api/auth/google", passport.authenticate("google", {
    scope: ["profile", "email"],
  }));

  // Google OAuth callback route
  app.get("/api/auth/google/callback",
    passport.authenticate("google", {
      failureRedirect: "/login",
    }),
    (_req, res) => {
      // Successful authentication, redirect to home or play page
      res.redirect("/");
    }
  );

  // Logout route
  app.get("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
      }
      res.redirect("/");
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};

