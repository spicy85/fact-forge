import { VerificationStatus } from "@/components/VerificationBadge";
import { VerifiedClaim } from "@/components/RenderedParagraph";
import { VerificationResult } from "@/components/ResultsTable";

export interface FactRecord {
  entity: string;
  attribute: string;
  value: string;
  value_type: string;
  as_of_date: string;
  source_url: string;
  source_trust: string;
  last_verified_at: string;
}

export interface AttributeMapping {
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
 */
export function detectEntity(text: string, availableEntities: string[]): string | null {
  // Sort entities by length (descending) to match longer names first
  // e.g., "United States" before "United"
  // Create a copy to avoid mutating the original array
  const sortedEntities = [...availableEntities].sort((a, b) => b.length - a.length);
  
  for (const entity of sortedEntities) {
    // Use word boundary matching for entity names
    const regex = new RegExp(`\\b${entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text)) {
      return entity;
    }
  }
  
  return null;
}

export function extractNumericClaims(text: string): NumericClaim[] {
  const claims: NumericClaim[] = [];
  const numberRegex = /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g;
  let match;

  while ((match = numberRegex.exec(text)) !== null) {
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    const contextStart = Math.max(0, startIndex - 20);
    const contextEnd = Math.min(text.length, endIndex + 20);

    claims.push({
      value: match[0].replace(/,/g, ""),
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

  if (claimedValue === recordedValue) {
    return { status: "verified", fact: matchingFact };
  } else {
    return { status: "mismatch", fact: matchingFact };
  }
}

export function processText(
  text: string,
  facts: FactRecord[],
  attributeMapping: AttributeMapping,
  availableEntities: string[]
): {
  verifiedClaims: VerifiedClaim[];
  results: VerificationResult[];
  detectedEntity: string | null;
} {
  if (!text) {
    return { verifiedClaims: [], results: [], detectedEntity: null };
  }

  // Auto-detect entity from text
  const entity = detectEntity(text, availableEntities);
  
  if (!entity) {
    return { verifiedClaims: [], results: [], detectedEntity: null };
  }

  const claims = extractNumericClaims(text);
  const verifiedClaims: VerifiedClaim[] = [];
  const results: VerificationResult[] = [];

  claims.forEach((claim) => {
    const attribute = guessAttribute(claim, attributeMapping);
    const verification = verifyClaim(claim, attribute, entity, facts);

    const tooltipContent =
      verification.status === "verified"
        ? `Verified: ${claim.value} (${attribute?.replace(/_/g, " ")})`
        : verification.status === "mismatch"
        ? `Mismatch: Claimed ${claim.value}, but recorded value is ${verification.fact?.value}`
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
      recordedValue: verification.fact?.value,
      lastVerifiedAt: verification.fact?.last_verified_at,
      citation: verification.fact?.source_url,
    });
  });

  return { verifiedClaims, results, detectedEntity: entity };
}