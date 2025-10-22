import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertSourceSchema, updateSourceSchema, updateScoringSettingsSchema } from "@shared/schema";
import express from "express";
import path from "path";
import { z } from "zod";

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

  // Multi-source evaluations endpoint
  app.get("/api/multi-source-evaluations", async (req, res) => {
    try {
      const { entity, attribute } = req.query;
      
      if (!entity || !attribute || typeof entity !== 'string' || typeof attribute !== 'string') {
        return res.status(400).json({ error: "Entity and attribute parameters are required" });
      }
      
      const result = await storage.getMultiSourceEvaluations(entity, attribute);
      
      if (!result) {
        return res.json(null);
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching multi-source evaluations:", error);
      res.status(500).json({ error: "Failed to fetch multi-source evaluations" });
    }
  });

  // Recalculate all evaluation scores
  app.post("/api/facts-evaluation/recalculate", async (req, res) => {
    try {
      const updatedCount = await storage.recalculateAllEvaluations();
      res.json({ 
        success: true, 
        message: `Recalculated ${updatedCount} evaluation records`,
        updatedCount 
      });
    } catch (error) {
      console.error("Error recalculating evaluations:", error);
      res.status(500).json({ error: "Failed to recalculate evaluations" });
    }
  });

  // Cross-check all sources for missing facts
  app.post("/api/admin/cross-check-sources", async (req, res) => {
    try {
      const { crossCheckAllSources } = await import("../scripts/cross-check-sources");
      const stats = await crossCheckAllSources();
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error("Error during cross-check:", error);
      res.status(500).json({ error: "Failed to cross-check sources" });
    }
  });

  // Sources API endpoint
  app.get("/api/sources", async (req, res) => {
    try {
      const { status } = req.query;
      
      if (status && typeof status === 'string') {
        const sourcesByStatus = await storage.getSourcesByStatus(status);
        return res.json(sourcesByStatus);
      }
      
      const allSources = await storage.getAllSources();
      res.json(allSources);
    } catch (error) {
      console.error("Error fetching sources:", error);
      res.status(500).json({ error: "Failed to fetch sources" });
    }
  });

  // Create new source
  app.post("/api/sources", async (req, res) => {
    try {
      const validatedData = insertSourceSchema.parse(req.body);
      const newSource = await storage.insertSource(validatedData);
      res.status(201).json(newSource);
    } catch (error) {
      console.error("Error creating source:", error);
      res.status(400).json({ error: "Failed to create source" });
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

  // Promote source to trusted
  app.put("/api/sources/:domain/promote", async (req, res) => {
    try {
      const { domain } = req.params;
      const promotedSource = await storage.promoteSource(domain);
      
      if (!promotedSource) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      res.json(promotedSource);
    } catch (error) {
      console.error("Error promoting source:", error);
      res.status(400).json({ error: "Failed to promote source" });
    }
  });

  // Demote source back to pipeline
  app.put("/api/sources/:domain/demote", async (req, res) => {
    try {
      const { domain } = req.params;
      const demotedSource = await storage.demoteSource(domain);
      
      if (!demotedSource) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      res.json(demotedSource);
    } catch (error) {
      console.error("Error demoting source:", error);
      res.status(400).json({ error: "Failed to demote source" });
    }
  });

  // Reject source
  app.put("/api/sources/:domain/reject", async (req, res) => {
    try {
      const { domain } = req.params;
      const { notes } = req.body;
      const rejectedSource = await storage.rejectSource(domain, notes);
      
      if (!rejectedSource) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      res.json(rejectedSource);
    } catch (error) {
      console.error("Error rejecting source:", error);
      res.status(400).json({ error: "Failed to reject source" });
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
