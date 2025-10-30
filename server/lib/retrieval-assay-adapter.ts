/**
 * Retrieval Assay Adapter
 * 
 * Wraps keyword-based database verification as a fallback assay,
 * ensuring all verifications go through the unified assay system
 * with complete provenance tracking.
 * 
 * This adapter:
 * 1. Takes the same inputs as other assays (entity, attribute, value, year)
 * 2. Queries the facts_evaluation table using existing keyword logic
 * 3. Formats results as assay provenance (raw_responses, parsed_values, consensus)
 * 4. Returns verification result compatible with assay executor
 */

import { db } from "../db";
import { factsEvaluation } from "@shared/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import toleranceConfig from "../../public/tolerance-config.json";

export interface RetrievalAssayInputs {
  entity: string;
  attribute: string;
  value: string;
  year?: number;
}

export interface RetrievalAssayResult {
  verified: boolean;
  consensus: number;
  raw_responses: Record<string, any>;
  parsed_values: Record<string, number>;
  consensus_result: {
    agreement: number;
    sources_agreeing: number;
    total_sources: number;
    claimed_value: number;
    actual_values: number[];
  };
  assay_id: string;
}

/**
 * Get tolerance for a specific attribute
 */
function getToleranceForAttribute(attribute: string): number {
  return (toleranceConfig as any)[attribute] ?? toleranceConfig.default;
}

/**
 * Parse numeric value from string (supports k/m/b/t notation)
 */
function parseNumericValue(valueStr: string): number {
  const cleaned = valueStr.replace(/,/g, '').trim();
  const match = cleaned.match(/^([\d.]+)\s*([kmbt])?$/i);
  
  if (!match) {
    return parseFloat(cleaned);
  }
  
  const num = parseFloat(match[1]);
  const suffix = match[2]?.toLowerCase();
  
  const multipliers: Record<string, number> = {
    'k': 1_000,
    'm': 1_000_000,
    'b': 1_000_000_000,
    't': 1_000_000_000_000,
  };
  
  return suffix ? num * multipliers[suffix] : num;
}

/**
 * Check if a value is within tolerance of claimed value
 */
function isWithinTolerance(actual: number, claimed: number, tolerance: number): boolean {
  const diff = Math.abs(actual - claimed);
  const threshold = claimed * tolerance;
  return diff <= threshold;
}

/**
 * Execute retrieval-based verification as a fallback assay
 */
export async function executeRetrievalAssay(
  inputs: RetrievalAssayInputs
): Promise<RetrievalAssayResult> {
  const { entity, attribute, value, year } = inputs;
  const claimedValue = parseNumericValue(value);
  const tolerance = getToleranceForAttribute(attribute);

  // Query facts_evaluation table (mimic keyword-based logic)
  const conditions = [
    eq(factsEvaluation.entity, entity),
    eq(factsEvaluation.attribute, attribute),
  ];

  // If year provided, filter time-series data to ±1 year
  if (year && attribute !== 'founded_year' && attribute !== 'independence_year') {
    conditions.push(
      sql`EXTRACT(YEAR FROM ${factsEvaluation.as_of_date}::timestamp)::int BETWEEN ${year - 1} AND ${year + 1}`
    );
  }

  const evaluations = await db
    .select()
    .from(factsEvaluation)
    .where(and(...conditions))
    .orderBy(sql`${factsEvaluation.trust_score} DESC`);

  // Format as assay raw responses (use actual SQL query structure for audit trail)
  const yearFilter = year && attribute !== 'founded_year' && attribute !== 'independence_year'
    ? ` AND EXTRACT(YEAR FROM as_of_date::timestamp)::int BETWEEN ${year - 1} AND ${year + 1}`
    : '';
  
  const raw_responses: Record<string, any> = {
    database_query: {
      query: `SELECT * FROM facts_evaluation WHERE entity = '${entity}' AND attribute = '${attribute}'${yearFilter} ORDER BY trust_score DESC`,
      result_count: evaluations.length,
      results: evaluations.map(e => ({
        id: e.id,
        value: e.value,
        source_name: e.source_name,
        trust_score: e.trust_score,
        evaluated_at: e.evaluated_at,
        as_of_date: e.as_of_date,
      }))
    }
  };

  // Parse values from each source
  const parsed_values: Record<string, number> = {};
  const actual_values: number[] = [];
  
  for (const evaluation of evaluations) {
    const parsedValue = parseNumericValue(evaluation.value);
    parsed_values[evaluation.source_name] = parsedValue;
    actual_values.push(parsedValue);
  }

  // Calculate consensus (trust-weighted agreement)
  let totalTrust = 0;
  let agreementTrust = 0;
  let sourcesAgreeing = 0;

  for (const evaluation of evaluations) {
    const parsedValue = parseNumericValue(evaluation.value);
    const trustScore = evaluation.trust_score ?? 50;
    
    totalTrust += trustScore;
    
    if (isWithinTolerance(parsedValue, claimedValue, tolerance)) {
      agreementTrust += trustScore;
      sourcesAgreeing++;
    }
  }

  const consensus = totalTrust > 0 ? agreementTrust / totalTrust : 0;
  const verified = consensus >= 0.7; // 70% trust-weighted consensus threshold

  const consensus_result = {
    agreement: consensus,
    sources_agreeing: sourcesAgreeing,
    total_sources: evaluations.length,
    claimed_value: claimedValue,
    actual_values,
  };

  return {
    verified,
    consensus,
    raw_responses,
    parsed_values,
    consensus_result,
    assay_id: "retrieval-fallback-v1",
  };
}
