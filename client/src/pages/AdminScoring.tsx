import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Settings, Save, RotateCcw, ExternalLink, ArrowLeft, RefreshCw, Database, Shield, FileText, Calculator } from "lucide-react";
import { Link } from "wouter";
import type { ScoringSettings } from "@shared/schema";

interface CrossCheckStats {
  totalPairs: number;
  wikipediaAdded: number;
  worldBankAdded: number;
  wikidataAdded: number;
  duplicatesSkipped: number;
  errors: string[];
}

interface FulfillRequestedFactsStats {
  fulfilledCount: number;
  notFoundCount: number;
  alreadyExistsCount: number;
  totalRequests: number;
}

interface PullNewFactsStats {
  requested: number;
  found: number;
  duplicates: number;
  inserted: number;
  errors: string[];
}

interface PullHistoricalEventsStats {
  requested: number;
  eventsInserted: number;
  factsCreated: number;
  duplicates: number;
  errors: number;
}

interface SyncFactsCountStats {
  synced: number;
  sources: {
    domain: string;
    oldCount: number;
    newCount: number;
  }[];
}

interface RecalculateUrlReputeStats {
  updated: number;
  sources: {
    domain: string;
    oldScore: number;
    newScore: number;
    tld: string;
  }[];
}

interface RecalculateCertificatesStats {
  updated: number;
  sources: {
    domain: string;
    oldScore: number;
    newScore: number;
    status: string;
  }[];
}

interface RecalculateOwnershipStats {
  updated: number;
  sources: {
    domain: string;
    oldScore: number;
    newScore: number;
    status: string;
    registrar?: string;
    organization?: string;
    domainAge?: number;
  }[];
}

interface SyncIdentityScoreStats {
  synced: number;
  sources: {
    domain: string;
    oldScore: number;
    newScore: number;
  }[];
}

interface TldScore {
  tld: string;
  score: number;
}

