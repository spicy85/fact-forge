import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertSourceSchema, updateSourceSchema, updateScoringSettingsSchema, insertSourceIdentityMetricsSchema, updateSourceIdentityMetricsSchema, insertTldScoreSchema, updateTldScoreSchema } from "@shared/schema";
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

  // Log requested facts for unsupported countries/attributes
  const requestedFactSchema = z.object({
    entity: z.string().min(1),
    attribute: z.string().min(1),
    claimValue: z.string().optional(),
    claimYear: z.number().int().optional(),
  });

  app.post("/api/requested-facts", async (req, res) => {
    try {
      const validatedData = requestedFactSchema.parse(req.body);
      
      const requestedFact = await storage.createOrIncrementRequestedFact(
        validatedData.entity,
        validatedData.attribute,
        validatedData.claimValue,
        validatedData.claimYear
      );
      
      // Fire-and-forget activity logging (non-blocking)
      storage.logFactsActivity({
        entity: validatedData.entity,
        attribute: validatedData.attribute,
        action: 'requested',
        source: null,
        process: 'user_request',
        value: validatedData.claimValue || null,
        notes: null
      }).catch((error) => {
        console.error("Error logging facts activity (non-critical):", error);
      });
      
      res.json({ success: true, fact: requestedFact });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error logging requested fact:", error);
      res.status(500).json({ error: "Failed to log requested fact" });
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

  // Fulfill requested facts
  app.post("/api/admin/fulfill-requested-facts", async (req, res) => {
    try {
      const { fulfillRequestedFacts } = await import("../scripts/fulfill-requested-facts");
      const stats = await fulfillRequestedFacts();
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error("Error fulfilling requested facts:", error);
      res.status(500).json({ error: "Failed to fulfill requested facts" });
    }
  });

  // Pull new facts from external APIs
  const pullNewFactsSchema = z.object({
    entities: z.array(z.string()).min(1),
    attributes: z.array(z.string()).min(1),
    years: z.array(z.number()).min(1)
  });

  app.post("/api/admin/pull-new-facts", async (req, res) => {
    try {
      const validatedData = pullNewFactsSchema.parse(req.body);
      const { pullNewFacts } = await import("../scripts/pull-new-facts");
      const stats = await pullNewFacts(
        validatedData.entities,
        validatedData.attributes,
        validatedData.years
      );
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error("Error pulling new facts:", error);
      res.status(500).json({ error: "Failed to pull new facts" });
    }
  });

  // Promote facts to verified
  app.post("/api/admin/promote-facts", async (req, res) => {
    try {
      const result = await storage.promoteFactsToVerified();
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error("Error promoting facts:", error);
      res.status(500).json({ error: "Failed to promote facts" });
    }
  });

  // Sync facts_count for all sources
  app.post("/api/admin/sync-facts-count", async (req, res) => {
    try {
      const result = await storage.syncFactsCount();
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error("Error syncing facts count:", error);
      res.status(500).json({ error: "Failed to sync facts count" });
    }
  });

  // Recalculate url_repute for all sources based on TLD scores
  app.post("/api/admin/recalculate-url-repute", async (req, res) => {
    try {
      const result = await storage.recalculateUrlRepute();
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error("Error recalculating url repute:", error);
      res.status(500).json({ error: "Failed to recalculate url repute" });
    }
  });

  // Recalculate certificates for all sources
  app.post("/api/admin/recalculate-certificates", async (req, res) => {
    try {
      const result = await storage.recalculateCertificates();
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error("Error recalculating certificates:", error);
      res.status(500).json({ error: "Failed to recalculate certificates" });
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

  // Get all source activity logs
  app.get("/api/sources/activity-log", async (req, res) => {
    try {
      const logs = await storage.getAllSourceActivityLogs();
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });

  // Source Identity Metrics API endpoints
  app.get("/api/source-identity-metrics", async (req, res) => {
    try {
      const metrics = await storage.getAllSourceIdentityMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching identity metrics:", error);
      res.status(500).json({ error: "Failed to fetch identity metrics" });
    }
  });

  app.get("/api/source-identity-metrics/:domain", async (req, res) => {
    try {
      const { domain } = req.params;
      const metric = await storage.getSourceIdentityMetric(domain);
      
      if (!metric) {
        return res.status(404).json({ error: "Identity metrics not found" });
      }
      
      res.json(metric);
    } catch (error) {
      console.error("Error fetching identity metric:", error);
      res.status(500).json({ error: "Failed to fetch identity metric" });
    }
  });

  app.post("/api/source-identity-metrics", async (req, res) => {
    try {
      const validatedData = insertSourceIdentityMetricsSchema.parse(req.body);
      const newMetric = await storage.insertSourceIdentityMetrics(validatedData);
      res.status(201).json(newMetric);
    } catch (error) {
      console.error("Error creating identity metrics:", error);
      res.status(400).json({ error: "Failed to create identity metrics" });
    }
  });

  app.patch("/api/source-identity-metrics/:domain", async (req, res) => {
    try {
      const { domain } = req.params;
      const validatedData = updateSourceIdentityMetricsSchema.parse(req.body);
      
      const updatedMetric = await storage.updateSourceIdentityMetrics(domain, validatedData);
      
      if (!updatedMetric) {
        return res.status(404).json({ error: "Identity metrics not found" });
      }
      
      res.json(updatedMetric);
    } catch (error) {
      console.error("Error updating identity metrics:", error);
      res.status(400).json({ error: "Failed to update identity metrics" });
    }
  });

  // Get all facts activity logs with pagination
  app.get("/api/facts-activity-log", async (req, res) => {
    try {
      const requestedLimit = parseInt(req.query.limit as string);
      const requestedOffset = parseInt(req.query.offset as string);
      
      // Sanitize inputs: clamp limit to [1, 1000] and offset to [0, Infinity]
      const limit = Math.max(1, Math.min(isNaN(requestedLimit) ? 100 : requestedLimit, 1000));
      const offset = Math.max(0, isNaN(requestedOffset) ? 0 : requestedOffset);
      
      const logs = await storage.getAllFactsActivityLogs(limit, offset);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching facts activity logs:", error);
      res.status(500).json({ error: "Failed to fetch facts activity logs" });
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

  // TLD Scores API endpoints
  app.get("/api/tld-scores", async (req, res) => {
    try {
      const scores = await storage.getAllTldScores();
      res.json(scores);
    } catch (error) {
      console.error("Error fetching TLD scores:", error);
      res.status(500).json({ error: "Failed to fetch TLD scores" });
    }
  });

  app.get("/api/tld-scores/:tld", async (req, res) => {
    try {
      const { tld } = req.params;
      const score = await storage.getTldScore(tld);
      
      if (!score) {
        return res.status(404).json({ error: "TLD score not found" });
      }
      
      res.json(score);
    } catch (error) {
      console.error("Error fetching TLD score:", error);
      res.status(500).json({ error: "Failed to fetch TLD score" });
    }
  });

  app.post("/api/tld-scores", async (req, res) => {
    try {
      const validatedData = insertTldScoreSchema.parse(req.body);
      const newScore = await storage.upsertTldScore(validatedData);
      res.status(201).json(newScore);
    } catch (error) {
      console.error("Error creating TLD score:", error);
      res.status(400).json({ error: "Failed to create TLD score" });
    }
  });

  app.put("/api/tld-scores/:tld", async (req, res) => {
    try {
      const { tld } = req.params;
      const validatedData = updateTldScoreSchema.parse(req.body);
      const updatedScore = await storage.upsertTldScore({ tld, ...validatedData });
      res.json(updatedScore);
    } catch (error) {
      console.error("Error updating TLD score:", error);
      res.status(400).json({ error: "Failed to update TLD score" });
    }
  });

  app.delete("/api/tld-scores/:tld", async (req, res) => {
    try {
      const { tld } = req.params;
      await storage.deleteTldScore(tld);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting TLD score:", error);
      res.status(400).json({ error: "Failed to delete TLD score" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
