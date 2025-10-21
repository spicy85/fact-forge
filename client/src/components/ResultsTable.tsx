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

export interface VerificationResult {
  claimedValue: string;
  attribute: string;
  verdict: VerificationStatus;
  recordedValue?: string;
  lastVerifiedAt?: string;
  citation?: string;
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
                  {result.citation ? (
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}