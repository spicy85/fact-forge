import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ShieldCheck, Filter } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { FactRecord } from "@/lib/factChecker";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface SourceMetrics {
  domain: string;
  public_trust: number;
  data_accuracy: number;
  proprietary_score: number;
  status: string;
  added_at: string;
  promoted_at: string | null;
  facts_count: number;
  notes: string | null;
}

interface SourceStats {
  domain: string;
  factCount: number;
  publicTrust: number;
  dataAccuracy: number;
  proprietaryScore: number;
  overallTrustLevel: number;
}

export default function SourcesOverview() {
  const [editingValues, setEditingValues] = useState<Record<string, SourceMetrics>>({});

  const { data: facts = [] } = useQuery<FactRecord[]>({
    queryKey: ["/api/facts"],
  });

  const { data: sourceMetrics = [], isLoading } = useQuery<SourceMetrics[]>({
    queryKey: ["/api/sources", "trusted"],
    queryFn: async () => {
      const response = await fetch("/api/sources?status=trusted");
      if (!response.ok) throw new Error("Failed to fetch sources");
      return response.json();
    },
  });

  const updateSourceMutation = useMutation({
    mutationFn: async ({ domain, updates }: { domain: string; updates: Partial<SourceMetrics> }) => {
      return apiRequest("PUT", `/api/sources/${domain}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sources", "trusted"] });
    },
  });

  const demoteSourceMutation = useMutation({
    mutationFn: async (domain: string) => {
      return apiRequest("PUT", `/api/sources/${domain}/demote`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sources", "trusted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sources", "pending_review"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sources", "evaluating"] });
    },
  });

  const getTrustBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "outline";
  };

  // Count facts per domain
  const factCountMap = new Map<string, number>();
  facts.forEach((fact) => {
    try {
      const url = new URL(fact.source_url);
      const domain = url.hostname.replace(/^www\./, "");
      factCountMap.set(domain, (factCountMap.get(domain) || 0) + 1);
    } catch (error) {
      console.error("Invalid URL:", fact.source_url);
    }
  });

  // Combine metrics with fact counts
  const sources: SourceStats[] = sourceMetrics.map((source) => {
    const editedSource = editingValues[source.domain] || source;
    const overallTrustLevel = Math.round(
      (editedSource.public_trust + editedSource.data_accuracy + editedSource.proprietary_score) / 3
    );

    return {
      domain: source.domain,
      factCount: factCountMap.get(source.domain) || 0,
      publicTrust: editedSource.public_trust,
      dataAccuracy: editedSource.data_accuracy,
      proprietaryScore: editedSource.proprietary_score,
      overallTrustLevel,
    };
  }).sort((a, b) => b.factCount - a.factCount);

  const handleValueChange = (domain: string, field: keyof Pick<SourceMetrics, 'public_trust' | 'data_accuracy' | 'proprietary_score'>, value: string) => {
    const numValue = parseInt(value) || 0;
    const clampedValue = Math.min(Math.max(numValue, 0), 100);
    
    const currentSource = sourceMetrics.find(s => s.domain === domain);
    if (!currentSource) return;

    const updatedSource = {
      ...currentSource,
      ...(editingValues[domain] || {}),
      [field]: clampedValue,
    };

    setEditingValues(prev => ({
      ...prev,
      [domain]: updatedSource,
    }));

    updateSourceMutation.mutate({
      domain,
      updates: { [field]: clampedValue },
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading sources...</p>
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
              <h1 className="text-2xl font-semibold" data-testid="text-sources-title">
                Sources Overview
              </h1>
              <p className="text-sm text-muted-foreground">
                Monitor data sources and reliability
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sources/pipeline">
              <Button variant="outline" size="sm" data-testid="button-view-pipeline">
                <Filter className="h-4 w-4 mr-2" />
                View Pipeline
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" size="sm" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Checker
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Trusted Data Sources</CardTitle>
            <CardDescription>
              Production-ready sources used for fact verification. Metrics: Public Trust (reputation), Data Accuracy (verification rate), and Proprietary Score (transparency). Overall Trust Level is a weighted average.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 text-sm text-muted-foreground">
              Total sources: {sources.length} • Total facts: {sources.reduce((sum, s) => sum + s.factCount, 0)}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead data-testid="header-domain">Domain</TableHead>
                  <TableHead data-testid="header-facts">Facts</TableHead>
                  <TableHead data-testid="header-public-trust">Public Trust</TableHead>
                  <TableHead data-testid="header-data-accuracy">Data Accuracy</TableHead>
                  <TableHead data-testid="header-proprietary">Proprietary Score</TableHead>
                  <TableHead data-testid="header-overall">Overall Trust</TableHead>
                  <TableHead data-testid="header-actions">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((source) => (
                  <TableRow key={source.domain} data-testid={`row-source-${source.domain}`}>
                    <TableCell className="font-mono text-sm" data-testid={`text-domain-${source.domain}`}>
                      {source.domain}
                    </TableCell>
                    <TableCell data-testid={`text-count-${source.domain}`}>
                      {source.factCount}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={source.publicTrust}
                        onChange={(e) => handleValueChange(source.domain, 'public_trust', e.target.value)}
                        className="w-20"
                        data-testid={`input-public-trust-${source.domain}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={source.dataAccuracy}
                        onChange={(e) => handleValueChange(source.domain, 'data_accuracy', e.target.value)}
                        className="w-20"
                        data-testid={`input-data-accuracy-${source.domain}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={source.proprietaryScore}
                        onChange={(e) => handleValueChange(source.domain, 'proprietary_score', e.target.value)}
                        className="w-20"
                        data-testid={`input-proprietary-${source.domain}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={getTrustBadgeVariant(source.overallTrustLevel)} data-testid={`badge-overall-${source.domain}`}>
                        {source.overallTrustLevel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => demoteSourceMutation.mutate(source.domain)}
                        disabled={demoteSourceMutation.isPending}
                        data-testid={`button-demote-${source.domain}`}
                      >
                        Demote
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
