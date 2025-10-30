import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Assay, FetchSource, Parser } from '@shared/schema';
import { getCountryISOCode } from './utils/country-codes';

interface AssayInput {
  entity?: string;
  year?: number;
  claimed_value?: number | string;
  custom?: Record<string, any>;
}

interface FetchResult {
  source: string;
  response: any;
  error?: string;
  timestamp: string;
}

interface ParsedValue {
  source: string;
  value: number | string;
  unit?: string;
  error?: string;
}

interface ConsensusResult {
  passed: boolean;
  value?: number | string;
  confidence: number; // 0-100
  agreement: number; // 0-100, percentage of sources that agree
  sources_count: number;
  agreeing_sources: string[];
  disagreeing_sources: string[];
}

interface AssayExecutionResult {
  assay_id: string;
  assay_version: string;
  claim: string;
  entity?: string;
  attribute?: string;
  claimed_value?: string;
  raw_responses: FetchResult[];
  parsed_values: ParsedValue[];
  consensus_result: ConsensusResult;
  verification_status: 'verified' | 'rejected' | 'uncertain';
  artifact_hash: string;
  execution_time_ms: number;
}

export class AssayExecutor {
  private assays: Map<string, Assay> = new Map();
  private assaysDir = path.join(process.cwd(), 'server', 'assays');

  constructor() {
    this.loadAssays();
  }

