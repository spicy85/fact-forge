import { VerificationStatus } from "@/components/VerificationBadge";
import { VerifiedClaim } from "@/components/RenderedParagraph";
import { VerificationResult } from "@/components/ResultsTable";
import toleranceConfig from "../../../public/tolerance-config.json";

/**
 * Get percentage tolerance for a specific attribute
 * Returns attribute-specific tolerance or default if not found
 */
export function getToleranceForAttribute(attribute: string | null): number {
  if (!attribute) return toleranceConfig.default;
  return (toleranceConfig as any)[attribute] ?? toleranceConfig.default;
}

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
  as_of_date: string | null;
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
 * Supports: 12M, 1.5 billion, 50K, 12 million, 3T, 2.5 trillion, etc.
 */
export function parseHumanNumber(input: string): number | null {
  if (!input) return null;
  
  // Remove commas and trim
  const cleaned = input.replace(/,/g, '').trim().toLowerCase();
  
  // Try to match number with optional multiplier
  // Matches: "12", "12.5", "12 million", "12M", "12m", "3t", "3 trillion", "1.5billion", etc.
  const match = cleaned.match(/^([\d.]+)\s*(k|thousand|m|million|b|billion|t|trillion)?$/i);
  
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
    't': 1000000000000,
    'trillion': 1000000000000,
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
  year?: number; // Optional year extracted from temporal context
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

/**
 * Determines if a numeric claim is likely a year in temporal context
 * Years should not be verified as standalone claims
 */
export function isTemporalYear(claim: NumericClaim): boolean {
  const num = parseFloat(claim.value.replace(/,/g, ''));
  
  // Must be a 4-digit integer in year range
  if (!Number.isInteger(num) || num < 1900 || num > 2100) {
    return false;
  }
  
  // Check for temporal keywords in context
  const context = (claim.contextBefore + " " + claim.contextAfter).toLowerCase();
  const temporalKeywords = [
    'in ', ' in', 'during', 'since', 'by ', 'from', 'until', 'as of',
    'year', 'founded', 'established', 'independence'
  ];
  
  return temporalKeywords.some(keyword => context.includes(keyword));
}

/**
 * Extract year from temporal context near a claim
 * Returns the year if found, otherwise undefined
 */
export function extractYearFromContext(claim: NumericClaim, text: string): number | undefined {
  // Look in wider context (±50 chars) for year numbers
  const contextStart = Math.max(0, claim.startIndex - 50);
  const contextEnd = Math.min(text.length, claim.endIndex + 50);
  const wideContext = text.slice(contextStart, contextEnd);
  
  // Find 4-digit years in the wider context
  const yearRegex = /\b(19\d{2}|20\d{2})\b/g;
  let match;
  const years: number[] = [];
  
  while ((match = yearRegex.exec(wideContext)) !== null) {
    years.push(parseInt(match[1]));
  }
  
  // Return the year if exactly one is found in context
  if (years.length === 1) {
    return years[0];
  }
  
  // If multiple years, find the closest one to the claim
  if (years.length > 1) {
    // Prefer years that appear after temporal keywords
    const contextLower = wideContext.toLowerCase();
    const temporalKeywords = ['in', 'during', 'since', 'by', 'from', 'until', 'as of'];
    
    for (const keyword of temporalKeywords) {
      const keywordMatch = contextLower.match(new RegExp(`\\b${keyword}\\s+(\\d{4})\\b`));
      if (keywordMatch) {
        const year = parseInt(keywordMatch[1]);
        if (year >= 1900 && year <= 2100) {
          return year;
        }
      }
    }
    
    // Fallback: return first year found
    return years[0];
  }
  
  return undefined;
}

export function extractNumericClaims(text: string): NumericClaim[] {
  const claims: NumericClaim[] = [];
  
  // Updated regex to capture numbers with optional multipliers (K, M, B, T, thousand, million, billion, trillion)
  // Matches: "12", "12.5", "12,000", "12 million", "12M", "1.5B", "3t", "2.5 trillion", etc.
  const numberRegex = /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:k|thousand|m|million|b|billion|t|trillion)?\b/gi;
  let match;

  while ((match = numberRegex.exec(text)) !== null) {
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    const contextStart = Math.max(0, startIndex - 20);
    const contextEnd = Math.min(text.length, endIndex + 20);

    const claim: NumericClaim = {
      value: match[0].trim(),
      startIndex,
      endIndex,
      contextBefore: text.slice(contextStart, startIndex).toLowerCase(),
      contextAfter: text.slice(endIndex, contextEnd).toLowerCase(),
    };
    
    // Extract year from wider context
    claim.year = extractYearFromContext(claim, text);
    
    claims.push(claim);
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
    
    // Within attribute-specific tolerance
    const tolerance = getToleranceForAttribute(attribute);
    if (percentDiff <= tolerance) {
      return { status: "close", fact: matchingFact, percentageDiff: percentDiff };
    }
    
    // More than tolerance difference
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

  // Skip rounding precision check for year-based attributes (founded_year)
  // as rounding to nearest thousand would make 1000 match 789, which is incorrect
  const isYearAttribute = attribute === 'founded_year';
  
  if (!isYearAttribute) {
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
  }

  // Check if within credible range [min, max]
  // Add attribute-specific tolerance to account for rounding when users enter human-readable numbers like "36m"
  const tolerancePercent = getToleranceForAttribute(attribute);
  // Base tolerance on the larger of range size or consensus value to ensure:
  // 1. Symmetry for mixed-sign ranges (e.g., negative inflation)
  // 2. Non-zero tolerance for single-point data (e.g., founding years where min === max)
  const rangeSize = Math.abs(sourceData.max - sourceData.min);
  const toleranceBase = Math.max(rangeSize, Math.abs(sourceData.consensus));
  const toleranceAmount = toleranceBase * (tolerancePercent / 100);
  const minWithTolerance = sourceData.min - toleranceAmount;
  const maxWithTolerance = sourceData.max + toleranceAmount;
  
  if (claimedNum >= minWithTolerance && claimedNum <= maxWithTolerance) {
    const percentDiff = calculatePercentageDifference(claimedNum, sourceData.consensus);
    return { status: "verified", multiSource: sourceData, percentageDiff: percentDiff };
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

  const allClaims = extractNumericClaims(text);
  
  // Filter out temporal years (e.g., "in 1980") - they're context, not claims
  const claims = allClaims.filter(claim => !isTemporalYear(claim));
  
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
      entity,
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

  const allClaims = extractNumericClaims(text);
  
  // Filter out temporal years (e.g., "in 1980") - they're context, not claims
  const claims = allClaims.filter(claim => !isTemporalYear(claim));
  
  const verifiedClaims: VerifiedClaim[] = [];
  const results: VerificationResult[] = [];

  claims.forEach((claim) => {
    const attribute = guessAttribute(claim, attributeMapping);
    const verification = verifyClaimMultiSource(claim, attribute, entity, multiSourceData);

    // Log unsupported entity-attribute combinations for future data expansion
    // Only logs when BOTH entity AND attribute are recognized but no data exists (status === "unknown")
    if (verification.status === "unknown" && entity && attribute) {
      fetch('/api/requested-facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity,
          attribute,
          claimValue: claim.value
        })
      }).catch(() => {
        // Silently ignore errors - logging is best-effort
      });
    }

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

    // Extract individual sources from credibleEvaluations and deduplicate by domain
    const allSources = verification.multiSource?.credibleEvaluations.map((evaluation) => {
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
        trustScore: evaluation.trust_score ?? -1, // Use -1 to indicate missing score
        url: evaluation.source_url,
        evaluatedAt: evaluation.evaluated_at,
        asOfDate: evaluation.as_of_date ?? undefined
      };
    });

    // Deduplicate sources by domain (keeps most recent entry for each unique domain)
    const sources = allSources ? Array.from(
      allSources.reduce((map, source) => {
        const existing = map.get(source.domain);
        if (!existing || source.evaluatedAt > existing.evaluatedAt) {
          map.set(source.domain, source);
        }
        return map;
      }, new Map<string, typeof allSources[0]>()).values()
    ) : undefined;

    // Find most recent evaluation date and as_of_date
    let mostRecentDate: string | undefined;
    let mostRecentAsOfDate: string | undefined;
    if (sources && sources.length > 0) {
      mostRecentDate = sources.reduce((latest, source) => {
        if (!latest) return source.evaluatedAt;
        return source.evaluatedAt > latest ? source.evaluatedAt : latest;
      }, sources[0].evaluatedAt);
      
      // Find the most recent as_of_date from sources
      const datesWithAsOfDate = sources.filter(s => s.asOfDate);
      if (datesWithAsOfDate.length > 0) {
        mostRecentAsOfDate = datesWithAsOfDate.reduce((latest, source) => {
          if (!latest || !source.asOfDate) return source.asOfDate;
          return (source.asOfDate && source.asOfDate > latest) ? source.asOfDate : latest;
        }, datesWithAsOfDate[0].asOfDate);
      }
    }

    results.push({
      entity,
      claimedValue: claim.value,
      attribute: attribute || "unknown",
      verdict: verification.status,
      recordedValue,
      asOfDate: mostRecentAsOfDate,
      lastVerifiedAt: mostRecentDate,
      citation: undefined,
      sourceTrust: sourceCount !== undefined ? `${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}` : undefined,
      sources,
    });
  });

  return { verifiedClaims, results, detectedEntity: entity };
}