import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface SourceIdentityMetrics {
  domain: string;
  status: string;
  identity_score: number;
  url_security: number;
  certificate: number;
  ownership: number;
  updated_at: string;
}

export default function SourceIdentityMetrics() {
  const [editingValues, setEditingValues] = useState<Record<string, SourceIdentityMetrics>>({});

  const { data: identityMetrics = [], isLoading } = useQuery<SourceIdentityMetrics[]>({
    queryKey: ["/api/source-identity-metrics"],
  });

  const updateMetricsMutation = useMutation({
    mutationFn: async ({ domain, updates }: { domain: string; updates: Partial<SourceIdentityMetrics> }) => {
      return apiRequest("PATCH", `/api/source-identity-metrics/${domain}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/source-identity-metrics"] });
    },
  });

  const handleValueChange = (domain: string, field: keyof Pick<SourceIdentityMetrics, 'url_security' | 'certificate' | 'ownership'>, value: string) => {
    const numValue = parseInt(value) || 0;
    const clampedValue = Math.min(Math.max(numValue, 0), 100);
    
    const currentMetric = identityMetrics.find(m => m.domain === domain);
    if (!currentMetric) return;

    const updatedMetric = {
      ...currentMetric,
      ...(editingValues[domain] || {}),
      [field]: clampedValue,
    };

    setEditingValues(prev => ({
      ...prev,
      [domain]: updatedMetric,
    }));

    updateMetricsMutation.mutate({
      domain,
      updates: { [field]: clampedValue },
    });
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "outline";
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "trusted":
        return "default";
      case "evaluating":
        return "secondary";
      case "pending_review":
        return "outline";
      default:
        return "outline";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const metricsWithCalculatedScore = identityMetrics.map(metric => {
    const editedMetric = editingValues[metric.domain] || metric;
    const calculatedScore = Math.round(
      (editedMetric.url_security + editedMetric.certificate + editedMetric.ownership) / 3
    );
    
    return {
      ...editedMetric,
      identity_score: calculatedScore,
    };
  }).sort((a, b) => b.identity_score - a.identity_score);

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">Source Identity Metrics</h1>
            <p className="text-sm text-muted-foreground">
              Manage URL security, certificate, and ownership scores for each source
            </p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              <CardTitle>Identity Score Breakdown</CardTitle>
            </div>
            <CardDescription>
              Each source's identity score is calculated as the average of URL security, certificate, and ownership scores
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <p className="text-muted-foreground">Loading identity metrics...</p>
              </div>
            ) : metricsWithCalculatedScore.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No identity metrics found</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Identity metrics will appear here once sources are added
                </p>
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Identity Score</TableHead>
                      <TableHead className="text-center">URL Security</TableHead>
                      <TableHead className="text-center">Certificate</TableHead>
                      <TableHead className="text-center">Ownership</TableHead>
                      <TableHead>Last Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metricsWithCalculatedScore.map((metric) => (
                      <TableRow key={metric.domain}>
                        <TableCell className="font-medium" data-testid={`text-domain-${metric.domain}`}>
                          {metric.domain}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(metric.status)} data-testid={`badge-status-${metric.domain}`}>
                            {metric.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={getScoreBadgeVariant(metric.identity_score)} data-testid={`badge-identity-${metric.domain}`}>
                            {metric.identity_score}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={metric.url_security}
                            onChange={(e) => handleValueChange(metric.domain, 'url_security', e.target.value)}
                            className="w-20 text-center"
                            data-testid={`input-url-security-${metric.domain}`}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={metric.certificate}
                            onChange={(e) => handleValueChange(metric.domain, 'certificate', e.target.value)}
                            className="w-20 text-center"
                            data-testid={`input-certificate-${metric.domain}`}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={metric.ownership}
                            onChange={(e) => handleValueChange(metric.domain, 'ownership', e.target.value)}
                            className="w-20 text-center"
                            data-testid={`input-ownership-${metric.domain}`}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground" data-testid={`text-updated-${metric.domain}`}>
                          {formatDate(metric.updated_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <h3 className="text-sm font-medium mb-2">Identity Score Components</h3>
          <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
            <li><strong>URL Security</strong> - HTTPS protocol, valid SSL, secure domain configuration</li>
            <li><strong>Certificate</strong> - SSL/TLS certificate validity, trust chain, expiration status</li>
            <li><strong>Ownership</strong> - Domain registration verification, WHOIS data, organizational proof</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-3">
            The overall identity score is automatically calculated as the average of these three components.
          </p>
        </div>
      </div>
    </div>
  );
}
