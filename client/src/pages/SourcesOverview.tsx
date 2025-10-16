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

interface SourceStats {
  domain: string;
  factCount: number;
  trustLevel: string;
}

export default function SourcesOverview() {
  const [sources, setSources] = useState<SourceStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSources() {
      try {
        const response = await fetch("/api/facts");
        const facts: FactRecord[] = await response.json();

        const sourcesMap = new Map<string, { count: number; trustLevel: string }>();

        facts.forEach((fact) => {
          try {
            const url = new URL(fact.source_url);
            const domain = url.hostname.replace(/^www\./, "");
            
            if (!sourcesMap.has(domain)) {
              sourcesMap.set(domain, { count: 0, trustLevel: fact.source_trust });
            }
            
            const current = sourcesMap.get(domain)!;
            current.count++;
          } catch (error) {
            console.error("Invalid URL:", fact.source_url);
          }
        });

        const sourcesList: SourceStats[] = Array.from(sourcesMap.entries())
          .map(([domain, data]) => ({
            domain,
            factCount: data.count,
            trustLevel: data.trustLevel,
          }))
          .sort((a, b) => b.factCount - a.factCount);

        setSources(sourcesList);
      } catch (error) {
        console.error("Error loading sources:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSources();
  }, []);

  const getTrustBadgeVariant = (trustLevel: string) => {
    switch (trustLevel) {
      case "high":
        return "default";
      case "medium":
        return "secondary";
      case "low":
        return "outline";
      default:
        return "outline";
    }
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
              Overview of sources used in the fact database and their assigned trust levels.
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
                  <TableHead data-testid="header-facts">Facts Count</TableHead>
                  <TableHead data-testid="header-trust">Trust Level</TableHead>
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
                      <Badge variant={getTrustBadgeVariant(source.trustLevel)} data-testid={`badge-trust-${source.domain}`}>
                        {source.trustLevel}
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
