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
import { Settings, Save, RotateCcw, ExternalLink, ArrowLeft, RefreshCw, Database } from "lucide-react";
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
  
  // Pull new facts form state
  const [pullEntities, setPullEntities] = useState<string>("Canada,Mexico");
  const [pullAttributes, setPullAttributes] = useState<string[]>(["population"]);
  const [pullYearStart, setPullYearStart] = useState<string>("2023");
  const [pullYearEnd, setPullYearEnd] = useState<string>("2024");

  // TLD scores form state
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

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleReset = () => {
    // Reload from current database settings instead of hardcoded values
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
          <h1 className="text-3xl font-bold">Admin - Scoring Configuration</h1>
        </div>
        <p>Loading settings...</p>
      </div>
    );
  }

  const totalWeight = formData.source_trust_weight + formData.recency_weight + formData.consensus_weight;

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6" />
          <h1 className="text-3xl font-bold">Admin - Scoring Configuration</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/">
            <Button variant="outline" data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={handleReset}
            data-testid="button-reset"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            data-testid="button-save"
          >
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Configuration Card with Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Scoring Configuration</CardTitle>
            <CardDescription>
              Configure trust score calculation, recency tiers, and promotion thresholds
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="trust-calculation" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="trust-calculation">Trust Calculation</TabsTrigger>
                <TabsTrigger value="recency-scoring">Recency Scoring</TabsTrigger>
                <TabsTrigger value="fact-promotion">Fact Promotion</TabsTrigger>
                <TabsTrigger value="tld-config">TLD Configuration</TabsTrigger>
              </TabsList>

              <TabsContent value="trust-calculation" className="space-y-6 mt-6">
                <div className="mb-6 p-4 bg-muted/50 rounded-lg">
                  <h3 className="text-sm font-medium mb-2">Source Trust Score Criteria</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Each source's overall trust score is calculated as the average of these five criteria (0-100 scale):
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                    <li><strong>Identity</strong> - Authenticity and verifiable ownership</li>
                    <li><strong>Legitimacy</strong> - Authority and recognized expertise</li>
                    <li><strong>Data Quality</strong> - Completeness and comprehensiveness</li>
                    <li><strong>Data Accuracy</strong> - Precision and correctness</li>
                    <li><strong>Proprietary</strong> - Transparency and methodology disclosure</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-4">
                    Score Weights (Total: {totalWeight})
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <Label htmlFor="source-trust-weight">Source Trust Weight</Label>
                        <span className="text-sm font-medium" data-testid="text-source-trust-weight">
                          {formData.source_trust_weight} ({Math.round((formData.source_trust_weight / totalWeight) * 100)}%)
                        </span>
                      </div>
                      <Slider
                        id="source-trust-weight"
                        min={0}
                        max={10}
                        step={1}
                        value={[formData.source_trust_weight]}
                        onValueChange={([value]) => setFormData({ ...formData, source_trust_weight: value })}
                        data-testid="slider-source-trust-weight"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <Label htmlFor="recency-weight">Recency Weight</Label>
                        <span className="text-sm font-medium" data-testid="text-recency-weight">
                          {formData.recency_weight} ({Math.round((formData.recency_weight / totalWeight) * 100)}%)
                        </span>
                      </div>
                      <Slider
                        id="recency-weight"
                        min={0}
                        max={10}
                        step={1}
                        value={[formData.recency_weight]}
                        onValueChange={([value]) => setFormData({ ...formData, recency_weight: value })}
                        data-testid="slider-recency-weight"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <Label htmlFor="consensus-weight">Consensus Weight</Label>
                        <span className="text-sm font-medium" data-testid="text-consensus-weight">
                          {formData.consensus_weight} ({Math.round((formData.consensus_weight / totalWeight) * 100)}%)
                        </span>
                      </div>
                      <Slider
                        id="consensus-weight"
                        min={0}
                        max={10}
                        step={1}
                        value={[formData.consensus_weight]}
                        onValueChange={([value]) => setFormData({ ...formData, consensus_weight: value })}
                        data-testid="slider-consensus-weight"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-4">Multi-Source Verification</h3>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <Label htmlFor="credible-threshold">Credible Threshold (0-100)</Label>
                      <span className="text-sm font-medium" data-testid="text-credible-threshold">
                        {formData.credible_threshold}
                      </span>
                    </div>
                    <Slider
                      id="credible-threshold"
                      min={0}
                      max={100}
                      step={5}
                      value={[formData.credible_threshold]}
                      onValueChange={([value]) => setFormData({ ...formData, credible_threshold: value })}
                      data-testid="slider-credible-threshold"
                    />
                    <p className="text-sm text-muted-foreground mt-2">
                      Only sources with a trust score of {formData.credible_threshold} or higher will be used to calculate consensus and range in multi-source verification.
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="recency-scoring" className="space-y-4 mt-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="tier1-days">Tier 1: Days Threshold</Label>
                    <Input
                      id="tier1-days"
                      type="number"
                      min={1}
                      value={formData.recency_tier1_days}
                      onChange={(e) => setFormData({ ...formData, recency_tier1_days: parseInt(e.target.value) || 7 })}
                      data-testid="input-tier1-days"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      ≤ {formData.recency_tier1_days} days old
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="tier1-score">Tier 1: Score</Label>
                    <Input
                      id="tier1-score"
                      type="number"
                      min={0}
                      max={100}
                      value={formData.recency_tier1_score}
                      onChange={(e) => setFormData({ ...formData, recency_tier1_score: parseInt(e.target.value) || 100 })}
                      data-testid="input-tier1-score"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="tier2-days">Tier 2: Days Threshold</Label>
                    <Input
                      id="tier2-days"
                      type="number"
                      min={1}
                      value={formData.recency_tier2_days}
                      onChange={(e) => setFormData({ ...formData, recency_tier2_days: parseInt(e.target.value) || 30 })}
                      data-testid="input-tier2-days"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      ≤ {formData.recency_tier2_days} days old
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="tier2-score">Tier 2: Score</Label>
                    <Input
                      id="tier2-score"
                      type="number"
                      min={0}
                      max={100}
                      value={formData.recency_tier2_score}
                      onChange={(e) => setFormData({ ...formData, recency_tier2_score: parseInt(e.target.value) || 50 })}
                      data-testid="input-tier2-score"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tier 3: Days Threshold</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      &gt; {formData.recency_tier2_days} days old
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="tier3-score">Tier 3: Score</Label>
                    <Input
                      id="tier3-score"
                      type="number"
                      min={0}
                      max={100}
                      value={formData.recency_tier3_score}
                      onChange={(e) => setFormData({ ...formData, recency_tier3_score: parseInt(e.target.value) || 10 })}
                      data-testid="input-tier3-score"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="fact-promotion" className="space-y-4 mt-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label htmlFor="promotion-threshold">Promotion Threshold (0-100)</Label>
                    <span className="text-sm font-medium" data-testid="text-promotion-threshold">
                      {formData.promotion_threshold}
                    </span>
                  </div>
                  <Slider
                    id="promotion-threshold"
                    min={0}
                    max={100}
                    step={5}
                    value={[formData.promotion_threshold]}
                    onValueChange={([value]) => setFormData({ ...formData, promotion_threshold: value })}
                    data-testid="slider-promotion-threshold"
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    Facts with a trust score of {formData.promotion_threshold} or higher will be promoted to the verified_facts table when you run the promotion process.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="tld-config" className="space-y-4 mt-6">
                <div className="mb-4 p-4 bg-muted/50 rounded-lg">
                  <h3 className="text-sm font-medium mb-2">Top-Level Domain (TLD) Reputation Scores</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure how different domain extensions contribute to URL reputation scoring. Higher scores indicate more trustworthy domains.
                  </p>
                </div>

                {tldScoresLoading ? (
                  <div className="text-center py-4 text-muted-foreground">Loading TLD scores...</div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Existing TLD Scores</Label>
                      <div className="border rounded-md">
                        <div className="grid grid-cols-[1fr_120px_120px] gap-2 p-3 border-b bg-muted/30 font-medium text-sm">
                          <div>TLD</div>
                          <div className="text-center">Score (0-100)</div>
                          <div className="text-center">Actions</div>
                        </div>
                        {tldScores.length === 0 ? (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            No TLD scores configured yet
                          </div>
                        ) : (
                          tldScores.map((tldScore) => (
                            <div key={tldScore.tld} className="grid grid-cols-[1fr_120px_120px] gap-2 p-3 border-b last:border-b-0">
                              <div className="flex items-center font-mono" data-testid={`text-tld-${tldScore.tld}`}>
                                {tldScore.tld}
                              </div>
                              <div className="flex items-center justify-center">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={editingTld[tldScore.tld] !== undefined ? editingTld[tldScore.tld] : tldScore.score}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value) || 0;
                                    setEditingTld({ ...editingTld, [tldScore.tld]: Math.min(Math.max(value, 0), 100) });
                                  }}
                                  className="w-20 text-center"
                                  data-testid={`input-tld-score-${tldScore.tld}`}
                                />
                              </div>
                              <div className="flex items-center justify-center gap-2">
                                {editingTld[tldScore.tld] !== undefined && editingTld[tldScore.tld] !== tldScore.score && (
                                  <Button
                                    size="sm"
                                    onClick={() => updateTldMutation.mutate({ tld: tldScore.tld, score: editingTld[tldScore.tld] })}
                                    disabled={updateTldMutation.isPending}
                                    data-testid={`button-save-tld-${tldScore.tld}`}
                                  >
                                    <Save className="h-3 w-3" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deleteTldMutation.mutate(tldScore.tld)}
                                  disabled={deleteTldMutation.isPending}
                                  data-testid={`button-delete-tld-${tldScore.tld}`}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 pt-4 border-t">
                      <Label>Add New TLD Score</Label>
                      <div className="grid grid-cols-[1fr_120px_120px] gap-2">
                        <Input
                          placeholder="e.g., .gov, .org, .com"
                          value={newTld}
                          onChange={(e) => setNewTld(e.target.value)}
                          data-testid="input-new-tld"
                        />
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="Score"
                          value={newTldScore}
                          onChange={(e) => setNewTldScore(parseInt(e.target.value) || 0)}
                          data-testid="input-new-tld-score"
                        />
                        <Button
                          onClick={() => {
                            const trimmedTld = newTld.trim();
                            if (!trimmedTld) return;
                            
                            // Validate TLD starts with a dot
                            if (!trimmedTld.startsWith('.')) {
                              toast({
                                title: "Invalid TLD",
                                description: "TLD must start with a dot (e.g., .gov, .org)",
                                variant: "destructive",
                              });
                              return;
                            }
                            
                            // Clamp score between 0 and 100
                            const clampedScore = Math.min(Math.max(newTldScore, 0), 100);
                            
                            createTldMutation.mutate({ tld: trimmedTld, score: clampedScore });
                          }}
                          disabled={!newTld.trim() || createTldMutation.isPending}
                          data-testid="button-add-tld"
                        >
                          Add TLD
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Pull New Facts Card */}
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

        {/* Data Operations Card */}
        <Card>
          <CardHeader>
            <CardTitle>Data Operations</CardTitle>
            <CardDescription>
              Perform batch operations across all integrated sources
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
                        <div className="mt-2 space-y-1">
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
                        <div className="mt-2 space-y-1">
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
                        <div className="mt-2 space-y-1">
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
                        <div className="mt-2 space-y-1">
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
            </div>
          </CardContent>
        </Card>

        {/* Source Management Card */}
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
      </div>
    </div>
  );
}
