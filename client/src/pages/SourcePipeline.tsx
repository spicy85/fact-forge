import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ShieldCheck, CheckCircle2, XCircle, Plus } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Source {
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

export default function SourcePipeline() {
  const { toast } = useToast();
  const [newSourceDomain, setNewSourceDomain] = useState("");
  const [newSourceTrust, setNewSourceTrust] = useState(70);
  const [newSourceAccuracy, setNewSourceAccuracy] = useState(70);
  const [newSourceProprietary, setNewSourceProprietary] = useState(60);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: pendingSources = [], isLoading: loadingPending } = useQuery<Source[]>({
    queryKey: ["/api/sources", "pending_review"],
    queryFn: async () => {
      const response = await fetch("/api/sources?status=pending_review");
      if (!response.ok) throw new Error("Failed to fetch pending sources");
      return response.json();
    },
  });

  const { data: evaluatingSources = [], isLoading: loadingEvaluating } = useQuery<Source[]>({
    queryKey: ["/api/sources", "evaluating"],
    queryFn: async () => {
      const response = await fetch("/api/sources?status=evaluating");
      if (!response.ok) throw new Error("Failed to fetch evaluating sources");
      return response.json();
    },
  });

  const createSourceMutation = useMutation({
    mutationFn: async (sourceData: {
      domain: string;
      public_trust: number;
      data_accuracy: number;
      proprietary_score: number;
      status: string;
    }) => {
      return apiRequest("POST", "/api/sources", sourceData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
      toast({
        title: "Source added",
        description: "New source added to pipeline for evaluation",
      });
      setNewSourceDomain("");
      setNewSourceTrust(70);
      setNewSourceAccuracy(70);
      setNewSourceProprietary(60);
      setDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add source. Domain may already exist.",
        variant: "destructive",
      });
    },
  });

  const promoteSourceMutation = useMutation({
    mutationFn: async (domain: string) => {
      return apiRequest("PUT", `/api/sources/${domain}/promote`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
      toast({
        title: "Source promoted",
        description: "Source successfully promoted to trusted list",
      });
    },
  });

  const rejectSourceMutation = useMutation({
    mutationFn: async ({ domain, notes }: { domain: string; notes?: string }) => {
      return apiRequest("PUT", `/api/sources/${domain}/reject`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sources"] });
      toast({
        title: "Source rejected",
        description: "Source marked as rejected",
      });
    },
  });

  const getTrustBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "outline";
  };

  const handleAddSource = () => {
    if (!newSourceDomain) return;
    
    createSourceMutation.mutate({
      domain: newSourceDomain,
      public_trust: newSourceTrust,
      data_accuracy: newSourceAccuracy,
      proprietary_score: newSourceProprietary,
      status: "pending_review",
    });
  };

  const allSources = [...pendingSources, ...evaluatingSources].sort((a, b) => 
    new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
  );

  const isLoading = loadingPending || loadingEvaluating;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading pipeline...</p>
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
              <h1 className="text-2xl font-semibold" data-testid="text-pipeline-title">
                Source Pipeline
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and manage sources pending approval
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-source">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Source
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-add-source">
                <DialogHeader>
                  <DialogTitle>Add New Source</DialogTitle>
                  <DialogDescription>
                    Add a new data source to the pipeline for evaluation. Start with conservative trust metrics.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="domain">Domain</Label>
                    <Input
                      id="domain"
                      placeholder="example.com"
                      value={newSourceDomain}
                      onChange={(e) => setNewSourceDomain(e.target.value)}
                      data-testid="input-new-domain"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="trust">Public Trust</Label>
                      <Input
                        id="trust"
                        type="number"
                        min="0"
                        max="100"
                        value={newSourceTrust}
                        onChange={(e) => setNewSourceTrust(parseInt(e.target.value) || 0)}
                        data-testid="input-new-trust"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accuracy">Data Accuracy</Label>
                      <Input
                        id="accuracy"
                        type="number"
                        min="0"
                        max="100"
                        value={newSourceAccuracy}
                        onChange={(e) => setNewSourceAccuracy(parseInt(e.target.value) || 0)}
                        data-testid="input-new-accuracy"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="proprietary">Proprietary Score</Label>
                      <Input
                        id="proprietary"
                        type="number"
                        min="0"
                        max="100"
                        value={newSourceProprietary}
                        onChange={(e) => setNewSourceProprietary(parseInt(e.target.value) || 0)}
                        data-testid="input-new-proprietary"
                      />
                    </div>
                  </div>
                  <Button 
                    onClick={handleAddSource} 
                    disabled={!newSourceDomain || createSourceMutation.isPending}
                    className="w-full"
                    data-testid="button-submit-source"
                  >
                    {createSourceMutation.isPending ? "Adding..." : "Add to Pipeline"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Link href="/sources">
              <Button variant="outline" size="sm" data-testid="button-view-trusted">
                <ShieldCheck className="h-4 w-4 mr-2" />
                View Trusted
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" size="sm" data-testid="button-back-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Sources Under Evaluation</CardTitle>
            <CardDescription>
              Sources in the pipeline waiting for manual review and approval. Promote sources to the trusted list when ready for production use.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 text-sm text-muted-foreground">
              Total in pipeline: {allSources.length}
            </div>
            {allSources.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No sources in pipeline</p>
                <p className="text-sm mt-2">Add a new source to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="header-domain">Domain</TableHead>
                    <TableHead data-testid="header-status">Status</TableHead>
                    <TableHead data-testid="header-trust-level">Trust Level</TableHead>
                    <TableHead data-testid="header-facts">Facts</TableHead>
                    <TableHead data-testid="header-notes">Notes</TableHead>
                    <TableHead data-testid="header-actions">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allSources.map((source) => {
                    const overallTrust = Math.round(
                      (source.public_trust + source.data_accuracy + source.proprietary_score) / 3
                    );
                    
                    return (
                      <TableRow key={source.domain} data-testid={`row-source-${source.domain}`}>
                        <TableCell className="font-mono text-sm" data-testid={`text-domain-${source.domain}`}>
                          {source.domain}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`badge-status-${source.domain}`}>
                            {source.status === 'pending_review' ? 'Pending' : 'Evaluating'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getTrustBadgeVariant(overallTrust)} data-testid={`badge-trust-${source.domain}`}>
                            {overallTrust}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-facts-${source.domain}`}>
                          {source.facts_count}
                        </TableCell>
                        <TableCell className="max-w-xs break-words text-sm text-muted-foreground" data-testid={`text-notes-${source.domain}`}>
                          {source.notes || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => promoteSourceMutation.mutate(source.domain)}
                              disabled={promoteSourceMutation.isPending}
                              data-testid={`button-promote-${source.domain}`}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Promote
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => rejectSourceMutation.mutate({ domain: source.domain })}
                              disabled={rejectSourceMutation.isPending}
                              data-testid={`button-reject-${source.domain}`}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
