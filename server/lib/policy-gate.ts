import fs from 'fs';
import path from 'path';
import type { FactsEvaluation } from '@shared/schema';

// Type definitions for policy configuration
export type RiskTier = 'low' | 'medium' | 'high';

export interface TierCriteria {
  min_sources: number;
  min_score: number;
  max_age_days: number;
  require_assay: boolean;
  min_consensus_agreement: number;
}

export interface RiskTierConfig {
  description: string;
  criteria: TierCriteria;
  attributes: string[];
}

export interface PromotionPolicy {
  risk_tiers: {
    low: RiskTierConfig;
    medium: RiskTierConfig;
    high: RiskTierConfig;
  };
  default_tier: RiskTier;
  compensating_controls: {
    require_audit_log: boolean;
    enable_rollback: boolean;
    notify_on_demotion: boolean;
  };
}

export interface CriteriaMet {
  min_sources: boolean;
  min_score: boolean;
  max_age_days: boolean;
  require_assay: boolean;
  min_consensus_agreement: boolean;
}

export interface GateDecision {
  pass: boolean;
  tier: RiskTier;
  reason: string;
  criteria_met: CriteriaMet;
  source_count: number;
  evaluation_score: number;
  age_days: number;
  has_assay: boolean;
  consensus_agreement: number | null;
}

// Cache for policy configuration
let cachedPolicy: PromotionPolicy | null = null;

/**
 * Load promotion policy configuration from file
 */
export function loadPromotionPolicy(): PromotionPolicy {
  if (cachedPolicy) {
    return cachedPolicy;
  }

  const policyPath = path.join(process.cwd(), 'public', 'promotion-policy.json');
  const policyJson = fs.readFileSync(policyPath, 'utf-8');
  cachedPolicy = JSON.parse(policyJson);
  return cachedPolicy as PromotionPolicy;
}

/**
 * Reload policy configuration (useful for hot-reloading config changes)
 */
export function reloadPromotionPolicy(): PromotionPolicy {
  cachedPolicy = null;
  return loadPromotionPolicy();
}

/**
 * Classify a fact evaluation into a risk tier based on its attribute
 */
export function classifyRiskTier(attribute: string): RiskTier {
  const policy = loadPromotionPolicy();
  
  // Check each tier to find which one contains this attribute
  for (const [tierName, tierConfig] of Object.entries(policy.risk_tiers)) {
    if (tierConfig.attributes.includes(attribute)) {
      return tierName as RiskTier;
    }
  }
  
  // Fall back to default tier if attribute not found in any tier
  return policy.default_tier;
}

/**
 * Calculate age in days between two dates
 */
function calculateAgeDays(evaluatedAt: string): number {
  const evaluatedDate = new Date(evaluatedAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - evaluatedDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Evaluate whether a fact evaluation passes the promotion gate
 * 
 * @param evaluation - The fact evaluation to assess
 * @param sourceCount - Number of independent sources for this fact
 * @param hasAssay - Whether an assay verification exists for this fact
 * @param consensusAgreement - Agreement percentage across sources (0-1)
 * @returns Gate decision with pass/fail status and detailed reasoning
 */
export function evaluatePromotionGate(
  evaluation: FactsEvaluation,
  sourceCount: number,
  hasAssay: boolean = false,
  consensusAgreement: number | null = null
): GateDecision {
  const policy = loadPromotionPolicy();
  const tier = classifyRiskTier(evaluation.attribute);
  const criteria = policy.risk_tiers[tier].criteria;
  
  // Calculate metrics
  const ageDays = calculateAgeDays(evaluation.evaluated_at);
  const score = evaluation.trust_score ?? 0;
  
  // Evaluate each criterion
  const criteriaMet: CriteriaMet = {
    min_sources: sourceCount >= criteria.min_sources,
    min_score: score >= criteria.min_score,
    max_age_days: ageDays <= criteria.max_age_days,
    require_assay: !criteria.require_assay || hasAssay,
    min_consensus_agreement: consensusAgreement === null || consensusAgreement >= criteria.min_consensus_agreement,
  };
  
  // Determine pass/fail
  const allCriteriaMet = Object.values(criteriaMet).every(met => met);
  const pass = allCriteriaMet;
  
  // Build detailed reason
  const failedCriteria: string[] = [];
  if (!criteriaMet.min_sources) {
    failedCriteria.push(`insufficient sources (${sourceCount}/${criteria.min_sources})`);
  }
  if (!criteriaMet.min_score) {
    failedCriteria.push(`low trust score (${score}/${criteria.min_score})`);
  }
  if (!criteriaMet.max_age_days) {
    failedCriteria.push(`data too old (${ageDays}/${criteria.max_age_days} days)`);
  }
  if (!criteriaMet.require_assay) {
    failedCriteria.push(`assay verification required but missing`);
  }
  if (!criteriaMet.min_consensus_agreement && consensusAgreement !== null) {
    const agreementPct = (consensusAgreement * 100).toFixed(1);
    const requiredPct = (criteria.min_consensus_agreement * 100).toFixed(1);
    failedCriteria.push(`low consensus (${agreementPct}%/${requiredPct}%)`);
  }
  
  const reason = pass 
    ? `Passed ${tier} tier criteria: ${sourceCount} sources, score ${score}, ${ageDays} days old`
    : `Failed ${tier} tier criteria: ${failedCriteria.join(', ')}`;
  
  return {
    pass,
    tier,
    reason,
    criteria_met: criteriaMet,
    source_count: sourceCount,
    evaluation_score: score,
    age_days: ageDays,
    has_assay: hasAssay,
    consensus_agreement: consensusAgreement,
  };
}

/**
 * Get policy configuration for a specific tier
 */
export function getTierCriteria(tier: RiskTier): TierCriteria {
  const policy = loadPromotionPolicy();
  return policy.risk_tiers[tier].criteria;
}

/**
 * Get all risk tiers and their attributes
 */
export function getRiskTiers(): Record<RiskTier, string[]> {
  const policy = loadPromotionPolicy();
  return {
    low: policy.risk_tiers.low.attributes,
    medium: policy.risk_tiers.medium.attributes,
    high: policy.risk_tiers.high.attributes,
  };
}
