import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ParagraphInput } from "@/components/ParagraphInput";
import { RenderedParagraph } from "@/components/RenderedParagraph";
import { ResultsTable } from "@/components/ResultsTable";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShieldCheck, Table, Database, Calculator, Settings, Clock, ChevronDown, BookOpen, FileText, Shield } from "lucide-react";
import {
  processText,
  processTextMultiSource,
  FactRecord,
  AttributeMapping,
  EntityMapping,
  MultiSourceData,
  detectEntity,
  extractNumericClaims,
  guessAttribute,
} from "@/lib/factChecker";
import { VerifiedClaim } from "@/components/RenderedParagraph";
import { VerificationResult } from "@/components/ResultsTable";

interface Source {
  domain: string;
  public_trust: number;
  data_accuracy: number;
  proprietary_score: number;
}

export default function FactChecker() {
  const [facts, setFacts] = useState<FactRecord[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [attributeMapping, setAttributeMapping] = useState<AttributeMapping>({});
  const [entityMapping, setEntityMapping] = useState<EntityMapping>({});
  const [entities, setEntities] = useState<string[]>([]);
  const [paragraph, setParagraph] = useState("");
  const [verifiedClaims, setVerifiedClaims] = useState<VerifiedClaim[]>([]);
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [detectedEntity, setDetectedEntity] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [factsRes, sourcesRes, attributeMappingRes, entityMappingRes] = await Promise.all([
          fetch("/api/facts"),
          fetch("/api/sources"),
          fetch("/attribute-mapping.json"),
          fetch("/entity-mapping.json"),
        ]);

        const parsedFacts: FactRecord[] = await factsRes.json();
        const parsedSources: Source[] = await sourcesRes.json();
        const attributeMappingData = await attributeMappingRes.json();
        const entityMappingData = await entityMappingRes.json();

        setFacts(parsedFacts);
        setSources(parsedSources);
        setAttributeMapping(attributeMappingData);
        setEntityMapping(entityMappingData);

        // Use all canonical country names from entity mapping (values, not keys)
        // This allows detection of unsupported countries for logging
        const allEntities = Array.from(new Set(Object.values(entityMappingData) as string[])).sort((a, b) => a.localeCompare(b));
        setEntities(allEntities);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const handleCheckFacts = async () => {
    // First detect entity
    const entity = detectEntity(paragraph, entities, entityMapping);
    
    if (!entity) {
      setVerifiedClaims([]);
      setResults([]);
      setDetectedEntity(null);
      return;
    }
    
    setDetectedEntity(entity);
    
    // Extract claims and guess attributes
    const claims = extractNumericClaims(paragraph);
    const entityAttributePairs = new Set<string>();
    
    claims.forEach((claim) => {
      const attribute = guessAttribute(claim, attributeMapping);
      if (attribute) {
        entityAttributePairs.add(`${entity}|${attribute}`);
      }
    });
    
    // Fetch multi-source data for all entity-attribute pairs
    const multiSourceData = new Map<string, MultiSourceData>();
    
    await Promise.all(
      Array.from(entityAttributePairs).map(async (pair) => {
        const [ent, attr] = pair.split('|');
        try {
          const response = await fetch(`/api/multi-source-evaluations?entity=${encodeURIComponent(ent)}&attribute=${encodeURIComponent(attr)}`);
          const data = await response.json();
          
          if (data) {
            multiSourceData.set(pair, data);
          }
        } catch (error) {
          console.error(`Error fetching multi-source data for ${pair}:`, error);
        }
      })
    );
    
    // Process text with multi-source data
    const { verifiedClaims: claims_verified, results: res } = await processTextMultiSource(
      paragraph,
      multiSourceData,
      attributeMapping,
      entities,
      entityMapping
    );
    
    setVerifiedClaims(claims_verified);
    setResults(res);
  };

  const handleClear = () => {
    setParagraph("");
    setVerifiedClaims([]);
    setResults([]);
    setDetectedEntity(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading fact checker...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-app-title">
                Knowledge Agent
              </h1>
              <p className="text-sm text-muted-foreground">
                Verify numeric claims against trusted data
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/claims-matrix">
              <Button variant="outline" size="sm" data-testid="button-view-matrix">
                <Table className="h-4 w-4 mr-2" />
                Claims Matrix
              </Button>
            </Link>
            <Link href="/data-coverage">
              <Button variant="outline" size="sm" data-testid="button-view-coverage">
                <BookOpen className="h-4 w-4 mr-2" />
                Data Coverage
              </Button>
            </Link>
            <Link href="/sources">
              <Button variant="outline" size="sm" data-testid="button-view-sources">
                <Database className="h-4 w-4 mr-2" />
                Sources
              </Button>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-controls-menu">
                  <Settings className="h-4 w-4 mr-2" />
                  Controls
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/assay-provenance" className="w-full cursor-pointer">
                    <FileText className="h-4 w-4 mr-2" />
                    Assay Provenance
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/gate-log" className="w-full cursor-pointer">
                    <Shield className="h-4 w-4 mr-2" />
                    Promotion Gate Log
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/facts/activity-log" className="w-full cursor-pointer">
                    <Clock className="h-4 w-4 mr-2" />
                    Facts Log
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/evaluation-scoring" className="w-full cursor-pointer">
                    <Calculator className="h-4 w-4 mr-2" />
                    Evaluation
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/admin" className="w-full cursor-pointer">
                    <Settings className="h-4 w-4 mr-2" />
                    Admin
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-8 space-y-8">
        <ParagraphInput
          value={paragraph}
          onChange={setParagraph}
          onClear={handleClear}
          onSubmit={handleCheckFacts}
        />

        <div className="flex items-center gap-4">
          <Button
            onClick={handleCheckFacts}
            disabled={!paragraph}
            data-testid="button-check-facts"
          >
            <ShieldCheck className="h-4 w-4 mr-2" />
            Check Facts
          </Button>
          {detectedEntity && (
            <div className="text-sm text-muted-foreground" data-testid="text-detected-entity">
              Detected entity: <span className="font-medium text-foreground">{detectedEntity}</span>
            </div>
          )}
        </div>

        {paragraph && detectedEntity === null && verifiedClaims.length === 0 && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950 p-4" data-testid="alert-no-entity">
            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
              No entity detected
            </h3>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              Please mention a country name in your paragraph. Currently supported: {entities.slice(0, 5).join(", ")}{entities.length > 5 && `, and ${entities.length - 5} more`}.
            </p>
          </div>
        )}

        {verifiedClaims.length > 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium mb-4">Verified Paragraph</h2>
              <RenderedParagraph
                originalText={paragraph}
                claims={verifiedClaims}
              />
            </div>

            <div>
              <h2 className="text-lg font-medium mb-4">Verification Results</h2>
              <ResultsTable results={results} />
            </div>
          </div>
        )}

        {!paragraph && (
          <div className="text-center py-12">
            <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Ready to Check Facts</h3>
            <p className="text-sm text-muted-foreground">
              Enter a paragraph containing numeric claims about a country and click "Check Facts"
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              The app will automatically detect the entity from your text
            </p>
          </div>
        )}
      </main>
    </div>
  );
}