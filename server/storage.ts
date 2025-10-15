import { type User, type InsertUser, type Fact, type InsertFact } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { facts } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllFacts(): Promise<Fact[]>;
  insertFact(fact: InsertFact): Promise<Fact>;
  clearAllFacts(): Promise<void>;
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
}

export const storage = new MemStorage();
