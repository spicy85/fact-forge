import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Calculator, Info, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FactsEvaluationRecord {
  id: number;
  entity: string;
  attribute: string;
  value: string;
  source_trust_score: number;
  recency_score: number;
  consensus_score: number;
  source_trust_weight: number;
  recency_weight: number;
  consensus_weight: number;
  trust_score: number;
  evaluated_at: string;
  source_url: string;
}

interface SourceMetrics {
  domain: string;
  public_trust: number;
  data_accuracy: number;
  proprietary_score: number;
}

type SortColumn = 'entity' | 'attribute' | 'value' | 'source_trust_score' | 'recency_score' | 'consensus_score' | 'trust_score';
type SortDirection = 'asc' | 'desc' | null;

export default function EvaluationScoring() {
  const [selectedRecord, setSelectedRecord] = useState<FactsEvaluationRecord | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const { toast } = useToast();
  const breakdownRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to breakdown when a record is selected
  useEffect(() => {
    if (selectedRecord && breakdownRef.current) {
      breakdownRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedRecord]);

  const { data: evaluations = [], isLoading } = useQuery<FactsEvaluationRecord[]>({
    queryKey: ["/api/facts-evaluation"],
  });

  const { data: sources = [] } = useQuery<SourceMetrics[]>({
    queryKey: ["/api/sources"],
  });

  const recalculateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/facts-evaluation/recalculate");
      return await response.json();
    },
    onSuccess: (data: { message?: string; updatedCount?: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/facts-evaluation"] });
      toast({
        title: "Scores Recalculated",
        description: data.message || "All evaluation scores have been updated with current settings.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to recalculate scores. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getTrustBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "outline";
  };

  const getTrustLabel = (score: number) => {
    if (score >= 80) return "High";
    if (score >= 60) return "Medium";
    return "Low";
  };

  // Handle column sorting
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort evaluations with memoization
  const sortedEvaluations = useMemo(() => {
    if (!sortColumn || !sortDirection) return evaluations;

    return [...evaluations].sort((a, b) => {
      let aValue: any = a[sortColumn];
      let bValue: any = b[sortColumn];

      // Special handling for 'value' column - parse as number for numeric sorting
      if (sortColumn === 'value') {
        const aNum = parseFloat(aValue.replace(/,/g, ''));
        const bNum = parseFloat(bValue.replace(/,/g, ''));
        
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }
      }

      // Handle numeric columns
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // Handle string columns with locale-aware comparison
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue, undefined, { sensitivity: 'base' });
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      // Fallback comparison
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [evaluations, sortColumn, sortDirection]);

  // Render sort icon
  const renderSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 ml-1" />;
    }
    return <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Calculate statistics
  const stats = {
    total: evaluations.length,
    avgSourceTrust: evaluations.length > 0 
      ? Math.round(evaluations.reduce((sum, e) => sum + e.source_trust_score, 0) / evaluations.length)
      : 0,
    avgRecency: evaluations.length > 0
      ? Math.round(evaluations.reduce((sum, e) => sum + e.recency_score, 0) / evaluations.length)
      : 0,
    avgConsensus: evaluations.length > 0
      ? Math.round(evaluations.reduce((sum, e) => sum + e.consensus_score, 0) / evaluations.length)
      : 0,
    avgTrust: evaluations.length > 0
      ? Math.round(evaluations.reduce((sum, e) => sum + e.trust_score, 0) / evaluations.length)
      : 0,
    highTrust: evaluations.filter(e => e.trust_score >= 80).length,
    mediumTrust: evaluations.filter(e => e.trust_score >= 60 && e.trust_score < 80).length,
    lowTrust: evaluations.filter(e => e.trust_score < 60).length,
    recentCount: evaluations.filter(e => e.recency_score === 100).length,
    mediumRecencyCount: evaluations.filter(e => e.recency_score === 50).length,
    olderCount: evaluations.filter(e => e.recency_score === 10).length,
  };

  const exampleRecord = evaluations.length > 0 ? evaluations[0] : null;

  // Get source metrics for example record
  const getSourceMetrics = (sourceUrl: string): SourceMetrics | null => {
    try {
      const url = new URL(sourceUrl);
      const domain = url.hostname.replace(/^www\./, "");
      return sources.find(s => s.domain === domain) || null;
    } catch {
      return null;
    }
  };

  const exampleSourceMetrics = exampleRecord ? getSourceMetrics(exampleRecord.source_url) : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading evaluations...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" data-testid="link-home">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Calculator className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Evaluation Scoring</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => recalculateMutation.mutate()}
              disabled={recalculateMutation.isPending}
              data-testid="button-recalculate"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${recalculateMutation.isPending ? 'animate-spin' : ''}`} />
              {recalculateMutation.isPending ? "Recalculating..." : "Recalculate Scores"}
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Statistics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="card-total-evaluations">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Evaluations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total">{stats.total}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-component-averages">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Score Averages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Source Trust:</span>
                  <span className="font-mono" data-testid="text-avg-source-trust">{stats.avgSourceTrust}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recency:</span>
                  <span className="font-mono" data-testid="text-avg-recency">{stats.avgRecency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Consensus:</span>
                  <span className="font-mono" data-testid="text-avg-consensus">{stats.avgConsensus}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-avg-trust">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Trust Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold font-mono" data-testid="text-avg-trust">{stats.avgTrust}</div>
                <Badge variant={getTrustBadgeVariant(stats.avgTrust)} data-testid="badge-avg-trust">
                  {getTrustLabel(stats.avgTrust)}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-trust-distribution">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Trust Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">High (≥80):</span>
                  <span className="font-mono" data-testid="text-high-count">{stats.highTrust}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Medium (60-79):</span>
                  <span className="font-mono" data-testid="text-medium-count">{stats.mediumTrust}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Low (&lt;60):</span>
                  <span className="font-mono" data-testid="text-low-count">{stats.lowTrust}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-recency-distribution">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recency Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recent (≤7 days):</span>
                  <span className="font-mono" data-testid="text-recent-count">{stats.recentCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Medium (≤30 days):</span>
                  <span className="font-mono" data-testid="text-medium-recency-count">{stats.mediumRecencyCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Older (&gt;30 days):</span>
                  <span className="font-mono" data-testid="text-older-count">{stats.olderCount}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Formulas Explanation */}
        <Card data-testid="card-formulas">
          <CardHeader>
            <CardTitle>Scoring Formulas</CardTitle>
            <CardDescription>
              Understanding how evaluation scores are calculated
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Source Trust Score */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">1. Source Trust Score</h3>
                <Badge variant="outline">Automatic</Badge>
              </div>
              <div className="bg-muted p-4 rounded-md font-mono text-sm">
                source_trust_score = (public_trust + data_accuracy + proprietary_score) / 3
              </div>
              <p className="text-sm text-muted-foreground">
                Calculated from the source's reliability metrics in the sources table. Based on the domain extracted from the source URL.
              </p>
              {exampleRecord && exampleSourceMetrics && (
                <div className="text-sm bg-card border rounded-md p-3">
                  <p className="font-semibold mb-2">Example:</p>
                  <p className="font-mono text-xs break-all text-muted-foreground mb-2">{exampleRecord.source_url}</p>
                  <p className="font-mono">
                    = ({exampleSourceMetrics.public_trust} public + {exampleSourceMetrics.data_accuracy} accuracy + {exampleSourceMetrics.proprietary_score} proprietary) / 3
                  </p>
                  <p className="font-mono mt-1">
                    = ({exampleSourceMetrics.public_trust} + {exampleSourceMetrics.data_accuracy} + {exampleSourceMetrics.proprietary_score}) / 3 = <span className="font-bold">{exampleRecord.source_trust_score}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Recency Score */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">2. Recency Score</h3>
                <Badge variant="outline">Automatic</Badge>
              </div>
              <div className="bg-muted p-4 rounded-md font-mono text-sm">
                if (days_since_evaluation ≤ 7) → 100<br />
                if (days_since_evaluation ≤ 30) → 50<br />
                else → 10
              </div>
              <p className="text-sm text-muted-foreground">
                Three-tier scoring based on evaluation age: within 1 week (100), within 1 month (50), older than 1 month (10).
              </p>
            </div>

            {/* Consensus Score */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">3. Consensus Score</h3>
                <Badge>Manual</Badge>
              </div>
              <div className="bg-muted p-4 rounded-md font-mono text-sm">
                consensus_score = 0-100 (user input)
              </div>
              <p className="text-sm text-muted-foreground">
                Represents agreement from multiple independent sources. Higher values indicate stronger consensus.
              </p>
            </div>

            {/* Trust Score */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">4. Overall Trust Score</h3>
                <Badge variant="outline">Weighted Average</Badge>
              </div>
              <div className="bg-muted p-4 rounded-md font-mono text-sm">
                trust_score = (source_trust × w₁ + recency × w₂ + consensus × w₃) / (w₁ + w₂ + w₃)
              </div>
              <p className="text-sm text-muted-foreground">
                Default weights: w₁ = w₂ = w₃ = 1 (equal weighting)
              </p>
              {exampleRecord && (
                <div className="text-sm bg-card border rounded-md p-3">
                  <p className="font-semibold mb-2">Example Calculation:</p>
                  <p className="font-mono text-sm">
                    = ({exampleRecord.source_trust_score} × {exampleRecord.source_trust_weight} + {exampleRecord.recency_score} × {exampleRecord.recency_weight} + {exampleRecord.consensus_score} × {exampleRecord.consensus_weight}) / ({exampleRecord.source_trust_weight} + {exampleRecord.recency_weight} + {exampleRecord.consensus_weight})
                  </p>
                  <p className="font-mono text-sm mt-2">
                    = ({exampleRecord.source_trust_score * exampleRecord.source_trust_weight} + {exampleRecord.recency_score * exampleRecord.recency_weight} + {exampleRecord.consensus_score * exampleRecord.consensus_weight}) / {exampleRecord.source_trust_weight + exampleRecord.recency_weight + exampleRecord.consensus_weight}
                  </p>
                  <p className="font-mono text-sm mt-2">
                    = {exampleRecord.source_trust_score * exampleRecord.source_trust_weight + exampleRecord.recency_score * exampleRecord.recency_weight + exampleRecord.consensus_score * exampleRecord.consensus_weight} / {exampleRecord.source_trust_weight + exampleRecord.recency_weight + exampleRecord.consensus_weight} = <span className="font-bold">{exampleRecord.trust_score}</span>
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Evaluations Table */}
        <Card data-testid="card-evaluations-table">
          <CardHeader>
            <CardTitle>All Evaluations ({evaluations.length})</CardTitle>
            <CardDescription>
              Click any row to see detailed calculation breakdown
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('entity')}
                        className="h-8 px-2 font-medium hover-elevate"
                        data-testid="button-sort-entity"
                      >
                        Entity
                        {renderSortIcon('entity')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('attribute')}
                        className="h-8 px-2 font-medium hover-elevate"
                        data-testid="button-sort-attribute"
                      >
                        Attribute
                        {renderSortIcon('attribute')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort('value')}
                        className="h-8 px-2 font-medium hover-elevate"
                        data-testid="button-sort-value"
                      >
                        Value
                        {renderSortIcon('value')}
                      </Button>
                    </TableHead>
                    <TableHead>Source Domain</TableHead>
                    <TableHead className="text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort('source_trust_score')}
                            className="h-8 px-2 font-medium hover-elevate"
                            data-testid="button-sort-source-trust"
                          >
                            Source Trust
                            <Info className="h-3 w-3 ml-1" />
                            {renderSortIcon('source_trust_score')}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Average of source metrics</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort('recency_score')}
                            className="h-8 px-2 font-medium hover-elevate"
                            data-testid="button-sort-recency"
                          >
                            Recency
                            <Info className="h-3 w-3 ml-1" />
                            {renderSortIcon('recency_score')}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>100 if ≤7 days, 50 if ≤30 days, else 10</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort('consensus_score')}
                            className="h-8 px-2 font-medium hover-elevate"
                            data-testid="button-sort-consensus"
                          >
                            Consensus
                            <Info className="h-3 w-3 ml-1" />
                            {renderSortIcon('consensus_score')}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Manual agreement score</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort('trust_score')}
                            className="h-8 px-2 font-medium hover-elevate"
                            data-testid="button-sort-trust-score"
                          >
                            Trust Score
                            <Info className="h-3 w-3 ml-1" />
                            {renderSortIcon('trust_score')}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Weighted average of all scores</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEvaluations.map((evaluation) => {
                    const isSelected = selectedRecord?.id === evaluation.id;
                    return (
                      <TableRow
                        key={evaluation.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => setSelectedRecord(evaluation)}
                        data-testid={`row-evaluation-${evaluation.id}`}
                        data-selected={isSelected ? 'true' : 'false'}
                        style={{
                          backgroundColor: isSelected ? 'hsl(var(--accent) / 0.5)' : undefined
                        }}
                      >
                      <TableCell className="font-medium">{evaluation.entity}</TableCell>
                      <TableCell className="text-muted-foreground">{evaluation.attribute}</TableCell>
                      <TableCell className="font-mono text-sm">{evaluation.value}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {(() => {
                          try {
                            const url = new URL(evaluation.source_url);
                            return url.hostname.replace(/^www\./, "");
                          } catch {
                            return "-";
                          }
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm" data-testid={`text-source-trust-${evaluation.id}`}>
                          {evaluation.source_trust_score}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={evaluation.recency_score === 100 ? "default" : "outline"}
                          data-testid={`badge-recency-${evaluation.id}`}
                        >
                          {evaluation.recency_score}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm" data-testid={`text-consensus-${evaluation.id}`}>
                          {evaluation.consensus_score}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={getTrustBadgeVariant(evaluation.trust_score)}
                          data-testid={`badge-trust-${evaluation.id}`}
                        >
                          {evaluation.trust_score}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Selected Record Details */}
        {selectedRecord && (
          <Card ref={breakdownRef} data-testid="card-calculation-breakdown">
            <CardHeader>
              <CardTitle>Calculation Breakdown</CardTitle>
              <CardDescription>
                {selectedRecord.entity} - {selectedRecord.attribute}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Source Trust Score</p>
                  <p className="text-2xl font-bold font-mono" data-testid="text-breakdown-source-trust">
                    {selectedRecord.source_trust_score}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Weight: {selectedRecord.source_trust_weight}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Recency Score</p>
                  <p className="text-2xl font-bold font-mono" data-testid="text-breakdown-recency">
                    {selectedRecord.recency_score}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Weight: {selectedRecord.recency_weight}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Evaluated: {new Date(selectedRecord.evaluated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Consensus Score</p>
                  <p className="text-2xl font-bold font-mono" data-testid="text-breakdown-consensus">
                    {selectedRecord.consensus_score}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Weight: {selectedRecord.consensus_weight}
                  </p>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-md space-y-2">
                <p className="font-semibold">Calculation:</p>
                <p className="font-mono text-sm">
                  trust_score = ({selectedRecord.source_trust_score} × {selectedRecord.source_trust_weight} + {selectedRecord.recency_score} × {selectedRecord.recency_weight} + {selectedRecord.consensus_score} × {selectedRecord.consensus_weight}) / ({selectedRecord.source_trust_weight} + {selectedRecord.recency_weight} + {selectedRecord.consensus_weight})
                </p>
                <p className="font-mono text-sm">
                  = ({selectedRecord.source_trust_score * selectedRecord.source_trust_weight} + {selectedRecord.recency_score * selectedRecord.recency_weight} + {selectedRecord.consensus_score * selectedRecord.consensus_weight}) / {selectedRecord.source_trust_weight + selectedRecord.recency_weight + selectedRecord.consensus_weight}
                </p>
                <p className="font-mono text-sm">
                  = {selectedRecord.source_trust_score * selectedRecord.source_trust_weight + selectedRecord.recency_score * selectedRecord.recency_weight + selectedRecord.consensus_score * selectedRecord.consensus_weight} / {selectedRecord.source_trust_weight + selectedRecord.recency_weight + selectedRecord.consensus_weight}
                </p>
                <p className="font-mono text-sm font-bold">
                  = {selectedRecord.trust_score}
                </p>
              </div>

              <div className="pt-4">
                <p className="text-sm font-medium mb-2">Source URL:</p>
                <p className="text-xs text-muted-foreground break-all font-mono bg-muted p-2 rounded">
                  {selectedRecord.source_url}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
