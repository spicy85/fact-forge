import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { updateSourceSchema, updateScoringSettingsSchema } from "@shared/schema";
import express from "express";
import path from "path";

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve static files from public directory
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Facts API endpoint (now serving verified facts)
  app.get("/api/facts", async (req, res) => {
    try {
      const allFacts = await storage.getAllVerifiedFacts();
      res.json(allFacts);
    } catch (error) {
      console.error("Error fetching verified facts:", error);
      res.status(500).json({ error: "Failed to fetch facts" });
    }
  });

  // Facts Evaluation API endpoint
  app.get("/api/facts-evaluation", async (req, res) => {
    try {
      const allEvaluations = await storage.getAllFactsEvaluation();
      res.json(allEvaluations);
    } catch (error) {
      console.error("Error fetching facts evaluation:", error);
      res.status(500).json({ error: "Failed to fetch facts evaluation" });
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

  // Scoring Settings API endpoints
  app.get("/api/scoring-settings", async (req, res) => {
    try {
      const settings = await storage.getScoringSettings();
      res.json(settings || null);
    } catch (error) {
      console.error("Error fetching scoring settings:", error);
      res.status(500).json({ error: "Failed to fetch scoring settings" });
    }
  });

  app.put("/api/scoring-settings", async (req, res) => {
    try {
      const validatedData = updateScoringSettingsSchema.parse(req.body);
      const updatedSettings = await storage.upsertScoringSettings(validatedData);
      res.json(updatedSettings);
    } catch (error) {
      console.error("Error updating scoring settings:", error);
      res.status(400).json({ error: "Failed to update scoring settings" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