export default function AdminScoring() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<ScoringSettings | null>({
    queryKey: ["/api/scoring-settings"],
  });

  const { data: tldScores = [], isLoading: tldScoresLoading } = useQuery<TldScore[]>({
    queryKey: ["/api/tld-scores"],
  });

  const [formData, setFormData] = useState({
    source_trust_weight: 1,
    recency_weight: 1,
    consensus_weight: 1,
    recency_tier1_days: 7,
    recency_tier1_score: 100,
    recency_tier2_days: 30,
    recency_tier2_score: 50,
    recency_tier3_score: 10,
    credible_threshold: 80,
    promotion_threshold: 80,
  });

  const [crossCheckResults, setCrossCheckResults] = useState<CrossCheckStats | null>(null);
  const [fulfillResults, setFulfillResults] = useState<FulfillRequestedFactsStats | null>(null);
  const [promotionResults, setPromotionResults] = useState<{ promotedCount: number; skippedCount: number; } | null>(null);
  const [pullNewFactsResults, setPullNewFactsResults] = useState<PullNewFactsStats | null>(null);
  const [syncFactsCountResults, setSyncFactsCountResults] = useState<SyncFactsCountStats | null>(null);
  const [recalculateUrlReputeResults, setRecalculateUrlReputeResults] = useState<RecalculateUrlReputeStats | null>(null);
  const [recalculateCertificatesResults, setRecalculateCertificatesResults] = useState<RecalculateCertificatesStats | null>(null);
  const [recalculateOwnershipResults, setRecalculateOwnershipResults] = useState<RecalculateOwnershipStats | null>(null);
  const [syncIdentityScoresResults, setSyncIdentityScoresResults] = useState<SyncIdentityScoreStats | null>(null);
  
  const [quickAddDomain, setQuickAddDomain] = useState<string>("");
  const [quickAddLegitimacy, setQuickAddLegitimacy] = useState<number>(70);
  const [quickAddTrust, setQuickAddTrust] = useState<number>(70);
  const [quickAddResults, setQuickAddResults] = useState<any | null>(null);
  
  const [pullEntities, setPullEntities] = useState<string>("Canada,Mexico");
  const [pullAttributes, setPullAttributes] = useState<string[]>(["population"]);
  const [pullYearStart, setPullYearStart] = useState<string>("2023");
  const [pullYearEnd, setPullYearEnd] = useState<string>("2024");

  const [pullEventsCountries, setPullEventsCountries] = useState<string>("France,United States,Germany");
  const [pullHistoricalEventsResults, setPullHistoricalEventsResults] = useState<PullHistoricalEventsStats | null>(null);
  
  const [backfillHistoricalFactsResults, setBackfillHistoricalFactsResults] = useState<{
    processed: number;
    created: number;
    skipped: number;
    results: { entity: string; event_type: string; attribute: string; year: number; created: boolean; }[];
  } | null>(null);

  const [newTld, setNewTld] = useState<string>("");
  const [newTldScore, setNewTldScore] = useState<number>(0);
  const [editingTld, setEditingTld] = useState<Record<string, number>>({});

  useEffect(() => {
    if (settings) {
      setFormData({
        source_trust_weight: settings.source_trust_weight,
        recency_weight: settings.recency_weight,
        consensus_weight: settings.consensus_weight,
        recency_tier1_days: settings.recency_tier1_days,
        recency_tier1_score: settings.recency_tier1_score,
        recency_tier2_days: settings.recency_tier2_days,
        recency_tier2_score: settings.recency_tier2_score,
        recency_tier3_score: settings.recency_tier3_score,
        credible_threshold: settings.credible_threshold,
        promotion_threshold: settings.promotion_threshold,
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("PUT", "/api/scoring-settings", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scoring-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facts-evaluation"] });
      toast({
        title: "Settings saved",
        description: "Scoring settings have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update scoring settings.",
        variant: "destructive",
      });
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/facts-evaluation/recalculate");
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/facts-evaluation"] });
      toast({
        title: "Scores recalculated",
        description: `Updated ${data.updatedCount} evaluation records with new scoring settings.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to recalculate scores.",
        variant: "destructive",
      });
    },
  });

  const crossCheckMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/cross-check-sources");
      return await response.json();
    },
    onSuccess: (data: any) => {
      setCrossCheckResults(data.stats);
      queryClient.invalidateQueries({ queryKey: ["/api/facts-evaluation"] });
      const totalAdded = data.stats.wikipediaAdded + data.stats.worldBankAdded + data.stats.wikidataAdded;
      toast({
        title: "Cross-check complete",
        description: `Added ${totalAdded} new facts across all sources.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to cross-check sources.",
        variant: "destructive",
      });
    },
  });

  const fulfillRequestedFactsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/fulfill-requested-facts");
      return await response.json();
    },
    onSuccess: (data: any) => {
      setFulfillResults(data.stats);
      queryClient.invalidateQueries({ queryKey: ["/api/facts-evaluation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/requested-facts"] });
      toast({
        title: "Fulfill complete",
        description: `Fulfilled ${data.stats.fulfilledCount} of ${data.stats.totalRequests} requested facts.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to fulfill requested facts.",
        variant: "destructive",
      });
    },
  });

  const promoteFactsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/promote-facts");
      return await response.json();
    },
    onSuccess: (data: any) => {
      setPromotionResults({ promotedCount: data.promotedCount, skippedCount: data.skippedCount });
      queryClient.invalidateQueries({ queryKey: ["/api/verified-facts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facts-activity-log"] });
      toast({
        title: "Promotion complete",
        description: `Promoted ${data.promotedCount} facts to verified gold standard.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to promote facts.",
        variant: "destructive",
      });
    },
  });

  const pullNewFactsMutation = useMutation({
    mutationFn: async () => {
      const entities = pullEntities.split(',').map(e => e.trim()).filter(e => e.length > 0);
      const yearStart = parseInt(pullYearStart);
      const yearEnd = parseInt(pullYearEnd);
      const years: number[] = [];
      for (let year = yearStart; year <= yearEnd; year++) {
        years.push(year);
      }
      
      const response = await apiRequest("POST", "/api/admin/pull-new-facts", {
        entities,
        attributes: pullAttributes,
        years
      });
      return await response.json();
    },
    onSuccess: (data: any) => {
      setPullNewFactsResults(data.stats);
      queryClient.invalidateQueries({ queryKey: ["/api/facts-evaluation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facts-activity-log"] });
      toast({
        title: "Pull complete",
        description: `Found ${data.stats.found} facts, inserted ${data.stats.inserted} new records.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to pull new facts.",
        variant: "destructive",
      });
    },
  });

  const backfillHistoricalFactsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/backfill-historical-facts", {});
      return await response.json();
    },
    onSuccess: (data: any) => {
      setBackfillHistoricalFactsResults(data);
      toast({
        title: "Success",
        description: `Created ${data.created} fact evaluations from ${data.processed} historical events.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/facts-evaluation"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to backfill historical facts.",
        variant: "destructive",
      });
    },
  });

  const pullHistoricalEventsMutation = useMutation({
    mutationFn: async () => {
      const countries = pullEventsCountries.split(',').map(c => c.trim()).filter(c => c.length > 0);
      
      const response = await apiRequest("POST", "/api/admin/pull-historical-events", {
        countries
      });
      return await response.json();
    },
    onSuccess: (data: any) => {
      setPullHistoricalEventsResults(data.stats);
      queryClient.invalidateQueries({ queryKey: ["/api/historical-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facts-evaluation"] });
      toast({
        title: "Events pulled",
        description: `Inserted ${data.stats.eventsInserted} events and created ${data.stats.factsCreated} fact evaluations.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to pull historical events.",
        variant: "destructive",
      });
    },
  });

  const syncFactsCountMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/sync-facts-count");
      return await response.json();
    },
    onSuccess: (data: any) => {
      setSyncFactsCountResults(data);
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
      toast({
        title: "Sync complete",
        description: `Updated facts_count for ${data.synced} source(s).`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to sync facts count.",
        variant: "destructive",
      });
    },
  });

  const recalculateUrlReputeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/recalculate-url-repute");
      return await response.json();
    },
    onSuccess: (data: any) => {
      setRecalculateUrlReputeResults(data);
      queryClient.invalidateQueries({ queryKey: ["/api/source-identity-metrics"] });
      toast({
        title: "Recalculation complete",
        description: `Updated url_repute for ${data.updated} source(s).`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to recalculate url repute.",
        variant: "destructive",
      });
    },
  });

  const recalculateCertificatesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/recalculate-certificates");
      return await response.json();
    },
    onSuccess: (data: any) => {
      setRecalculateCertificatesResults(data);
      queryClient.invalidateQueries({ queryKey: ["/api/source-identity-metrics"] });
      toast({
        title: "Recalculation complete",
        description: `Updated certificates for ${data.updated} source(s).`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to recalculate certificates.",
        variant: "destructive",
      });
    },
  });

  const recalculateOwnershipMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/recalculate-ownership");
      return await response.json();
    },
    onSuccess: (data: any) => {
      setRecalculateOwnershipResults(data);
      queryClient.invalidateQueries({ queryKey: ["/api/source-identity-metrics"] });
      toast({
        title: "Recalculation complete",
        description: `Updated ownership for ${data.updated} source(s).`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to recalculate ownership.",
        variant: "destructive",
      });
    },
  });

  const syncIdentityScoresMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/sync-identity-scores");
      return await response.json();
    },
    onSuccess: (data: any) => {
      setSyncIdentityScoresResults(data);
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
      toast({
        title: "Sync complete",
        description: `Updated identity_score for ${data.synced} source(s).`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to sync identity scores.",
        variant: "destructive",
      });
    },
  });

  const createTldMutation = useMutation({
    mutationFn: async (data: { tld: string; score: number }) => {
      const response = await apiRequest("POST", "/api/tld-scores", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tld-scores"] });
      setNewTld("");
      setNewTldScore(0);
      toast({
        title: "TLD added",
        description: "New TLD score has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create TLD score.",
        variant: "destructive",
      });
    },
  });

  const updateTldMutation = useMutation({
    mutationFn: async ({ tld, score }: { tld: string; score: number }) => {
      const response = await apiRequest("PUT", `/api/tld-scores/${tld}`, { score });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tld-scores"] });
      setEditingTld({});
      toast({
        title: "TLD updated",
        description: "TLD score has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update TLD score.",
        variant: "destructive",
      });
    },
  });

  const deleteTldMutation = useMutation({
    mutationFn: async (tld: string) => {
      await apiRequest("DELETE", `/api/tld-scores/${tld}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tld-scores"] });
      toast({
        title: "TLD deleted",
        description: "TLD score has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete TLD score.",
        variant: "destructive",
      });
    },
  });

  const quickAddTrustedSourceMutation = useMutation({
    mutationFn: async (data: { domain: string; legitimacy?: number; trust?: number }) => {
      const response = await apiRequest("POST", "/api/admin/add-trusted-source", data);
      return await response.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        setQuickAddResults(data);
        queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
        queryClient.invalidateQueries({ queryKey: ["/api/source-identity-metrics"] });
        setQuickAddDomain("");
        toast({
          title: "Source added successfully",
          description: `${data.source?.domain} has been added, promoted to trusted, and scored across all metrics.`,
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to add trusted source.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add trusted source.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleReset = () => {
    if (settings) {
      setFormData({
        source_trust_weight: settings.source_trust_weight,
        recency_weight: settings.recency_weight,
        consensus_weight: settings.consensus_weight,
        recency_tier1_days: settings.recency_tier1_days,
        recency_tier1_score: settings.recency_tier1_score,
        recency_tier2_days: settings.recency_tier2_days,
        recency_tier2_score: settings.recency_tier2_score,
        recency_tier3_score: settings.recency_tier3_score,
        credible_threshold: settings.credible_threshold,
        promotion_threshold: settings.promotion_threshold,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-6 w-6" />
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>
        <p>Loading settings...</p>
      </div>
    );
  }

  const totalWeight = formData.source_trust_weight + formData.recency_weight + formData.consensus_weight;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6" />
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>
        <Link href="/">
          <Button variant="outline" data-testid="button-back-home">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="source-management" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="source-management" className="gap-2" data-testid="tab-source-management">
            <Shield className="h-4 w-4" />
            Source Management
          </TabsTrigger>
          <TabsTrigger value="data-management" className="gap-2" data-testid="tab-data-management">
            <Database className="h-4 w-4" />
            Data Management
          </TabsTrigger>
          <TabsTrigger value="fact-evaluation" className="gap-2" data-testid="tab-fact-evaluation">
            <Calculator className="h-4 w-4" />
            Fact Evaluation
          </TabsTrigger>
        </TabsList>

        {/* SOURCE MANAGEMENT TAB */}
        <TabsContent value="source-management" className="space-y-6">
          {/* Quick Add Trusted Source */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Add Trusted Source</CardTitle>
              <CardDescription>
                Add a new source, promote to trusted, and score across all identity metrics in one step
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-3 sm:col-span-1">
                  <Label htmlFor="quick-add-domain">Domain</Label>
                  <Input
                    id="quick-add-domain"
                    value={quickAddDomain}
                    onChange={(e) => {
                      let value = e.target.value.trim();
                      value = value.replace(/^https?:\/\//i, '');
                      value = value.split('/')[0].split('?')[0].split('#')[0];
                      value = value.toLowerCase();
                      setQuickAddDomain(value);
                    }}
                    placeholder="example.gov"
                    data-testid="input-quick-add-domain"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Format: example.gov (no https:// or paths)
                  </p>
                </div>
                <div>
                  <Label htmlFor="quick-add-legitimacy">Legitimacy (0-100)</Label>
                  <Input
                    id="quick-add-legitimacy"
                    type="number"
                    min="0"
                    max="100"
                    value={quickAddLegitimacy}
                    onChange={(e) => setQuickAddLegitimacy(parseInt(e.target.value) || 70)}
                    data-testid="input-quick-add-legitimacy"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="quick-add-trust">Trust/Quality (0-100)</Label>
                  <Input
                    id="quick-add-trust"
                    type="number"
                    min="0"
                    max="100"
                    value={quickAddTrust}
                    onChange={(e) => setQuickAddTrust(parseInt(e.target.value) || 70)}
                    data-testid="input-quick-add-trust"
                    className="mt-1"
                  />
                </div>
              </div>
              <Button
                onClick={() => {
                  if (!quickAddDomain.trim()) {
                    toast({
                      title: "Domain required",
                      description: "Please enter a domain to add.",
                      variant: "destructive",
                    });
                    return;
                  }
                  quickAddTrustedSourceMutation.mutate({
                    domain: quickAddDomain.trim(),
                    legitimacy: quickAddLegitimacy,
                    trust: quickAddTrust,
                  });
                }}
                disabled={!quickAddDomain.trim() || quickAddTrustedSourceMutation.isPending}
                data-testid="button-quick-add-source"
                className="w-full"
              >
                {quickAddTrustedSourceMutation.isPending ? "Processing..." : "Add & Score Source"}
              </Button>

              {quickAddResults && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Database className="h-4 w-4" />
                    Results for {quickAddResults.source?.domain}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-muted-foreground">URL Repute</div>
                      <div className="font-mono font-medium" data-testid="text-quick-add-url-repute">
                        {quickAddResults.metrics?.url_repute}
                      </div>
                      <div className="text-xs text-muted-foreground">{quickAddResults.urlReputeStatus}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Certificate</div>
                      <div className="font-mono font-medium" data-testid="text-quick-add-certificate">
                        {quickAddResults.metrics?.certificate}
                      </div>
                      <div className="text-xs text-muted-foreground">{quickAddResults.certificateStatus}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Ownership</div>
                      <div className="font-mono font-medium" data-testid="text-quick-add-ownership">
                        {quickAddResults.metrics?.ownership}
                      </div>
                      <div className="text-xs text-muted-foreground">{quickAddResults.ownershipStatus}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Identity Score</div>
                      <div className="font-mono font-medium text-lg" data-testid="text-quick-add-identity-score">
                        {quickAddResults.metrics?.identity_score}
                      </div>
                      <div className="text-xs text-muted-foreground">Final averaged score</div>
                    </div>
                  </div>
                  {quickAddResults.metrics?.ownership_registrar && (
                    <div className="pt-2 border-t text-xs">
                      <div className="text-muted-foreground">WHOIS Details:</div>
                      <div className="mt-1 space-y-0.5">
                        {quickAddResults.metrics.ownership_registrar && (
                          <div>Registrar: {quickAddResults.metrics.ownership_registrar}</div>
                        )}
                        {quickAddResults.metrics.ownership_organization && (
                          <div>Organization: {quickAddResults.metrics.ownership_organization}</div>
                        )}
                        {quickAddResults.metrics.ownership_domain_age && (
                          <div>Domain Age: {quickAddResults.metrics.ownership_domain_age.toFixed(1)} years</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* TLD Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>TLD Reputation Configuration</CardTitle>
              <CardDescription>
                Configure reputation scores for top-level domains (TLDs) to automatically score sources
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="new-tld">TLD (e.g., .gov, .org)</Label>
                  <Input
                    id="new-tld"
                    value={newTld}
                    onChange={(e) => setNewTld(e.target.value.toLowerCase())}
                    placeholder=".gov"
                    data-testid="input-new-tld"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="new-tld-score">Score (0-100)</Label>
                  <Input
                    id="new-tld-score"
                    type="number"
                    min="0"
                    max="100"
                    value={newTldScore}
                    onChange={(e) => setNewTldScore(parseInt(e.target.value) || 0)}
                    data-testid="input-new-tld-score"
                    className="mt-1"
                  />
                </div>
              </div>
              <Button
                onClick={() => {
                  const trimmedTld = newTld.trim();
                  if (!trimmedTld.startsWith('.')) {
                    toast({
                      title: "Invalid TLD",
                      description: "TLD must start with a dot (e.g., .gov, .org)",
                      variant: "destructive",
                    });
                    return;
                  }
                  const clampedScore = Math.min(Math.max(newTldScore, 0), 100);
                  createTldMutation.mutate({ tld: trimmedTld, score: clampedScore });
                }}
                disabled={!newTld.trim() || createTldMutation.isPending}
                data-testid="button-add-tld"
                className="w-full"
              >
                Add TLD
              </Button>

              {!tldScoresLoading && tldScores.length > 0 && (
                <div className="border rounded-lg p-4 space-y-2">
                  <h4 className="font-semibold text-sm mb-3">Configured TLD Scores</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {tldScores.map((tld) => (
                      <div key={tld.tld} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="font-mono text-sm min-w-[100px]">{tld.tld}</span>
                          {editingTld[tld.tld] !== undefined ? (
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={editingTld[tld.tld]}
                              onChange={(e) => setEditingTld({ ...editingTld, [tld.tld]: parseInt(e.target.value) || 0 })}
                              className="w-24 h-8"
                              data-testid={`input-edit-tld-${tld.tld}`}
                            />
                          ) : (
                            <span className="font-medium text-sm">{tld.score}</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {editingTld[tld.tld] !== undefined ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => {
                                  const score = Math.min(Math.max(editingTld[tld.tld], 0), 100);
                                  updateTldMutation.mutate({ tld: tld.tld, score });
                                }}
                                disabled={updateTldMutation.isPending}
                                data-testid={`button-save-tld-${tld.tld}`}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const newEditing = { ...editingTld };
                                  delete newEditing[tld.tld];
                                  setEditingTld(newEditing);
                                }}
                                data-testid={`button-cancel-tld-${tld.tld}`}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingTld({ ...editingTld, [tld.tld]: tld.score })}
                                data-testid={`button-edit-tld-${tld.tld}`}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (confirm(`Delete TLD ${tld.tld}?`)) {
                                    deleteTldMutation.mutate(tld.tld);
                                  }
                                }}
                                disabled={deleteTldMutation.isPending}
                                data-testid={`button-delete-tld-${tld.tld}`}
                              >
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Identity Metrics Operations */}
          <Card>
            <CardHeader>
              <CardTitle>Identity Metrics Operations</CardTitle>
              <CardDescription>
                Recalculate identity metrics for all sources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Button
                    onClick={() => recalculateUrlReputeMutation.mutate()}
                    disabled={recalculateUrlReputeMutation.isPending}
                    data-testid="button-recalculate-url-repute"
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {recalculateUrlReputeMutation.isPending ? "Recalculating..." : "Recalculate URL Reputation"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Updates url_repute scores for all sources based on configured TLD scores.
                  </p>
                  {recalculateUrlReputeResults && (
                    <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                      <h4 className="font-semibold text-xs">Recalculation Results</h4>
                      <div className="text-xs space-y-1">
                        <div>
                          <span className="text-muted-foreground">Sources Updated:</span>
                          <span className="ml-2 font-medium" data-testid="text-recalculated-count">
                            {recalculateUrlReputeResults.updated}
                          </span>
                        </div>
                        {recalculateUrlReputeResults.sources.length > 0 && (
                          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                            {recalculateUrlReputeResults.sources.map((source) => (
                              <div key={source.domain} className="text-xs">
                                <span className="font-mono">{source.domain}</span>
                                <span className="ml-1 text-muted-foreground">({source.tld})</span>:
                                <span className="ml-1 text-muted-foreground">{source.oldScore}</span>
                                <span className="mx-1">→</span>
                                <span className="font-medium">{source.newScore}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={() => recalculateCertificatesMutation.mutate()}
                    disabled={recalculateCertificatesMutation.isPending}
                    data-testid="button-recalculate-certificates"
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {recalculateCertificatesMutation.isPending ? "Checking..." : "Recalculate Certificates"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Checks SSL/TLS certificate validity for all sources and updates certificate scores.
                  </p>
                  {recalculateCertificatesResults && (
                    <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                      <h4 className="font-semibold text-xs">Certificate Check Results</h4>
                      <div className="text-xs space-y-1">
                        <div>
                          <span className="text-muted-foreground">Sources Updated:</span>
                          <span className="ml-2 font-medium" data-testid="text-certificates-updated-count">
                            {recalculateCertificatesResults.updated}
                          </span>
                        </div>
                        {recalculateCertificatesResults.sources.length > 0 && (
                          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                            {recalculateCertificatesResults.sources.map((source) => (
                              <div key={source.domain} className="text-xs">
                                <span className="font-mono">{source.domain}</span>
                                <span className="ml-1 text-muted-foreground">({source.status})</span>:
                                <span className="ml-1 text-muted-foreground">{source.oldScore}</span>
                                <span className="mx-1">→</span>
                                <span className="font-medium">{source.newScore}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={() => recalculateOwnershipMutation.mutate()}
                    disabled={recalculateOwnershipMutation.isPending}
                    data-testid="button-recalculate-ownership"
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {recalculateOwnershipMutation.isPending ? "Checking..." : "Recalculate Ownership"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Performs WHOIS lookups for all sources and updates ownership scores based on registrar trust and domain age.
                  </p>
                  {recalculateOwnershipResults && (
                    <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                      <h4 className="font-semibold text-xs">Ownership Check Results</h4>
                      <div className="text-xs space-y-1">
                        <div>
                          <span className="text-muted-foreground">Sources Updated:</span>
                          <span className="ml-2 font-medium" data-testid="text-ownership-updated-count">
                            {recalculateOwnershipResults.updated}
                          </span>
                        </div>
                        {recalculateOwnershipResults.sources.length > 0 && (
                          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                            {recalculateOwnershipResults.sources.map((source) => (
                              <div key={source.domain} className="text-xs space-y-0.5">
                                <div>
                                  <span className="font-mono">{source.domain}</span>
                                  <span className="ml-1 text-muted-foreground">({source.status})</span>:
                                  <span className="ml-1 text-muted-foreground">{source.oldScore}</span>
                                  <span className="mx-1">→</span>
                                  <span className="font-medium">{source.newScore}</span>
                                </div>
                                {source.registrar && (
                                  <div className="text-muted-foreground pl-4">
                                    Registrar: {source.registrar}
                                  </div>
                                )}
                                {source.organization && (
                                  <div className="text-muted-foreground pl-4">
                                    Organization: {source.organization}
                                  </div>
                                )}
                                {source.domainAge !== undefined && (
                                  <div className="text-muted-foreground pl-4">
                                    Domain Age: {source.domainAge.toFixed(1)} years
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={() => syncIdentityScoresMutation.mutate()}
                    disabled={syncIdentityScoresMutation.isPending}
                    data-testid="button-sync-identity-scores"
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {syncIdentityScoresMutation.isPending ? "Syncing..." : "Sync Identity Scores"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Syncs identity_score from source_identity_metrics to sources table.
                  </p>
                  {syncIdentityScoresResults && (
                    <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                      <h4 className="font-semibold text-xs">Sync Results</h4>
                      <div className="text-xs space-y-1">
                        <div>
                          <span className="text-muted-foreground">Sources Updated:</span>
                          <span className="ml-2 font-medium" data-testid="text-identity-synced-count">
                            {syncIdentityScoresResults.synced}
                          </span>
                        </div>
                        {syncIdentityScoresResults.sources.length > 0 && (
                          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                            {syncIdentityScoresResults.sources.map((source) => (
                              <div key={source.domain} className="text-xs">
                                <span className="font-mono">{source.domain}</span>:
                                <span className="ml-1 text-muted-foreground">{source.oldScore}</span>
                                <span className="mx-1">→</span>
                                <span className="font-medium">{source.newScore}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Source Reliability Management Link */}
          <Card>
            <CardHeader>
              <CardTitle>Source Reliability Management</CardTitle>
              <CardDescription>
                Manage source reliability metrics that affect source trust scores
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/sources">
                <Button variant="outline" className="w-full" data-testid="button-manage-sources">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Manage Source Reliability Metrics
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DATA MANAGEMENT TAB */}
        <TabsContent value="data-management" className="space-y-6">
          {/* Pull New Facts */}
          <Card>
            <CardHeader>
              <CardTitle>Pull New Facts</CardTitle>
              <CardDescription>
                Fetch specific data from World Bank, Wikidata, and IMF APIs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="pull-entities">Countries (comma-separated)</Label>
                <Input
                  id="pull-entities"
                  value={pullEntities}
                  onChange={(e) => setPullEntities(e.target.value)}
                  placeholder="Canada,Mexico,United States"
                  data-testid="input-pull-entities"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Attributes</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {['population', 'gdp', 'gdp_per_capita', 'inflation', 'inflation_rate', 'unemployment_rate'].map((attr) => (
                    <label key={attr} className="flex items-center space-x-2 text-sm">
                      <input
                        type="checkbox"
                        checked={pullAttributes.includes(attr)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPullAttributes([...pullAttributes, attr]);
                          } else {
                            setPullAttributes(pullAttributes.filter(a => a !== attr));
                          }
                        }}
                        data-testid={`checkbox-pull-${attr}`}
                      />
                      <span>{attr.replace(/_/g, ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="pull-year-start">Year Start</Label>
                  <Input
                    id="pull-year-start"
                    type="number"
                    value={pullYearStart}
                    onChange={(e) => setPullYearStart(e.target.value)}
                    data-testid="input-pull-year-start"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="pull-year-end">Year End</Label>
                  <Input
                    id="pull-year-end"
                    type="number"
                    value={pullYearEnd}
                    onChange={(e) => setPullYearEnd(e.target.value)}
                    data-testid="input-pull-year-end"
                    className="mt-1"
                  />
                </div>
              </div>
              <Button
                onClick={() => pullNewFactsMutation.mutate()}
                disabled={pullNewFactsMutation.isPending || pullAttributes.length === 0}
                data-testid="button-pull-new-facts"
                className="w-full"
              >
                <Database className="h-4 w-4 mr-2" />
                {pullNewFactsMutation.isPending ? "Pulling..." : "Pull New Facts"}
              </Button>

              {pullNewFactsResults && (
                <div className="border rounded-lg p-4 bg-muted/50 space-y-2">
                  <h4 className="font-semibold text-sm">Pull New Facts Results</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Requested:</span>
                      <span className="ml-2 font-medium" data-testid="text-pull-requested">
                        {pullNewFactsResults.requested}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Found:</span>
                      <span className="ml-2 font-medium" data-testid="text-pull-found">
                        {pullNewFactsResults.found}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Duplicates:</span>
                      <span className="ml-2 font-medium" data-testid="text-pull-duplicates">
                        {pullNewFactsResults.duplicates}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Inserted:</span>
                      <span className="ml-2 font-medium" data-testid="text-pull-inserted">
                        {pullNewFactsResults.inserted}
                      </span>
                    </div>
                  </div>
                  {pullNewFactsResults.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm text-destructive font-medium">
                        Errors: {pullNewFactsResults.errors.length}
                      </p>
                      <ul className="text-xs text-destructive mt-1 space-y-1">
                        {pullNewFactsResults.errors.slice(0, 3).map((error, i) => (
                          <li key={i}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pull Historical Events */}
          <Card>
            <CardHeader>
              <CardTitle>Pull Historical Events</CardTitle>
              <CardDescription>
                Fetch historical events from Wikidata (founding, independence, wars, treaties)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="pull-events-countries">Countries (comma-separated)</Label>
                <Input
                  id="pull-events-countries"
                  value={pullEventsCountries}
                  onChange={(e) => setPullEventsCountries(e.target.value)}
                  placeholder="France,United States,Germany"
                  data-testid="input-pull-events-countries"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Events will be inserted into historical_events table. Founding/independence events also create corresponding fact evaluations.
                </p>
              </div>
              <Button
                onClick={() => pullHistoricalEventsMutation.mutate()}
                disabled={pullHistoricalEventsMutation.isPending}
                data-testid="button-pull-historical-events"
                className="w-full"
              >
                <Database className="h-4 w-4 mr-2" />
                {pullHistoricalEventsMutation.isPending ? "Pulling..." : "Pull Historical Events"}
              </Button>

              {pullHistoricalEventsResults && (
                <div className="border rounded-lg p-4 bg-muted/50 space-y-2">
                  <h4 className="font-semibold text-sm">Pull Historical Events Results</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Requested:</span>
                      <span className="ml-2 font-medium" data-testid="text-events-requested">
                        {pullHistoricalEventsResults.requested}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Events Inserted:</span>
                      <span className="ml-2 font-medium" data-testid="text-events-inserted">
                        {pullHistoricalEventsResults.eventsInserted}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Facts Created:</span>
                      <span className="ml-2 font-medium text-primary" data-testid="text-facts-created">
                        {pullHistoricalEventsResults.factsCreated}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Duplicates:</span>
                      <span className="ml-2 font-medium" data-testid="text-events-duplicates">
                        {pullHistoricalEventsResults.duplicates}
                      </span>
                    </div>
                  </div>
                  {pullHistoricalEventsResults.errors > 0 && (
                    <div className="mt-2">
                      <p className="text-sm text-destructive font-medium">
                        Errors: {pullHistoricalEventsResults.errors}
                      </p>
                    </div>
                  )}
                  <div className="pt-2 border-t text-xs text-muted-foreground">
                    <p>
                      ✓ Historical events stored in <code className="font-mono bg-muted px-1 rounded">historical_events</code> table
                    </p>
                    <p>
                      ✓ Founding/independence dates also created as <code className="font-mono bg-muted px-1 rounded">facts_evaluation</code> entries
                    </p>
                    <p>
                      ✓ Facts can be promoted to verified status using the fact promotion system
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Automated Data Operations */}
          <Card>
            <CardHeader>
              <CardTitle>Automated Data Operations</CardTitle>
              <CardDescription>
                Batch operations to synchronize and enrich data across all sources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Button
                    onClick={() => crossCheckMutation.mutate()}
                    disabled={crossCheckMutation.isPending}
                    data-testid="button-cross-check"
                    className="w-full"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    {crossCheckMutation.isPending ? "Cross-Checking..." : "Cross-Check All Sources"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Identifies all entity-attribute pairs present in at least one source and fetches missing data from Wikipedia, World Bank, and Wikidata.
                  </p>
                  {crossCheckResults && (
                    <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                      <h4 className="font-semibold text-xs">Cross-Check Results</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Total Pairs:</span>
                          <span className="ml-2 font-medium" data-testid="text-total-pairs">
                            {crossCheckResults.totalPairs}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Wikipedia:</span>
                          <span className="ml-2 font-medium" data-testid="text-wikipedia-added">
                            {crossCheckResults.wikipediaAdded}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">World Bank:</span>
                          <span className="ml-2 font-medium" data-testid="text-worldbank-added">
                            {crossCheckResults.worldBankAdded}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Wikidata:</span>
                          <span className="ml-2 font-medium" data-testid="text-wikidata-added">
                            {crossCheckResults.wikidataAdded}
                          </span>
                        </div>
                      </div>
                      {crossCheckResults.errors.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-destructive font-medium">
                            Errors: {crossCheckResults.errors.length}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={() => fulfillRequestedFactsMutation.mutate()}
                    disabled={fulfillRequestedFactsMutation.isPending}
                    data-testid="button-fulfill-requested-facts"
                    className="w-full"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    {fulfillRequestedFactsMutation.isPending ? "Fulfilling..." : "Fulfill Requested Facts"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Processes user-requested facts and attempts to fetch data from existing sources (Wikidata, World Bank).
                  </p>
                  {fulfillResults && (
                    <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                      <h4 className="font-semibold text-xs">Fulfill Results</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Total:</span>
                          <span className="ml-2 font-medium" data-testid="text-total-requests">
                            {fulfillResults.totalRequests}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Fulfilled:</span>
                          <span className="ml-2 font-medium" data-testid="text-fulfilled">
                            {fulfillResults.fulfilledCount}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Not Found:</span>
                          <span className="ml-2 font-medium" data-testid="text-not-found">
                            {fulfillResults.notFoundCount}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Existed:</span>
                          <span className="ml-2 font-medium" data-testid="text-already-exists">
                            {fulfillResults.alreadyExistsCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={() => backfillHistoricalFactsMutation.mutate()}
                    disabled={backfillHistoricalFactsMutation.isPending}
                    data-testid="button-backfill-historical-facts"
                    className="w-full"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    {backfillHistoricalFactsMutation.isPending ? "Backfilling..." : "Backfill Historical Facts"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Create missing fact evaluations from existing historical events.
                  </p>
                  {backfillHistoricalFactsResults && (
                    <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                      <h4 className="font-semibold text-xs">Backfill Results</h4>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Processed:</span>
                          <span className="ml-2 font-medium" data-testid="text-backfill-processed">
                            {backfillHistoricalFactsResults.processed}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Created:</span>
                          <span className="ml-2 font-medium text-primary" data-testid="text-backfill-created">
                            {backfillHistoricalFactsResults.created}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Skipped:</span>
                          <span className="ml-2 font-medium" data-testid="text-backfill-skipped">
                            {backfillHistoricalFactsResults.skipped}
                          </span>
                        </div>
                      </div>
                      {backfillHistoricalFactsResults.created > 0 && (
                        <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
                          <p>✓ Facts created from historical events (revolution, liberation, unification, war, etc.)</p>
                          <p>✓ Use "Promote Facts to Verified" in Fact Evaluation tab to verify these facts</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={() => syncFactsCountMutation.mutate()}
                    disabled={syncFactsCountMutation.isPending}
                    data-testid="button-sync-facts-count"
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {syncFactsCountMutation.isPending ? "Syncing..." : "Sync Source Facts Count"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Recalculates facts_count for all sources from verified_facts table to fix discrepancies.
                  </p>
                  {syncFactsCountResults && (
                    <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                      <h4 className="font-semibold text-xs">Sync Results</h4>
                      <div className="text-xs space-y-1">
                        <div>
                          <span className="text-muted-foreground">Sources Updated:</span>
                          <span className="ml-2 font-medium" data-testid="text-synced-count">
                            {syncFactsCountResults.synced}
                          </span>
                        </div>
                        {syncFactsCountResults.sources.length > 0 && (
                          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                            {syncFactsCountResults.sources.map((source) => (
                              <div key={source.domain} className="text-xs">
                                <span className="font-mono">{source.domain}</span>:
                                <span className="ml-1 text-muted-foreground">{source.oldCount}</span>
                                <span className="mx-1">→</span>
                                <span className="font-medium">{source.newCount}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FACT EVALUATION TAB */}
        <TabsContent value="fact-evaluation" className="space-y-6">
          {/* Scoring Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Scoring Configuration</CardTitle>
                  <CardDescription>
                    Configure trust score calculation, recency tiers, and promotion thresholds
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    data-testid="button-reset"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    data-testid="button-save"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="trust-calculation" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="trust-calculation">Trust Calculation</TabsTrigger>
                  <TabsTrigger value="recency-scoring">Recency Scoring</TabsTrigger>
                  <TabsTrigger value="fact-promotion">Fact Promotion</TabsTrigger>
                </TabsList>

                <TabsContent value="trust-calculation" className="space-y-4 pt-4">
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Trust scores are calculated from three weighted components: source trust, data recency, and cross-source consensus.
                    </p>
                    
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="source-trust-weight">Source Trust Weight</Label>
                          <span className="text-sm font-medium">{formData.source_trust_weight.toFixed(2)}</span>
                        </div>
                        <Slider
                          id="source-trust-weight"
                          min={0}
                          max={3}
                          step={0.1}
                          value={[formData.source_trust_weight]}
                          onValueChange={(value) => setFormData({ ...formData, source_trust_weight: value[0] })}
                          data-testid="slider-source-trust-weight"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="recency-weight">Recency Weight</Label>
                          <span className="text-sm font-medium">{formData.recency_weight.toFixed(2)}</span>
                        </div>
                        <Slider
                          id="recency-weight"
                          min={0}
                          max={3}
                          step={0.1}
                          value={[formData.recency_weight]}
                          onValueChange={(value) => setFormData({ ...formData, recency_weight: value[0] })}
                          data-testid="slider-recency-weight"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="consensus-weight">Consensus Weight</Label>
                          <span className="text-sm font-medium">{formData.consensus_weight.toFixed(2)}</span>
                        </div>
                        <Slider
                          id="consensus-weight"
                          min={0}
                          max={3}
                          step={0.1}
                          value={[formData.consensus_weight]}
                          onValueChange={(value) => setFormData({ ...formData, consensus_weight: value[0] })}
                          data-testid="slider-consensus-weight"
                        />
                      </div>
                    </div>

                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        Total weight: {totalWeight.toFixed(2)} | The final score is normalized to 0-100 scale
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="recency-scoring" className="space-y-4 pt-4">
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Configure how data freshness affects trust scores using a three-tier system.
                    </p>

                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="tier1-days">Tier 1 - Days Threshold</Label>
                          <Input
                            id="tier1-days"
                            type="number"
                            value={formData.recency_tier1_days}
                            onChange={(e) => setFormData({ ...formData, recency_tier1_days: parseInt(e.target.value) || 7 })}
                            data-testid="input-tier1-days"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="tier1-score">Tier 1 - Score</Label>
                          <Input
                            id="tier1-score"
                            type="number"
                            value={formData.recency_tier1_score}
                            onChange={(e) => setFormData({ ...formData, recency_tier1_score: parseInt(e.target.value) || 100 })}
                            data-testid="input-tier1-score"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="tier2-days">Tier 2 - Days Threshold</Label>
                          <Input
                            id="tier2-days"
                            type="number"
                            value={formData.recency_tier2_days}
                            onChange={(e) => setFormData({ ...formData, recency_tier2_days: parseInt(e.target.value) || 30 })}
                            data-testid="input-tier2-days"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="tier2-score">Tier 2 - Score</Label>
                          <Input
                            id="tier2-score"
                            type="number"
                            value={formData.recency_tier2_score}
                            onChange={(e) => setFormData({ ...formData, recency_tier2_score: parseInt(e.target.value) || 50 })}
                            data-testid="input-tier2-score"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">Tier 3 - Days Threshold</Label>
                          <p className="text-sm text-muted-foreground">Beyond Tier 2 threshold</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="tier3-score">Tier 3 - Score</Label>
                          <Input
                            id="tier3-score"
                            type="number"
                            value={formData.recency_tier3_score}
                            onChange={(e) => setFormData({ ...formData, recency_tier3_score: parseInt(e.target.value) || 10 })}
                            data-testid="input-tier3-score"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="fact-promotion" className="space-y-4 pt-4">
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Configure thresholds for determining credible sources and promoting facts to verified status.
                    </p>

                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="credible-threshold">Credible Source Threshold</Label>
                        <div className="flex items-center gap-3">
                          <Slider
                            id="credible-threshold"
                            min={0}
                            max={100}
                            step={1}
                            value={[formData.credible_threshold]}
                            onValueChange={(value) => setFormData({ ...formData, credible_threshold: value[0] })}
                            data-testid="slider-credible-threshold"
                            className="flex-1"
                          />
                          <span className="text-sm font-medium w-12 text-right">{formData.credible_threshold}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Minimum trust score required for a source to be considered credible for consensus calculation
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="promotion-threshold">Promotion Threshold</Label>
                        <div className="flex items-center gap-3">
                          <Slider
                            id="promotion-threshold"
                            min={0}
                            max={100}
                            step={1}
                            value={[formData.promotion_threshold]}
                            onValueChange={(value) => setFormData({ ...formData, promotion_threshold: value[0] })}
                            data-testid="slider-promotion-threshold"
                            className="flex-1"
                          />
                          <span className="text-sm font-medium w-12 text-right">{formData.promotion_threshold}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Minimum trust score required to promote a fact evaluation to verified gold standard
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Evaluation Operations */}
          <Card>
            <CardHeader>
              <CardTitle>Evaluation Operations</CardTitle>
              <CardDescription>
                Apply scoring changes and promote facts to verified status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Button
                    onClick={() => recalculateMutation.mutate()}
                    disabled={recalculateMutation.isPending}
                    data-testid="button-recalculate"
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {recalculateMutation.isPending ? "Recalculating..." : "Recalculate All Scores"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Recalculates trust scores for all evaluations using current scoring settings.
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={() => promoteFactsMutation.mutate()}
                    disabled={promoteFactsMutation.isPending}
                    data-testid="button-promote-facts"
                    className="w-full"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    {promoteFactsMutation.isPending ? "Promoting..." : "Promote Facts to Verified"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Promotes facts from evaluation table to verified gold standard (trust score ≥ {formData.promotion_threshold}).
                  </p>
                  {promotionResults && (
                    <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
                      <h4 className="font-semibold text-xs">Promotion Results</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Promoted:</span>
                          <span className="ml-2 font-medium" data-testid="text-promoted-count">
                            {promotionResults.promotedCount}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Skipped:</span>
                          <span className="ml-2 font-medium" data-testid="text-skipped-count">
                            {promotionResults.skippedCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
