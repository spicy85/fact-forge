import type { Express } from "express";
import { db } from "./storage";
import { z } from "zod";
import {
  insertUserSchema,
  insertVerifiedFactSchema,
  insertFactsEvaluationSchema,
  insertSourceSchema,
  updateSourceSchema,
  insertSourceActivityLogSchema,
  insertFactsActivityLogSchema,
  insertRequestedFactSchema,
  insertSourceIdentityMetricSchema,
  insertTldScoreSchema,
  updateTldScoreSchema,
} from "../shared/schema";

export function registerRoutes(app: Express) {
  const storage = db();

  // Facts API endpoint
  app.get("/api/facts", async (req, res) => {
    try {
      const facts = await storage.getAllVerifiedFacts();
      res.json(facts);
    } catch (error) {
      console.error("Error fetching facts:", error);
      res.status(500).json({ error: "Failed to fetch facts" });
    }
  });

  // Multi-source verification API endpoint
  app.get("/api/facts/verify", async (req, res) => {
    try {
      const { entity, attribute, claimedValue, year } = req.query;
      
      if (!entity || !attribute || !claimedValue) {
        return res.status(400).json({ 
          error: "Missing required parameters: entity, attribute, claimedValue" 
        });
      }

      const result = await storage.getMultiSourceEvaluations(
        entity as string,
        attribute as string,
        parseFloat(claimedValue as string),
        year ? parseInt(year as string) : undefined
      );
      
      res.json(result);
    } catch (error) {
      console.error("Error verifying fact:", error);
      res.status(500).json({ error: "Failed to verify fact" });
    }
  });

  // Insert verified fact
  app.post("/api/facts", async (req, res) => {
    try {
      const fact = insertVerifiedFactSchema.parse(req.body);
      const result = await storage.insertVerifiedFact(fact);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error inserting fact:", error);
      res.status(500).json({ error: "Failed to insert fact" });
    }
  });

  // Facts evaluation endpoints
  app.get("/api/facts-evaluation", async (req, res) => {
    try {
      const evaluations = await storage.getAllFactsEvaluations();
      res.json(evaluations);
    } catch (error) {
      console.error("Error fetching facts evaluations:", error);
      res.status(500).json({ error: "Failed to fetch facts evaluations" });
    }
  });

  app.post("/api/facts-evaluation", async (req, res) => {
    try {
      const evaluation = insertFactsEvaluationSchema.parse(req.body);
      const result = await storage.insertFactsEvaluation(evaluation);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error inserting facts evaluation:", error);
      res.status(500).json({ error: "Failed to insert facts evaluation" });
    }
  });

  // Bulk insert facts evaluations
  app.post("/api/facts-evaluation/bulk", async (req, res) => {
    try {
      const evaluations = z.array(insertFactsEvaluationSchema).parse(req.body);
      const result = await storage.bulkInsertFactsEvaluations(evaluations);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error bulk inserting facts evaluations:", error);
      res.status(500).json({ error: "Failed to bulk insert facts evaluations" });
    }
  });

  // Claims Matrix API endpoint
  app.get("/api/claims-matrix", async (req, res) => {
    try {
      const matrix = await storage.getClaimsMatrix();
      res.json(matrix);
    } catch (error) {
      console.error("Error fetching claims matrix:", error);
      res.status(500).json({ error: "Failed to fetch claims matrix" });
    }
  });

  // Scoring settings endpoints
  app.get("/api/scoring-settings", async (req, res) => {
    try {
      const settings = await storage.getScoringSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching scoring settings:", error);
      res.status(500).json({ error: "Failed to fetch scoring settings" });
    }
  });

  app.patch("/api/scoring-settings", async (req, res) => {
    try {
      const updates = req.body;
      const result = await storage.updateScoringSettings(updates);
      res.json(result);
    } catch (error) {
      console.error("Error updating scoring settings:", error);
      res.status(500).json({ error: "Failed to update scoring settings" });
    }
  });

  // Fact promotion endpoint
  app.post("/api/admin/promote-facts", async (req, res) => {
    try {
      const result = await storage.promoteFactsToVerified();
      res.json(result);
    } catch (error) {
      console.error("Error promoting facts:", error);
      res.status(500).json({ error: "Failed to promote facts" });
    }
  });

  // Cross-check sources endpoint
  app.post("/api/admin/cross-check-sources", async (req, res) => {
    try {
      const result = await storage.crossCheckSources();
      res.json(result);
    } catch (error) {
      console.error("Error cross-checking sources:", error);
      res.status(500).json({ error: "Failed to cross-check sources" });
    }
  });

  // Fulfill requested facts endpoint
  app.post("/api/admin/fulfill-requested-facts", async (req, res) => {
    try {
      const result = await storage.fulfillRequestedFacts();
      res.json(result);
    } catch (error) {
      console.error("Error fulfilling requested facts:", error);
      res.status(500).json({ error: "Failed to fulfill requested facts" });
    }
  });

  // Pull new facts endpoint (admin tool for on-demand data fetching)
  app.post("/api/admin/pull-new-facts", async (req, res) => {
    try {
      const { entities, attributes, startYear, endYear } = req.body;
      
      if (!entities || !Array.isArray(entities) || entities.length === 0) {
        return res.status(400).json({ error: "entities array is required" });
      }
      
      if (!attributes || !Array.isArray(attributes) || attributes.length === 0) {
        return res.status(400).json({ error: "attributes array is required" });
      }
      
      const result = await storage.pullNewFacts(entities, attributes, startYear, endYear);
      res.json(result);
    } catch (error) {
      console.error("Error pulling new facts:", error);
      res.status(500).json({ error: "Failed to pull new facts" });
    }
  });

  // Recalculate URL reputation scores
  app.post("/api/admin/recalculate-url-repute", async (req, res) => {
    try {
      const result = await storage.recalculateUrlRepute();
      res.json(result);
    } catch (error) {
      console.error("Error recalculating URL reputation:", error);
      res.status(500).json({ error: "Failed to recalculate URL reputation" });
    }
  });

  // Recalculate certificate scores
  app.post("/api/admin/recalculate-certificates", async (req, res) => {
    try {
      const result = await storage.recalculateCertificates();
      res.json(result);
    } catch (error) {
      console.error("Error recalculating certificates:", error);
      res.status(500).json({ error: "Failed to recalculate certificates" });
    }
  });

  // Recalculate ownership scores
  app.post("/api/admin/recalculate-ownership", async (req, res) => {
    try {
      const result = await storage.recalculateOwnership();
      res.json(result);
    } catch (error) {
      console.error("Error recalculating ownership:", error);
      res.status(500).json({ error: "Failed to recalculate ownership" });
    }
  });

  // Sync facts count
  app.post("/api/admin/sync-facts-count", async (req, res) => {
    try {
      const result = await storage.syncFactsCount();
      res.json(result);
    } catch (error) {
      console.error("Error syncing facts count:", error);
      res.status(500).json({ error: "Failed to sync facts count" });
    }
  });

  // Sync identity scores between tables
  app.post("/api/admin/sync-identity-scores", async (req, res) => {
    try {
      const result = await storage.syncIdentityScores();
      res.json(result);
    } catch (error) {
      console.error("Error syncing identity scores:", error);
      res.status(500).json({ error: "Failed to sync identity scores" });
    }
  });

  // Add and score a new trusted source (unified workflow)
  const addTrustedSourceSchema = z.object({
    domain: z.string().min(1, "Domain is required"),
    legitimacy: z.number().int().min(0).max(100).optional().default(70),
    trust: z.number().int().min(0).max(100).optional().default(70),
  });

  app.post("/api/admin/add-trusted-source", async (req, res) => {
    try {
      const validatedData = addTrustedSourceSchema.parse(req.body);
      
      const result = await storage.addAndScoreTrustedSource(
        validatedData.domain,
        validatedData.legitimacy,
        validatedData.trust
      );
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error adding and scoring trusted source:", error);
      res.status(500).json({ error: "Failed to add and score trusted source" });
    }
  });

  // Sources API endpoint
  app.get("/api/sources", async (req, res) => {
    try {
      const sources = await storage.getAllSources();
      res.json(sources);
    } catch (error) {
      console.error("Error fetching sources:", error);
      res.status(500).json({ error: "Failed to fetch sources" });
    }
  });

  // Source management endpoints
  app.post("/api/sources", async (req, res) => {
    try {
      const source = insertSourceSchema.parse(req.body);
      const result = await storage.insertSource(source);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error inserting source:", error);
      res.status(500).json({ error: "Failed to insert source" });
    }
  });

  app.patch("/api/sources/:domain", async (req, res) => {
    try {
      const { domain } = req.params;
      const updates = updateSourceSchema.parse(req.body);
      const result = await storage.updateSource(domain, updates);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating source:", error);
      res.status(500).json({ error: "Failed to update source" });
    }
  });

  app.post("/api/sources/:domain/promote", async (req, res) => {
    try {
      const { domain } = req.params;
      const result = await storage.promoteSource(domain);
      if (!result) {
        return res.status(404).json({ error: "Source not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Error promoting source:", error);
      res.status(500).json({ error: "Failed to promote source" });
    }
  });

  app.post("/api/sources/:domain/reject", async (req, res) => {
    try {
      const { domain } = req.params;
      const { reason } = req.body;
      const result = await storage.rejectSource(domain, reason);
      if (!result) {
        return res.status(404).json({ error: "Source not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Error rejecting source:", error);
      res.status(500).json({ error: "Failed to reject source" });
    }
  });

  // Source activity log endpoints
  app.get("/api/source-activity-log", async (req, res) => {
    try {
      const { domain } = req.query;
      const logs = await storage.getSourceActivityLog(domain as string | undefined);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching source activity log:", error);
      res.status(500).json({ error: "Failed to fetch source activity log" });
    }
  });

  app.post("/api/source-activity-log", async (req, res) => {
    try {
      const log = insertSourceActivityLogSchema.parse(req.body);
      const result = await storage.insertSourceActivityLog(log);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error inserting source activity log:", error);
      res.status(500).json({ error: "Failed to insert source activity log" });
    }
  });

  // Facts activity log endpoints
  app.get("/api/facts-activity-log", async (req, res) => {
    try {
      const { entity, attribute } = req.query;
      const logs = await storage.getFactsActivityLog(
        entity as string | undefined,
        attribute as string | undefined
      );
      res.json(logs);
    } catch (error) {
      console.error("Error fetching facts activity log:", error);
      res.status(500).json({ error: "Failed to fetch facts activity log" });
    }
  });

  app.post("/api/facts-activity-log", async (req, res) => {
    try {
      const log = insertFactsActivityLogSchema.parse(req.body);
      const result = await storage.insertFactsActivityLog(log);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error inserting facts activity log:", error);
      res.status(500).json({ error: "Failed to insert facts activity log" });
    }
  });

  // Requested facts endpoints
  app.get("/api/requested-facts", async (req, res) => {
    try {
      const facts = await storage.getRequestedFacts();
      res.json(facts);
    } catch (error) {
      console.error("Error fetching requested facts:", error);
      res.status(500).json({ error: "Failed to fetch requested facts" });
    }
  });

  app.post("/api/requested-facts", async (req, res) => {
    try {
      const fact = insertRequestedFactSchema.parse(req.body);
      const result = await storage.insertRequestedFact(fact);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error inserting requested fact:", error);
      res.status(500).json({ error: "Failed to insert requested fact" });
    }
  });

  // Source identity metrics endpoints
  app.get("/api/source-identity-metrics", async (req, res) => {
    try {
      const metrics = await storage.getAllSourceIdentityMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching source identity metrics:", error);
      res.status(500).json({ error: "Failed to fetch source identity metrics" });
    }
  });

  app.get("/api/source-identity-metrics/:domain", async (req, res) => {
    try {
      const { domain } = req.params;
      const metric = await storage.getSourceIdentityMetric(domain);
      if (!metric) {
        return res.status(404).json({ error: "Source identity metric not found" });
      }
      res.json(metric);
    } catch (error) {
      console.error("Error fetching source identity metric:", error);
      res.status(500).json({ error: "Failed to fetch source identity metric" });
    }
  });

  app.post("/api/source-identity-metrics", async (req, res) => {
    try {
      const metric = insertSourceIdentityMetricSchema.parse(req.body);
      const result = await storage.insertSourceIdentityMetric(metric);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error inserting source identity metric:", error);
      res.status(500).json({ error: "Failed to insert source identity metric" });
    }
  });

  app.patch("/api/source-identity-metrics/:domain", async (req, res) => {
    try {
      const { domain } = req.params;
      const updates = req.body;
      const result = await storage.updateSourceIdentityMetrics(domain, updates);
      if (!result) {
        return res.status(404).json({ error: "Source identity metric not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Error updating source identity metric:", error);
      res.status(500).json({ error: "Failed to update source identity metric" });
    }
  });

  // TLD scores endpoints
  app.get("/api/tld-scores", async (req, res) => {
    try {
      const scores = await storage.getAllTldScores();
      res.json(scores);
    } catch (error) {
      console.error("Error fetching TLD scores:", error);
      res.status(500).json({ error: "Failed to fetch TLD scores" });
    }
  });

  app.post("/api/tld-scores", async (req, res) => {
    try {
      const score = insertTldScoreSchema.parse(req.body);
      const result = await storage.insertTldScore(score);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error inserting TLD score:", error);
      res.status(500).json({ error: "Failed to insert TLD score" });
    }
  });

  app.patch("/api/tld-scores/:tld", async (req, res) => {
    try {
      const { tld } = req.params;
      const updates = updateTldScoreSchema.parse(req.body);
      const result = await storage.updateTldScore(tld, updates);
      if (!result) {
        return res.status(404).json({ error: "TLD score not found" });
      }
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating TLD score:", error);
      res.status(500).json({ error: "Failed to update TLD score" });
    }
  });

  app.delete("/api/tld-scores/:tld", async (req, res) => {
    try {
      const { tld } = req.params;
      const result = await storage.deleteTldScore(tld);
      if (!result) {
        return res.status(404).json({ error: "TLD score not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting TLD score:", error);
      res.status(500).json({ error: "Failed to delete TLD score" });
    }
  });

  // Data coverage endpoint
  app.get("/api/data-coverage", async (req, res) => {
    try {
      const coverage = await storage.getDataCoverage();
      res.json(coverage);
    } catch (error) {
      console.error("Error fetching data coverage:", error);
      res.status(500).json({ error: "Failed to fetch data coverage" });
    }
  });
}
