import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { VerificationBadge, VerificationStatus } from "./VerificationBadge";
import { ExternalLink } from "lucide-react";

export interface SourceDetail {
  domain: string;
  trustScore: number;
  url: string;
  evaluatedAt: string;
}

export interface VerificationResult {
  claimedValue: string;
  attribute: string;
  verdict: VerificationStatus;
  recordedValue?: string;
  lastVerifiedAt?: string;
  citation?: string;
  sourceTrust?: string;
  sources?: SourceDetail[];
}

interface ResultsTableProps {
  results: VerificationResult[];
}

export function ResultsTable({ results }: ResultsTableProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <Card className="overflow-hidden" data-testid="card-results-table">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-medium">Claimed Value</TableHead>
              <TableHead className="font-medium">Attribute</TableHead>
              <TableHead className="font-medium">Verdict</TableHead>
              <TableHead className="font-medium">Recorded Value</TableHead>
              <TableHead className="font-medium">Last Updated</TableHead>
              <TableHead className="font-medium">Citation</TableHead>
              <TableHead className="font-medium">Source Trust</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result, idx) => (
              <TableRow key={idx} data-testid={`row-result-${idx}`}>
                <TableCell className="font-mono font-semibold">
                  {result.claimedValue}
                </TableCell>
                <TableCell className="text-sm">
                  {result.attribute.replace(/_/g, " ")}
                </TableCell>
                <TableCell>
                  <VerificationBadge status={result.verdict} />
                </TableCell>
                <TableCell className="font-mono">
                  {result.recordedValue || "-"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {result.lastVerifiedAt || "-"}
                </TableCell>
                <TableCell>
                  {result.sources && result.sources.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {result.sources.map((source, sourceIdx) => (
                        <a
                          key={sourceIdx}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline max-w-xs truncate"
                          data-testid={`link-citation-${idx}-${sourceIdx}`}
                        >
                          <span className="truncate">{source.domain}</span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  ) : result.citation ? (
                    <a
                      href={result.citation}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline max-w-xs truncate"
                      data-testid={`link-citation-${idx}`}
                    >
                      <span className="truncate">
                        {(() => {
                          try {
                            const url = new URL(result.citation);
                            return url.hostname.replace(/^www\./, "");
                          } catch {
                            return "Source";
                          }
                        })()}
                      </span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm" data-testid={`text-source-trust-${idx}`}>
                  {result.sources && result.sources.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {result.sources.map((source, sourceIdx) => (
                        <div key={sourceIdx} className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                            {source.trustScore}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {source.domain}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    result.sourceTrust || "-"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}