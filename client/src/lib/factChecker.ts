import { VerificationStatus } from "@/components/VerificationBadge";
import { VerifiedClaim } from "@/components/RenderedParagraph";
import { VerificationResult } from "@/components/ResultsTable";

export interface FactRecord {
  entity: string;
  attribute: string;
  value: string;
  value_type: string;
  source_url: string;
  source_trust: string;
  last_verified_at: string;
}

export interface CredibleEvaluation {
  id: number;
  entity: string;
  attribute: string;
  value: string;
  source_url: string;
  source_trust: string;
  trust_score: number | null;
  evaluated_at: string;
}

export interface MultiSourceData {
  consensus: number;
  min: number;
  max: number;
  sourceCount: number;
  credibleEvaluations: CredibleEvaluation[];
}

/**
 * Parse human-friendly number formats into actual numbers
 * Supports: 12M, 1.5 billion, 50K, 12 million, etc.
 */
export function parseHumanNumber(input: string): number | null {
  if (!input) return null;
  
  // Remove commas and trim
  const cleaned = input.replace(/,/g, '').trim().toLowerCase();
  
  // Try to match number with optional multiplier
  // Matches: "12", "12.5", "12 million", "12M", "12m", "1.5billion", etc.
  const match = cleaned.match(/^([\d.]+)\s*(k|thousand|m|million|b|billion)?$/i);
  
  if (!match) return null;
  
  const baseNumber = parseFloat(match[1]);
  if (isNaN(baseNumber)) return null;
  
  const multiplier = match[2] ? match[2].toLowerCase() : '';
  
  const multipliers: { [key: string]: number } = {
    'k': 1000,
    'thousand': 1000,
    'm': 1000000,
    'million': 1000000,
    'b': 1000000000,
    'billion': 1000000000,
  };
  
  const mult = multipliers[multiplier] || 1;
  return baseNumber * mult;
}

/**
 * Format a number with commas for display
 */
export function formatNumber(value: string): string {
  const num = parseFloat(value.replace(/,/g, ''));
  if (isNaN(num)) return value;
  
  // Don't add commas to years (4-digit numbers that look like years)
  if (num >= 1000 && num <= 9999 && Number.isInteger(num)) {
    return value;
  }
  
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Calculate percentage difference between two numbers
 */
export function calculatePercentageDifference(claimed: number, actual: number): number {
  if (actual === 0) return claimed === 0 ? 0 : 100;
  return Math.abs((claimed - actual) / actual) * 100;
}

export interface AttributeMapping {
  [key: string]: string;
}

export interface EntityMapping {
  [key: string]: string;
}

export interface NumericClaim {
  value: string;
  startIndex: number;
  endIndex: number;
  contextBefore: string;
  contextAfter: string;
}

/**
 * Detect entity (country) mentioned in text
 * Returns the first detected entity or null if none found
 * Now supports alias detection via entity mapping
 */
export function detectEntity(
  text: string, 
  availableEntities: string[],
  entityMapping: EntityMapping = {}
): string | null {
  // Helper function to check if a string appears with proper word boundaries
  const hasProperBoundaries = (haystack: string, needle: string): boolean => {
    const lowerHaystack = haystack.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    
    let index = lowerHaystack.indexOf(lowerNeedle);
    while (index !== -1) {
      // Check character before (if exists)
      const charBefore = index > 0 ? haystack[index - 1] : ' ';
      // Check character after (if exists)  
      const charAfter = index + needle.length < haystack.length ? haystack[index + needle.length] : ' ';
      
      // Valid boundary if surrounded by non-alphanumeric chars (or start/end of string)
      const validBefore = !/[a-zA-Z0-9]/.test(charBefore);
      const validAfter = !/[a-zA-Z0-9]/.test(charAfter);
      
      if (validBefore && validAfter) {
        return true;
      }
      
      // Look for next occurrence
      index = lowerHaystack.indexOf(lowerNeedle, index + 1);
    }
    
    return false;
  };
  
  // First, try to match against aliases in the entity mapping
  // Sort aliases by length (descending) to match longer phrases first
  const sortedAliases = Object.entries(entityMapping).sort(
    ([a], [b]) => b.length - a.length
  );
  
  for (const [alias, canonicalName] of sortedAliases) {
    // Check if the canonical name exists in available entities
    if (!availableEntities.includes(canonicalName)) {
      continue;
    }
    
    if (hasProperBoundaries(text, alias)) {
      return canonicalName;
    }
  }
  
  // Fall back to direct entity name matching
  // Sort entities by length (descending) to match longer names first
  // e.g., "United States" before "United"
  const sortedEntities = [...availableEntities].sort((a, b) => b.length - a.length);
  
  for (const entity of sortedEntities) {
    if (hasProperBoundaries(text, entity)) {
      return entity;
    }
  }
  
  return null;
}

export function extractNumericClaims(text: string): NumericClaim[] {
  const claims: NumericClaim[] = [];
  
  // Updated regex to capture numbers with optional multipliers (K, M, B, thousand, million, billion)
  // Matches: "12", "12.5", "12,000", "12 million", "12M", "1.5B", etc.
  const numberRegex = /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:k|thousand|m|million|b|billion)?\b/gi;
  let match;

  while ((match = numberRegex.exec(text)) !== null) {
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    const contextStart = Math.max(0, startIndex - 20);
    const contextEnd = Math.min(text.length, endIndex + 20);

    claims.push({
      value: match[0].trim(),
      startIndex,
      endIndex,
      contextBefore: text.slice(contextStart, startIndex).toLowerCase(),
      contextAfter: text.slice(endIndex, contextEnd).toLowerCase(),
    });
  }

  return claims;
}

