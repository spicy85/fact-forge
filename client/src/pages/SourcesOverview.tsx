import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, ShieldCheck } from "lucide-react";
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
import { FactRecord } from "@/lib/factChecker";

interface SourceMetrics {
  domain: string;
  public_trust: number;
  data_accuracy: number;
  proprietary_score: number;
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
  const [sources, setSources] = useState<SourceStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSources() {
      try {
        const [factsRes, sourcesRes] = await Promise.all([
          fetch("/api/facts"),
          fetch("/api/sources"),
        ]);
        
        const facts: FactRecord[] = await factsRes.json();
        const sourceMetrics: SourceMetrics[] = await sourcesRes.json();

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
        const sourcesList: SourceStats[] = sourceMetrics.map((source) => {
          // Calculate weighted average (equal weights)
          const overallTrustLevel = Math.round(
            (source.public_trust + source.data_accuracy + source.proprietary_score) / 3
          );

          return {
            domain: source.domain,
            factCount: factCountMap.get(source.domain) || 0,
            publicTrust: source.public_trust,
            dataAccuracy: source.data_accuracy,
            proprietaryScore: source.proprietary_score,
            overallTrustLevel,
          };
        }).sort((a, b) => b.factCount - a.factCount);

        setSources(sourcesList);
      } catch (error) {
        console.error("Error loading sources:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSources();
  }, []);

  const getTrustBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "outline";
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
            <CardTitle>Data Sources</CardTitle>
            <CardDescription>
              Source reliability metrics: Public Trust (reputation), Data Accuracy (verification rate), and Proprietary Score (transparency). Overall Trust Level is a weighted average.
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
                    <TableCell data-testid={`text-public-trust-${source.domain}`}>
                      {source.publicTrust}
                    </TableCell>
                    <TableCell data-testid={`text-data-accuracy-${source.domain}`}>
                      {source.dataAccuracy}
                    </TableCell>
                    <TableCell data-testid={`text-proprietary-${source.domain}`}>
                      {source.proprietaryScore}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getTrustBadgeVariant(source.overallTrustLevel)} data-testid={`badge-overall-${source.domain}`}>
                        {source.overallTrustLevel}
                      </Badge>
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