  private loadAssays() {
    if (!fs.existsSync(this.assaysDir)) {
      console.warn(`Assays directory not found: ${this.assaysDir}`);
      return;
    }

    const files = fs.readdirSync(this.assaysDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.assaysDir, file), 'utf-8');
        const assay: Assay = JSON.parse(content);
        this.assays.set(assay.id, assay);
        console.log(`Loaded assay: ${assay.id} (${assay.name})`);
      } catch (error) {
        console.error(`Failed to load assay from ${file}:`, error);
      }
    }
  }

  getAssay(id: string): Assay | undefined {
    return this.assays.get(id);
  }

  getAllAssays(): Assay[] {
    return Array.from(this.assays.values());
  }

  async executeAssay(
    assayId: string,
    inputs: AssayInput,
    claim: string
  ): Promise<AssayExecutionResult> {
    const startTime = Date.now();
    const assay = this.assays.get(assayId);
    
    if (!assay) {
      throw new Error(`Assay not found: ${assayId}`);
    }

    // Execute fetch plan
    const rawResponses = await this.executeFetchPlan(assay, inputs);

    // Parse responses
    const parsedValues = await this.parseResponses(assay, rawResponses, inputs);

    // Determine consensus
    const consensusResult = this.determineConsensus(assay, parsedValues, inputs);

    // Determine verification status
    const verification_status = consensusResult.passed ? 'verified' : 
                               consensusResult.confidence > 30 ? 'uncertain' : 'rejected';

    // Calculate hash for integrity
    const artifact_hash = this.calculateHash(rawResponses);

    const execution_time_ms = Date.now() - startTime;

    return {
      assay_id: assay.id,
      assay_version: assay.version,
      claim,
      entity: inputs.entity,
      attribute: this.inferAttribute(assay),
      claimed_value: inputs.claimed_value?.toString(),
      raw_responses: rawResponses,
      parsed_values: parsedValues,
      consensus_result: consensusResult,
      verification_status,
      artifact_hash,
      execution_time_ms,
    };
  }

  private async executeFetchPlan(assay: Assay, inputs: AssayInput): Promise<FetchResult[]> {
    const fetchPromises = assay.fetch_plan.sources.map(source =>
      this.fetchFromSource(source, inputs).catch(error => ({
        source: source.name,
        response: null,
        error: error.message,
        timestamp: new Date().toISOString(),
      }))
    );

    if (assay.fetch_plan.parallel !== false) {
      return await Promise.all(fetchPromises);
    } else {
      const results: FetchResult[] = [];
      for (const promise of fetchPromises) {
        const result = await promise;
        results.push(result);
        if (assay.fetch_plan.fail_fast && result.error) {
          break;
        }
      }
      return results;
    }
  }

  private async fetchFromSource(source: FetchSource, inputs: AssayInput): Promise<FetchResult> {
    const timestamp = new Date().toISOString();
    
    try {
      // Interpolate variables in endpoint and query
      let endpoint = this.interpolate(source.endpoint, inputs, source);
      let query = source.query ? this.interpolate(source.query, inputs, source) : undefined;

      const timeout = source.timeout || 10000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      let response: Response;

      if (source.method === 'SPARQL') {
        const sparqlEndpoint = endpoint;
        const params = new URLSearchParams({
          query: query || '',
          format: 'json',
        });

        response = await fetch(`${sparqlEndpoint}?${params.toString()}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/sparql-results+json',
            ...source.headers,
          },
          signal: controller.signal,
        });
      } else if (source.method === 'POST') {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...source.headers,
          },
          body: JSON.stringify(source.body),
          signal: controller.signal,
        });
      } else {
        // Default to GET
        response = await fetch(endpoint, {
          method: 'GET',
          headers: source.headers || {},
          signal: controller.signal,
        });
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        source: source.name,
        response: data,
        timestamp,
      };
    } catch (error: any) {
      return {
        source: source.name,
        response: null,
        error: error.message,
        timestamp,
      };
    }
  }

  private async parseResponses(
    assay: Assay,
    rawResponses: FetchResult[],
    inputs: AssayInput
  ): Promise<ParsedValue[]> {
    const parsedValues: ParsedValue[] = [];

    for (const fetchResult of rawResponses) {
      if (fetchResult.error || !fetchResult.response) {
        parsedValues.push({
          source: fetchResult.source,
          value: '',
          error: fetchResult.error || 'No response',
        });
        continue;
      }

      const parser = assay.parsers[fetchResult.source];
      if (!parser) {
        parsedValues.push({
          source: fetchResult.source,
          value: '',
          error: 'No parser configured for source',
        });
        continue;
      }

      try {
        let value = await this.applyParser(parser, fetchResult.response, inputs);
        
        parsedValues.push({
          source: fetchResult.source,
          value,
          unit: assay.expected_signal.unit,
        });
      } catch (error: any) {
        parsedValues.push({
          source: fetchResult.source,
          value: '',
          error: error.message,
        });
      }
    }

    return parsedValues;
  }

  private async applyParser(parser: Parser, response: any, inputs: AssayInput): Promise<number | string> {
    let value: any;

    if (parser.type === 'jsonpath') {
      // Simple JSONPath implementation
      value = this.evaluateJsonPath(parser.expression, response, inputs);
    } else if (parser.type === 'sparql') {
      // Extract from SPARQL results
      value = this.evaluateJsonPath(parser.expression, response, inputs);
    } else {
      throw new Error(`Unsupported parser type: ${parser.type}`);
    }

    // Apply transform if specified
    if (parser.transform && value !== null && value !== undefined) {
      if (parser.transform === 'parseInt') {
        value = parseInt(value);
      } else if (parser.transform === 'parseFloat') {
        value = parseFloat(value);
      } else if (parser.transform === 'extractYear') {
        // Extract year from ISO date string
        const match = String(value).match(/(\d{4})/);
        value = match ? parseInt(match[1]) : value;
      }
    }

    return value;
  }

  private evaluateJsonPath(expression: string, data: any, inputs: AssayInput): any {
    // Interpolate variables in expression
    expression = this.interpolate(expression, inputs);

    // Very basic JSONPath evaluation (supports simple paths like $.results.bindings[0].value)
    if (expression.startsWith('$')) {
      expression = expression.substring(1);
    }

    const parts = expression.split(/\.|\[|\]/).filter(p => p.length > 0);
    let current = data;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return null;
      }

      // Handle array index
      if (/^\d+$/.test(part)) {
        current = current[parseInt(part)];
      } 
      // Handle filter expressions like ?(@.date=="2023")
      else if (part.startsWith('?')) {
        // For now, just return first element (simplification)
        if (Array.isArray(current)) {
          current = current[0];
        }
      }
      else {
        current = current[part];
      }
    }

    return current;
  }

  private determineConsensus(
    assay: Assay,
    parsedValues: ParsedValue[],
    inputs: AssayInput
  ): ConsensusResult {
    const validValues = parsedValues.filter(p => !p.error && p.value !== '');
    
    if (validValues.length === 0) {
      return {
        passed: false,
        confidence: 0,
        agreement: 0,
        sources_count: 0,
        agreeing_sources: [],
        disagreeing_sources: parsedValues.map(p => p.source),
      };
    }

    const claimedValue = this.normalizeValue(inputs.claimed_value);
    const tolerance = assay.expected_signal.tolerance;

    const agreeing: ParsedValue[] = [];
    const disagreeing: ParsedValue[] = [];

    for (const parsed of validValues) {
      const normalizedValue = this.normalizeValue(parsed.value);
      const withinTolerance = this.isWithinTolerance(normalizedValue, claimedValue, tolerance);
      
      if (withinTolerance) {
        agreeing.push(parsed);
      } else {
        disagreeing.push(parsed);
      }
    }

    const agreementPercentage = validValues.length > 0 
      ? (agreeing.length / validValues.length) * 100 
      : 0;

    const minSources = assay.expected_signal.min_sources || 1;
    const hasEnoughSources = agreeing.length >= minSources;

    const consensusRule = assay.expected_signal.consensus_rule || 'majority_within_tolerance';
    let passed = false;

    if (consensusRule === 'majority_within_tolerance') {
      passed = agreementPercentage > 50 && hasEnoughSources;
    } else if (consensusRule === 'unanimous') {
      passed = agreementPercentage === 100 && hasEnoughSources;
    } else if (consensusRule === 'any') {
      passed = agreeing.length > 0;
    }

    return {
      passed,
      value: agreeing.length > 0 ? agreeing[0].value : undefined,
      confidence: agreementPercentage,
      agreement: agreementPercentage,
      sources_count: validValues.length,
      agreeing_sources: agreeing.map(p => p.source),
      disagreeing_sources: disagreeing.map(p => p.source),
    };
  }

  private normalizeValue(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // Remove commas
      let normalized = value.replace(/,/g, '');
      
      // Handle k/m/b/t notation
      const match = normalized.match(/([\d.]+)\s*(k|m|b|t|million|billion|trillion)?/i);
      if (match) {
        let num = parseFloat(match[1]);
        const suffix = match[2]?.toLowerCase();
        
        if (suffix === 'k') num *= 1000;
        else if (suffix === 'm' || suffix === 'million') num *= 1000000;
        else if (suffix === 'b' || suffix === 'billion') num *= 1000000000;
        else if (suffix === 't' || suffix === 'trillion') num *= 1000000000000;
        
        return num;
      }
      
      return parseFloat(normalized);
    }
    return 0;
  }

  private isWithinTolerance(value: number, target: number, tolerance: string | number): boolean {
    if (typeof tolerance === 'string' && tolerance.endsWith('%')) {
      const percentTolerance = parseFloat(tolerance) / 100;
      const delta = Math.abs(value - target);
      const allowedDelta = target * percentTolerance;
      return delta <= allowedDelta;
    } else {
      const numericTolerance = typeof tolerance === 'number' ? tolerance : parseFloat(tolerance);
      return Math.abs(value - target) <= numericTolerance;
    }
  }

  private interpolate(template: string, inputs: AssayInput, source?: FetchSource): string {
    let result = template;
    
    if (inputs.entity) {
      // For World Bank API, convert country names to ISO codes
      let entityValue = inputs.entity;
      if (source && source.name === 'worldbank') {
        const isoCode = getCountryISOCode(inputs.entity);
        if (isoCode) {
          entityValue = isoCode;
        } else {
          console.warn(`No ISO code found for country: ${inputs.entity}, using original name`);
        }
      }
      result = result.replace(/\{entity\}/g, entityValue);
    }
    if (inputs.year) {
      result = result.replace(/\{year\}/g, inputs.year.toString());
    }
    if (inputs.claimed_value !== undefined) {
      result = result.replace(/\{claimed_value\}/g, inputs.claimed_value.toString());
    }
    
    // Handle custom inputs
    if (inputs.custom) {
      for (const [key, value] of Object.entries(inputs.custom)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
      }
    }
    
    return result;
  }

  private calculateHash(rawResponses: FetchResult[]): string {
    const content = JSON.stringify(rawResponses, null, 0);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private inferAttribute(assay: Assay): string {
    // Infer attribute from assay ID
    if (assay.id.includes('population')) return 'population';
    if (assay.id.includes('gdp')) return 'gdp';
    if (assay.id.includes('founding')) return 'founded_year';
    if (assay.id.includes('independence')) return 'independence_year';
    
    return assay.domain || 'unknown';
  }

  matchClaim(claim: string, entity?: string): Assay | null {
    const allAssays = Array.from(this.assays.values());
    
    for (const assay of allAssays) {
      if (!assay.claim_patterns) continue;

      for (const pattern of assay.claim_patterns) {
        const regex = entity 
          ? new RegExp(pattern.replace(/\{entity\}/g, entity), 'i')
          : new RegExp(pattern, 'i');
        
        if (regex.test(claim)) {
          return assay;
        }
      }
    }

    return null;
  }

  findAssayByAttribute(attribute: string): Assay | null {
    const allAssays = Array.from(this.assays.values());
    
    for (const assay of allAssays) {
      const inferredAttr = this.inferAttribute(assay);
      if (inferredAttr === attribute) {
        return assay;
      }
    }

    return null;
  }
}

// Singleton instance
export const assayExecutor = new AssayExecutor();

/**
 * Helper function to execute assay verification from API routes
 * Finds matching assay based on attribute, executes it, and stores provenance
 */
export async function executeAssay(
  entity: string,
  attribute: string,
  value: string | number,
  year?: number
): Promise<{
  verified: boolean;
  consensus?: number;
  provenance_id?: number;
  message?: string;
}> {
  // Find matching assay for this attribute
  const assay = assayExecutor.findAssayByAttribute(attribute);
  
  if (!assay) {
    return {
      verified: false,
      message: `No assay available for attribute: ${attribute}`
    };
  }

  try {
    // Execute the assay
    const claim = `${entity} ${attribute} ${value}`;
    const inputs: AssayInput = {
      entity,
      year,
      claimed_value: value
    };

    const result = await assayExecutor.executeAssay(assay.id, inputs, claim);

    // Store provenance in database
    const { storage } = await import('./storage');
    const provenance = await storage.insertAssayProvenance({
      assay_id: result.assay_id,
      assay_version: result.assay_version,
      claim: result.claim,
      entity: result.entity,
      attribute: result.attribute,
      claimed_value: result.claimed_value,
      raw_responses: JSON.stringify(result.raw_responses),
      parsed_values: JSON.stringify(result.parsed_values),
      consensus_result: JSON.stringify(result.consensus_result),
      verification_status: result.verification_status,
      artifact_hash: result.artifact_hash
    });

    return {
      verified: result.verification_status === 'verified',
      consensus: typeof result.consensus_result.value === 'number' 
        ? result.consensus_result.value 
        : undefined,
      provenance_id: provenance.id,
      message: `Assay executed: ${result.assay_id} (${result.verification_status})`
    };
  } catch (error) {
    console.error('Assay execution error:', error);
    return {
      verified: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