export function guessAttribute(
  claim: NumericClaim,
  attributeMapping: AttributeMapping
): string | null {
  const context = (claim.contextBefore + " " + claim.contextAfter).toLowerCase();

  // Sort keywords by length (descending) to match longer phrases first
  const sortedKeywords = Object.entries(attributeMapping).sort(
    ([a], [b]) => b.length - a.length
  );

  for (const [keyword, attribute] of sortedKeywords) {
    // Use word boundary matching for single words, substring for phrases
    if (keyword.includes(' ')) {
      // Multi-word phrase - use substring match
      if (context.includes(keyword)) {
        return attribute;
      }
    } else {
      // Single word - use word boundary regex
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(context)) {
        return attribute;
      }
    }
  }

  return null;
}

export function verifyClaim(
  claim: NumericClaim,
  attribute: string | null,
  entity: string,
  facts: FactRecord[]
): {
  status: VerificationStatus;
  fact?: FactRecord;
  percentageDiff?: number;
} {
  if (!attribute) {
    return { status: "unknown" };
  }

  const matchingFact = facts.find(
    (fact) =>
      fact.entity.toLowerCase() === entity.toLowerCase() &&
      fact.attribute === attribute
  );

  if (!matchingFact) {
    return { status: "unknown" };
  }

  const claimedValue = claim.value;
  const recordedValue = matchingFact.value;

  // Try exact string match first
  if (claimedValue === recordedValue) {
    return { status: "verified", fact: matchingFact };
  }

  // Try numeric comparison with tolerance
  const claimedNum = parseHumanNumber(claimedValue);
  const recordedNum = parseHumanNumber(recordedValue);

  if (claimedNum !== null && recordedNum !== null) {
    const percentDiff = calculatePercentageDifference(claimedNum, recordedNum);
    
    // Exact numeric match
    if (percentDiff === 0) {
      return { status: "verified", fact: matchingFact, percentageDiff: 0 };
    }
    
    // Within 10% tolerance
    if (percentDiff <= 10) {
      return { status: "close", fact: matchingFact, percentageDiff: percentDiff };
    }
    
    // More than 10% difference
    return { status: "mismatch", fact: matchingFact, percentageDiff: percentDiff };
  }

  // Fallback to string comparison
  return { status: "mismatch", fact: matchingFact };
}

