import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, Search, ExternalLink } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface AssayProvenanceRecord {
  id: number;
  assay_id: string;
  entity: string;
  attribute: string;
  claimed_value: string;
  claimed_year?: number;
  raw_responses: Record<string, any>;
  parsed_values: Record<string, any>;
  consensus_result: {
    status: string;
    consensus_value?: any;
    source_count?: number;
    min?: any;
    max?: any;
  };
  created_at: string;
  hash: string;
}

export default function AssayProvenance() {
  const [provenanceId, setProvenanceId] = useState("");
  const [searchEntity, setSearchEntity] = useState("");

  const { data: provenanceById, isLoading: loadingById } = useQuery<AssayProvenanceRecord>({
    queryKey: [`/api/assay-provenance/${provenanceId}`],
    enabled: !!provenanceId && /^\d+$/.test(provenanceId),
    queryFn: async () => {
      const response = await fetch(`/api/assay-provenance/${provenanceId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch provenance by ID");
      }
      const record = await response.json();
      return {
        ...record,
        raw_responses: typeof record.raw_responses === 'string' ? JSON.parse(record.raw_responses) : record.raw_responses,
        parsed_values: typeof record.parsed_values === 'string' ? JSON.parse(record.parsed_values) : record.parsed_values,
        consensus_result: typeof record.consensus_result === 'string' ? JSON.parse(record.consensus_result) : record.consensus_result,
      };
    }
  });

  const { data: provenanceByEntity, isLoading: loadingByEntity } = useQuery<AssayProvenanceRecord[]>({
    queryKey: ["/api/assay-provenance/entity", searchEntity],
    enabled: !!searchEntity,
    queryFn: async () => {
      const response = await fetch(`/api/assay-provenance?entity=${encodeURIComponent(searchEntity)}`);
      if (!response.ok) {
        throw new Error("Failed to fetch provenance by entity");
      }
      const data = await response.json();
      return data.map((record: any) => ({
        ...record,
        raw_responses: typeof record.raw_responses === 'string' ? JSON.parse(record.raw_responses) : record.raw_responses,
        parsed_values: typeof record.parsed_values === 'string' ? JSON.parse(record.parsed_values) : record.parsed_values,
        consensus_result: typeof record.consensus_result === 'string' ? JSON.parse(record.consensus_result) : record.consensus_result,
      }));
    }
  });

  const { data: recentProvenance, isLoading: loadingRecent } = useQuery<AssayProvenanceRecord[]>({
    queryKey: ["/api/assay-provenance"],
    enabled: !provenanceId && !searchEntity,
    queryFn: async () => {
      const response = await fetch('/api/assay-provenance');
      if (!response.ok) {
        throw new Error("Failed to fetch recent provenance");
      }
      const data = await response.json();
      return data.map((record: any) => ({
        ...record,
        raw_responses: typeof record.raw_responses === 'string' ? JSON.parse(record.raw_responses) : record.raw_responses,
        parsed_values: typeof record.parsed_values === 'string' ? JSON.parse(record.parsed_values) : record.parsed_values,
        consensus_result: typeof record.consensus_result === 'string' ? JSON.parse(record.consensus_result) : record.consensus_result,
      }));
    }
  });

  const handleSearchById = () => {
    setSearchEntity("");
  };

  const handleSearchByEntity = () => {
    setProvenanceId("");
  };

  const displayRecords = provenanceById 
    ? [provenanceById] 
    : provenanceByEntity || recentProvenance || [];

  const isLoading = loadingById || loadingByEntity || loadingRecent;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "verified":
        return <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case "mismatch":
        return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
      case "close":
        return <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6" data-testid="page-assay-provenance">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-title">
          Assay Provenance Viewer
        </h1>
        <p className="text-muted-foreground" data-testid="text-description">
          View detailed audit trails for assay-based verifications
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="space-y-3">
            <h3 className="font-medium text-sm">Search by Provenance ID</h3>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter provenance ID..."
                value={provenanceId}
                onChange={(e) => setProvenanceId(e.target.value)}
                data-testid="input-provenance-id"
              />
              <Button 
                onClick={handleSearchById} 
                size="icon"
                variant="default"
                data-testid="button-search-id"
              >
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="space-y-3">
            <h3 className="font-medium text-sm">Search by Entity</h3>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter entity name..."
                value={searchEntity}
                onChange={(e) => setSearchEntity(e.target.value)}
                data-testid="input-entity"
              />
              <Button 
                onClick={handleSearchByEntity} 
                size="icon"
                variant="default"
                data-testid="button-search-entity"
              >
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {isLoading && (
        <Card className="p-8">
          <p className="text-center text-muted-foreground" data-testid="text-loading">
            Loading provenance records...
          </p>
        </Card>
      )}

      {!isLoading && displayRecords.length === 0 && (
        <Card className="p-8">
          <p className="text-center text-muted-foreground" data-testid="text-no-results">
            {provenanceId || searchEntity 
              ? "No provenance records found for your search"
              : "No recent provenance records"}
          </p>
        </Card>
      )}

      {!isLoading && displayRecords.length > 0 && (
        <div className="space-y-4">
          {displayRecords.map((record) => (
            <Card key={record.id} className="p-6" data-testid={`card-provenance-${record.id}`}>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg" data-testid={`text-entity-${record.id}`}>
                        {record.entity}
                      </h3>
                      <Badge variant="outline" data-testid={`badge-assay-${record.id}`}>
                        {record.assay_id}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground" data-testid={`text-provenance-id-${record.id}`}>
                      Provenance ID: {record.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(record.consensus_result.status)}
                    <Badge 
                      variant={
                        record.consensus_result.status === "verified" 
                          ? "default" 
                          : record.consensus_result.status === "mismatch" 
                          ? "destructive" 
                          : "secondary"
                      }
                      data-testid={`badge-status-${record.id}`}
                    >
                      {record.consensus_result.status}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Attribute</p>
                    <p className="font-mono" data-testid={`text-attribute-${record.id}`}>
                      {record.attribute}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Claimed Value</p>
                    <p className="font-mono font-semibold" data-testid={`text-claimed-${record.id}`}>
                      {record.claimed_value}
                      {record.claimed_year && (
                        <span className="text-muted-foreground ml-2">({record.claimed_year})</span>
                      )}
                    </p>
                  </div>
                  {record.consensus_result.consensus_value !== undefined && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Consensus Value</p>
                      <p className="font-mono font-semibold" data-testid={`text-consensus-${record.id}`}>
                        {record.consensus_result.consensus_value}
                      </p>
                    </div>
                  )}
                  {record.consensus_result.source_count !== undefined && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Sources</p>
                      <p data-testid={`text-sources-${record.id}`}>
                        {record.consensus_result.source_count} {record.consensus_result.source_count === 1 ? 'source' : 'sources'}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Verified At</p>
                    <p className="text-sm" data-testid={`text-created-${record.id}`}>
                      {new Date(record.created_at).toLocaleString()}
                    </p>
                  </div>
                  {record.hash && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Verification Hash</p>
                      <p className="font-mono text-xs" data-testid={`text-hash-${record.id}`}>
                        {record.hash.substring(0, 12)}...
                      </p>
                    </div>
                  )}
                </div>

                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full" data-testid={`button-toggle-raw-${record.id}`}>
                      View Raw API Responses
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4">
                    <Card className="p-4 bg-muted/50">
                      <div className="space-y-4">
                        {Object.entries(record.raw_responses).map(([source, response]) => (
                          <div key={source} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" data-testid={`badge-source-${record.id}-${source}`}>
                                {source}
                              </Badge>
                              {record.parsed_values[source] !== undefined && (
                                <span className="text-sm text-muted-foreground">
                                  Parsed: <span className="font-mono font-semibold">
                                    {typeof record.parsed_values[source] === 'object' 
                                      ? JSON.stringify(record.parsed_values[source]) 
                                      : record.parsed_values[source]}
                                  </span>
                                </span>
                              )}
                            </div>
                            <pre className="text-xs overflow-x-auto p-3 bg-background rounded border" data-testid={`pre-response-${record.id}-${source}`}>
                              {JSON.stringify(response, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
