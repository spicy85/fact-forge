import { db } from "./db";
import { sources } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function calculateSourceTrustScore(sourceUrl: string): Promise<number> {
  const domain = extractDomain(sourceUrl);
  
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.domain, domain))
    .limit(1);
  
  if (!source) {
    return 50;
  }
  
  const overallTrust = Math.round(
    (source.public_trust + source.data_accuracy + source.proprietary_score) / 3
  );
  
  return overallTrust;
}

export function calculateRecencyScore(evaluatedAt: string): number {
  const evaluatedDate = new Date(evaluatedAt);
  const now = new Date();
  const daysDiff = Math.floor((now.getTime() - evaluatedDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff <= 7) {
    return 100;
  }
  
  return 10;
}

export function calculateTrustScore(
  sourceTrustScore: number,
  recencyScore: number,
  consensusScore: number,
  sourceTrustWeight: number,
  recencyWeight: number,
  consensusWeight: number
): number {
  const totalWeight = sourceTrustWeight + recencyWeight + consensusWeight;
  
  if (totalWeight === 0) {
    return 0;
  }
  
  const weightedSum = 
    sourceTrustScore * sourceTrustWeight +
    recencyScore * recencyWeight +
    consensusScore * consensusWeight;
  
  return Math.round(weightedSum / totalWeight);
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return "";
  }
}
