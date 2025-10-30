import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, CheckCircle, XCircle, ArrowLeft, Filter } from "lucide-react";
import { Link } from "wouter";
import type { PromotionGateLog } from "@shared/schema";

interface CriteriaMet {
  min_sources: boolean;
  min_score: boolean;
  max_age_days: boolean;
  require_assay: boolean;
  min_consensus_agreement: boolean;
}

export default function GateLog() {
  const [tierFilter, setTierFilter] = useState<string | undefined>(undefined);
  const [decisionFilter, setDecisionFilter] = useState<string | undefined>(undefined);

  const { data: logs = [], isLoading } = useQuery<PromotionGateLog[]>({
    queryKey: ["/api/admin/promotion-gate-logs", tierFilter, decisionFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tierFilter) params.append('tier', tierFilter);
      if (decisionFilter) params.append('decision', decisionFilter);
      
      const url = `/api/admin/promotion-gate-logs${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch gate logs: ${response.statusText}`);
      }
      
      return response.json();
    },
  });

  const parseCriteriaMet = (criteriaJson: string): CriteriaMet => {
    try {
      return JSON.parse(criteriaJson);
    } catch {
      return {
        min_sources: false,
        min_score: false,
        max_age_days: false,
        require_assay: false,
        min_consensus_agreement: false,
      };
    }
  };

  const getRiskTierColor = (tier: string) => {
    switch (tier) {
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm" data-testid="button-back" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Promotion Gate Log</h1>
        </div>
        <p className="text-muted-foreground">
          View all fact promotion gate decisions showing which facts passed or failed policy criteria
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Select value={tierFilter} onValueChange={(value) => setTierFilter(value === 'all' ? undefined : value)}>
                <SelectTrigger data-testid="select-tier-filter">
                  <SelectValue placeholder="All Risk Tiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select value={decisionFilter} onValueChange={(value) => setDecisionFilter(value === 'all' ? undefined : value)}>
                <SelectTrigger data-testid="select-decision-filter">
                  <SelectValue placeholder="All Decisions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Decisions</SelectItem>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Loading gate logs...</p>
          </CardContent>
        </Card>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No gate logs found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {logs.map((log) => {
            const criteria = parseCriteriaMet(log.criteria_met);
            const isPassed = log.decision === 'pass';
            
            return (
              <Card key={log.id} data-testid={`gate-log-${log.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {isPassed ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                        {log.entity} - {log.attribute}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Evaluation ID: {log.evaluation_id} • {new Date(log.created_at).toLocaleString()}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge className={getRiskTierColor(log.risk_tier)} data-testid={`badge-tier-${log.id}`}>
                        {log.risk_tier} risk
                      </Badge>
                      <Badge variant={isPassed ? "default" : "destructive"} data-testid={`badge-decision-${log.id}`}>
                        {log.decision}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Reason:</h4>
                      <p className="text-sm text-muted-foreground">{log.reason}</p>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">Metrics:</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Sources:</span>
                          <span className="ml-2 font-mono">{log.source_count}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Score:</span>
                          <span className="ml-2 font-mono">{log.evaluation_score}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Age:</span>
                          <span className="ml-2 font-mono">{log.age_days}d</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Assay:</span>
                          <span className="ml-2 font-mono">{log.has_assay ? 'Yes' : 'No'}</span>
                        </div>
                        {log.consensus_agreement !== null && (
                          <div>
                            <span className="text-muted-foreground">Consensus:</span>
                            <span className="ml-2 font-mono">{(log.consensus_agreement * 100).toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">Criteria Checks:</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        {Object.entries(criteria).map(([key, met]) => (
                          <div key={key} className="flex items-center gap-2">
                            {met ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <span className={met ? 'text-foreground' : 'text-muted-foreground'}>
                              {key.replace(/_/g, ' ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