export function verifyClaimMultiSource(
  claim: NumericClaim,
  attribute: string | null,
  entity: string,
  multiSourceData: Map<string, MultiSourceData>
): {
  status: VerificationStatus;
  multiSource?: MultiSourceData;
  percentageDiff?: number;
} {
  if (!attribute) {
    return { status: "unknown" };
  }

  const key = `${entity}|${attribute}`;
  const sourceData = multiSourceData.get(key);

  if (!sourceData) {
    return { status: "unknown" };
  }

  const claimedNum = parseHumanNumber(claim.value);
  
  if (claimedNum === null) {
    return { status: "unknown" };
  }

  // Detect the precision level of the claim to match rounding appropriately
  // If claim is a round million/billion, compare at that precision
  const getRoundingPrecision = (num: number): number => {
    if (num % 1000000000 === 0) return 1000000000; // Billion
    if (num % 1000000 === 0) return 1000000; // Million
    if (num % 1000 === 0) return 1000; // Thousand
    return 1; // No rounding
  };

  const precision = getRoundingPrecision(claimedNum);
  const roundedConsensus = Math.round(sourceData.consensus / precision) * precision;

  // Check if matches consensus at the appropriate precision level
  if (claimedNum === roundedConsensus) {
    return { status: "verified", multiSource: sourceData, percentageDiff: 0 };
  }

  // Check if within credible range [min, max]
  // Add small tolerance (2%) to account for rounding when users enter human-readable numbers like "36m"
  const tolerance = 0.02; // 2% tolerance
  const minWithTolerance = sourceData.min * (1 - tolerance);
  const maxWithTolerance = sourceData.max * (1 + tolerance);
  
  if (claimedNum >= minWithTolerance && claimedNum <= maxWithTolerance) {
    const percentDiff = calculatePercentageDifference(claimedNum, sourceData.consensus);
    return { status: "close", multiSource: sourceData, percentageDiff: percentDiff };
  }

  // Outside the range
  const percentDiff = calculatePercentageDifference(claimedNum, sourceData.consensus);
  return { status: "mismatch", multiSource: sourceData, percentageDiff: percentDiff };
}

export function processText(
  text: string,
  facts: FactRecord[],
  attributeMapping: AttributeMapping,
  availableEntities: string[],
  entityMapping: EntityMapping = {}
): {
  verifiedClaims: VerifiedClaim[];
  results: VerificationResult[];
  detectedEntity: string | null;
} {
  if (!text) {
    return { verifiedClaims: [], results: [], detectedEntity: null };
  }

  // Auto-detect entity from text using entity mapping for alias support
  const entity = detectEntity(text, availableEntities, entityMapping);
  
  if (!entity) {
    return { verifiedClaims: [], results: [], detectedEntity: null };
  }

  const claims = extractNumericClaims(text);
  const verifiedClaims: VerifiedClaim[] = [];
  const results: VerificationResult[] = [];

  claims.forEach((claim) => {
    const attribute = guessAttribute(claim, attributeMapping);
    const verification = verifyClaim(claim, attribute, entity, facts);

    // Format the recorded value for display
    const formattedRecordedValue = verification.fact?.value 
      ? formatNumber(verification.fact.value)
      : undefined;

    const tooltipContent =
      verification.status === "verified"
        ? `Verified: ${claim.value} (${attribute?.replace(/_/g, " ")})`
        : verification.status === "close"
        ? `Close: Claimed ${claim.value}, actual value is ${formattedRecordedValue} (within ${verification.percentageDiff?.toFixed(1)}%)`
        : verification.status === "mismatch"
        ? `Mismatch: Claimed ${claim.value}, but recorded value is ${formattedRecordedValue}`
        : `No data available for ${attribute?.replace(/_/g, " ") || "this claim"}`;

    verifiedClaims.push({
      value: claim.value,
      status: verification.status,
      attribute: attribute || "unknown",
      sourceUrl: verification.fact?.source_url,
      tooltipContent,
      startIndex: claim.startIndex,
      endIndex: claim.endIndex,
    });

    results.push({
      claimedValue: claim.value,
      attribute: attribute || "unknown",
      verdict: verification.status,
      recordedValue: formattedRecordedValue,
      lastVerifiedAt: verification.fact?.last_verified_at,
      citation: verification.fact?.source_url,
    });
  });

  return { verifiedClaims, results, detectedEntity: entity };
}

