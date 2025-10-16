import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { updateSourceSchema } from "@shared/schema";
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

  // Update source metrics
  app.put("/api/sources/:domain", async (req, res) => {
    try {
      const { domain } = req.params;
      const validatedData = updateSourceSchema.parse(req.body);
      
      const updatedSource = await storage.updateSource(domain, validatedData);
      
      if (!updatedSource) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      res.json(updatedSource);
    } catch (error) {
      console.error("Error updating source:", error);
      res.status(400).json({ error: "Failed to update source" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
