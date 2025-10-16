import { type User, type InsertUser, type Fact, type InsertFact, type VerifiedFact, type InsertVerifiedFact, type FactsEvaluation, type InsertFactsEvaluation, type Source, type InsertSource, type UpdateSource } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { facts, verifiedFacts, factsEvaluation, sources } from "@shared/schema";
import { eq } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllFacts(): Promise<Fact[]>;
  insertFact(fact: InsertFact): Promise<Fact>;
  clearAllFacts(): Promise<void>;
  getAllVerifiedFacts(): Promise<VerifiedFact[]>;
  insertVerifiedFact(fact: InsertVerifiedFact): Promise<VerifiedFact>;
  getAllFactsEvaluation(): Promise<FactsEvaluation[]>;
  insertFactsEvaluation(evaluation: InsertFactsEvaluation): Promise<FactsEvaluation>;
  getAllSources(): Promise<Source[]>;
  insertSource(source: InsertSource): Promise<Source>;
  updateSource(domain: string, updates: UpdateSource): Promise<Source | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAllFacts(): Promise<Fact[]> {
    return db.select().from(facts);
  }

  async insertFact(fact: InsertFact): Promise<Fact> {
    const [insertedFact] = await db.insert(facts).values(fact).returning();
    return insertedFact;
  }

  async clearAllFacts(): Promise<void> {
    await db.delete(facts);
  }

  async getAllVerifiedFacts(): Promise<VerifiedFact[]> {
    return db.select().from(verifiedFacts);
  }

  async insertVerifiedFact(fact: InsertVerifiedFact): Promise<VerifiedFact> {
    const [insertedFact] = await db.insert(verifiedFacts).values(fact).returning();
    return insertedFact;
  }

  async getAllFactsEvaluation(): Promise<FactsEvaluation[]> {
    return db.select().from(factsEvaluation);
  }

  async insertFactsEvaluation(evaluation: InsertFactsEvaluation): Promise<FactsEvaluation> {
    const [insertedEvaluation] = await db.insert(factsEvaluation).values(evaluation).returning();
    return insertedEvaluation;
  }

  async getAllSources(): Promise<Source[]> {
    return db.select().from(sources);
  }

  async insertSource(source: InsertSource): Promise<Source> {
    const [insertedSource] = await db.insert(sources).values(source).returning();
    return insertedSource;
  }

  async updateSource(domain: string, updates: UpdateSource): Promise<Source | undefined> {
    const [updatedSource] = await db
      .update(sources)
      .set(updates)
      .where(eq(sources.domain, domain))
      .returning();
    return updatedSource;
  }
}

export const storage = new MemStorage();
