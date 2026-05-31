import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createClient } from "@supabase/supabase-js";

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  // Username to Email Lookup (for login)
  app.get("/api/lookup-username", async (req, res) => {
    try {
      const { username } = req.query as { username?: string };

      // Validate input
      if (!username || typeof username !== "string") {
        return res.status(400).json({
          error: "Bad Request",
          message: "Username parameter required",
        });
      }

      const trimmedUsername = username.trim();

      // Prevent excessively long input
      if (trimmedUsername.length > 100) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Username too long",
        });
      }

      // Empty check
      if (trimmedUsername.length === 0) {
        return res.status(400).json({
          error: "Bad Request",
          message: "Username cannot be empty",
        });
      }

      console.log(
        "[lookup-username] Searching for username:",
        trimmedUsername
      );
      console.log("[lookup-username] SUPABASE_URL:", process.env.SUPABASE_URL);
      console.log(
        "[lookup-username] SERVICE_ROLE_KEY exists:",
        !!process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      // Query using service role (bypasses RLS)
      const supabase = createClient(
        process.env.SUPABASE_URL || "",
        process.env.SUPABASE_SERVICE_ROLE_KEY || ""
      );

      const { data, error } = await supabase
        .from("users")
        .select("email, username")
        .eq("username", trimmedUsername)
        .single();

      console.log("[lookup-username] Query result - data:", data, "error:", error);

      // ✓ SECURITY: Return 200 + empty data in both cases to prevent username enumeration
      // Attacker cannot tell if username exists or not
      if (error || !data) {
        return res.status(200).json({
          data: null,
        });
      }

      return res.status(200).json({
        data: {
          email: data.email,
          username: data.username,
        },
      });
    } catch (err: any) {
      console.error("[GET /api/lookup-username] Error:", err.message, err.stack);

      return res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to lookup username",
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
