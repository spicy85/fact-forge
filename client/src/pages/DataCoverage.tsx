import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AttributeInfo {
  attribute: string;
  description: string;
  dataType: string;
  apiCode?: string;
}

interface SourceCoverage {
  domain: string;
  status: string;
  attributes: AttributeInfo[];
  totalFacts: number;
}

interface DataCoverageResponse {
  sources: SourceCoverage[];
  allAttributes: string[];
}

export default function DataCoverage() {
  const { data, isLoading } = useQuery<DataCoverageResponse>({
    queryKey: ["/api/data-coverage"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading data coverage...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No coverage data available</p>
      </div>
    );
  }

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" => {
    switch (status) {
      case "trusted":
        return "default";
      case "pending_review":
        return "secondary";
      case "rejected":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case "trusted":
        return "Trusted";
      case "pending_review":
        return "Pending";
      case "rejected":
        return "Rejected";
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Coverage</h1>
        <p className="text-muted-foreground mt-2">
          Overview of available attributes from each data source
        </p>
      </div>

      <div className="space-y-4">
        {data.sources.map((source) => (
          <Card key={source.domain} data-testid={`card-source-${source.domain}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-mono" data-testid={`text-domain-${source.domain}`}>
                    {source.domain}
                  </CardTitle>
                  <CardDescription>
                    {source.totalFacts} facts in database
                  </CardDescription>
                </div>
                <Badge
                  variant={getStatusBadgeVariant(source.status)}
                  data-testid={`badge-status-${source.domain}`}
                >
                  {getStatusLabel(source.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {source.attributes.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Available Attributes ({source.attributes.length})
                  </h4>
                  <div className="grid gap-2">
                    {source.attributes.map((attr) => (
                      <div
                        key={attr.attribute}
                        className="flex items-start gap-3 p-3 rounded-md border bg-card hover-elevate"
                        data-testid={`row-attribute-${source.domain}-${attr.attribute}`}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium font-mono text-sm" data-testid={`text-attr-name-${attr.attribute}`}>
                              {attr.attribute}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {attr.dataType}
                            </Badge>
                            {attr.apiCode && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="secondary" className="text-xs font-mono">
                                      {attr.apiCode}
                                      <Info className="h-3 w-3 ml-1" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>API Indicator Code</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground" data-testid={`text-attr-desc-${attr.attribute}`}>
                            {attr.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <X className="h-4 w-4" />
                  <span className="text-sm">No attributes configured for this source</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {data.sources.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">No sources found</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
