import { Link } from "wouter";
import { ArrowLeft, Clock } from "lucide-react";
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
import { useQuery } from "@tanstack/react-query";

interface FactActivityLog {
  id: number;
  entity: string;
  entity_type: string;
  attribute: string;
  action: string;
  source: string | null;
  process: string | null;
  value: string | null;
  notes: string | null;
  created_at: string;
}

export default function FactsActivityLog() {
  const { data: logs = [], isLoading } = useQuery<FactActivityLog[]>({
    queryKey: ["/api/facts-activity-log"],
  });

  const getActionBadgeVariant = (action: string) => {
    if (action === "requested") return "outline";
    if (action === "fulfilled") return "default";
    if (action === "added") return "default";
    if (action === "updated") return "secondary";
    if (action === "removed") return "outline";
    return "outline";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-xl font-semibold">Facts Activity Log</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Fact Lifecycle History</CardTitle>
            <CardDescription>
              Track when facts are requested, fulfilled, added, updated, or removed from the database
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading activity logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No activity logged yet. Activity will appear here when facts are requested, fulfilled, or added.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Attribute</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Process</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} data-testid={`log-row-${log.id}`}>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.entity}
                      </TableCell>
                      <TableCell className="text-sm capitalize text-muted-foreground">
                        {log.entity_type}
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {log.attribute.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(log.action)} data-testid={`badge-action-${log.id}`}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.source || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {log.value || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.process || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {log.notes || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
