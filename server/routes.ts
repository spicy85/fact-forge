import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import express from "express";
import path from "path";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve static files from public directory
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Facts API endpoint
  app.get("/api/facts", async (req, res) => {
    try {
      const allFacts = await storage.getAllFacts();
      res.json(allFacts);
    } catch (error) {
      console.error("Error fetching facts:", error);
      res.status(500).json({ error: "Failed to fetch facts" });
    }
  });

  // Sources API endpoint
  app.get("/api/sources", async (req, res) => {
    try {
      const allSources = await storage.getAllSources();
      res.json(allSources);
    } catch (error) {
      console.error("Error fetching sources:", error);
      res.status(500).json({ error: "Failed to fetch sources" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
