import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Settings, Save, RotateCcw, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import type { ScoringSettings } from "@shared/schema";

export default function AdminScoring() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<ScoringSettings | null>({
    queryKey: ["/api/scoring-settings"],
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
  });

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
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("PUT", "/api/scoring-settings", data);
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

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleReset = () => {
    setFormData({
      source_trust_weight: 1,
      recency_weight: 1,
      consensus_weight: 1,
      recency_tier1_days: 7,
      recency_tier1_score: 100,
      recency_tier2_days: 30,
      recency_tier2_score: 50,
      recency_tier3_score: 10,
    });
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
        {/* Scoring Weights Card */}
        <Card>
          <CardHeader>
            <CardTitle>Trust Score Weights</CardTitle>
            <CardDescription>
              Configure the relative importance of each scoring criterion. 
              Total weight: {totalWeight} (proportional weighting)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
          </CardContent>
        </Card>

        {/* Recency Scoring Tiers Card */}
        <Card>
          <CardHeader>
            <CardTitle>Recency Scoring Tiers</CardTitle>
            <CardDescription>
              Configure how recency affects scoring based on days since evaluation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