export function processTextMultiSource(
  text: string,
  multiSourceData: Map<string, MultiSourceData>,
  attributeMapping: AttributeMapping,
  availableEntities: string[],
  entityMapping: EntityMapping = {}
): {
  verifiedClaims: VerifiedClaim[];
  results: VerificationResult[];
  detectedEntity: string | null;
} {
  if (!text) {
    return { verifiedClaims: [], results: [], detectedEntity: null };
  }

  // Auto-detect entity from text using entity mapping for alias support
  const entity = detectEntity(text, availableEntities, entityMapping);
  
  if (!entity) {
    return { verifiedClaims: [], results: [], detectedEntity: null };
  }

  const claims = extractNumericClaims(text);
  const verifiedClaims: VerifiedClaim[] = [];
  const results: VerificationResult[] = [];

  claims.forEach((claim) => {
    const attribute = guessAttribute(claim, attributeMapping);
    const verification = verifyClaimMultiSource(claim, attribute, entity, multiSourceData);

    const consensusValue = verification.multiSource?.consensus;
    const minValue = verification.multiSource?.min;
    const maxValue = verification.multiSource?.max;
    const sourceCount = verification.multiSource?.sourceCount;

    // Format values for display
    const formattedConsensus = consensusValue !== undefined ? formatNumber(consensusValue.toString()) : undefined;
    const formattedMin = minValue !== undefined ? formatNumber(minValue.toString()) : undefined;
    const formattedMax = maxValue !== undefined ? formatNumber(maxValue.toString()) : undefined;

    const tooltipContent =
      verification.status === "verified"
        ? `Verified: ${claim.value} matches consensus of ${formattedConsensus} (${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'})`
        : verification.status === "close"
        ? `Close: ${claim.value} falls within credible range of ${formattedMin} - ${formattedMax} (consensus: ${formattedConsensus} from ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'})`
        : verification.status === "mismatch"
        ? `Mismatch: ${claim.value} is outside credible range of ${formattedMin} - ${formattedMax} (consensus: ${formattedConsensus})`
        : `No data available for ${attribute?.replace(/_/g, " ") || "this claim"}`;

    verifiedClaims.push({
      value: claim.value,
      status: verification.status,
      attribute: attribute || "unknown",
      sourceUrl: undefined,
      tooltipContent,
      startIndex: claim.startIndex,
      endIndex: claim.endIndex,
    });

    // Display range only if we have multiple sources, otherwise show single value
    let recordedValue: string | undefined;
    if (sourceCount !== undefined && sourceCount > 1 && formattedMin && formattedMax) {
      recordedValue = `${formattedMin} - ${formattedMax}`;
    } else if (formattedConsensus) {
      recordedValue = formattedConsensus;
    } else if (formattedMin) {
      recordedValue = formattedMin;
    }

    // Extract individual sources from credibleEvaluations
    const sources = verification.multiSource?.credibleEvaluations.map((evaluation) => {
      // Extract domain from source_url
      let domain = evaluation.source_trust;
      try {
        const url = new URL(evaluation.source_url);
        domain = url.hostname.replace(/^www\./, '');
      } catch {
        // If URL parsing fails, use source_trust as domain
        domain = evaluation.source_trust;
      }

      return {
        domain,
        trustScore: evaluation.trust_score ?? 0,
        url: evaluation.source_url,
        evaluatedAt: evaluation.evaluated_at
      };
    });

    results.push({
      claimedValue: claim.value,
      attribute: attribute || "unknown",
      verdict: verification.status,
      recordedValue,
      lastVerifiedAt: sources && sources.length > 0 ? sources[0].evaluatedAt : undefined,
      citation: undefined,
      sourceTrust: sourceCount !== undefined ? `${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}` : undefined,
      sources,
    });
  });

  return { verifiedClaims, results, detectedEntity: entity };
}