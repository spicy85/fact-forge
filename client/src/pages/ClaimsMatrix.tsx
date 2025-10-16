import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Link } from "wouter";
import { ArrowLeft, Check, X, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FactRecord } from "@/lib/factChecker";

interface ClaimAvailability {
  [country: string]: {
    [attribute: string]: boolean;
  };
}

export default function ClaimsMatrix() {
  const [facts, setFacts] = useState<FactRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [claimTypes, setClaimTypes] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<ClaimAvailability>({});

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch("/api/facts");
        const parsedFacts: FactRecord[] = await response.json();
        setFacts(parsedFacts);

        // Extract unique countries (sorted)
        const uniqueCountries = Array.from(
          new Set(parsedFacts.map((f) => f.entity))
        ).sort((a, b) => a.localeCompare(b));
        setCountries(uniqueCountries);

        // Extract unique claim types (sorted)
        const uniqueClaimTypes = Array.from(
          new Set(parsedFacts.map((f) => f.attribute))
        ).sort((a, b) => a.localeCompare(b));
        setClaimTypes(uniqueClaimTypes);

        // Build matrix
        const claimMatrix: ClaimAvailability = {};
        uniqueCountries.forEach((country) => {
          claimMatrix[country] = {};
          uniqueClaimTypes.forEach((claimType) => {
            claimMatrix[country][claimType] = parsedFacts.some(
              (f) => f.entity === country && f.attribute === claimType
            );
          });
        });
        setMatrix(claimMatrix);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const formatClaimType = (attribute: string): string => {
    const formatted = attribute
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return formatted;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading claims matrix...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold">Supported Claims Matrix</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sources">
              <Button variant="outline" size="sm" data-testid="button-view-sources">
                <Database className="h-4 w-4 mr-2" />
                Sources
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <p className="text-muted-foreground">
            This matrix shows which claims are available for each country in our database.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {countries.length} countries × {claimTypes.length} claim types = {facts.length} total facts
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-semibold bg-muted/50 sticky left-0 z-10">
                  Country
                </th>
                {claimTypes.map((claimType) => (
                  <th
                    key={claimType}
                    className="text-center py-3 px-4 font-semibold bg-muted/50 min-w-[120px]"
                    data-testid={`header-${claimType}`}
                  >
                    {formatClaimType(claimType)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {countries.map((country) => (
                <tr
                  key={country}
                  className="border-b hover-elevate"
                  data-testid={`row-${country.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <td className="py-3 px-4 font-medium sticky left-0 bg-background z-10">
                    {country}
                  </td>
                  {claimTypes.map((claimType) => (
                    <td
                      key={`${country}-${claimType}`}
                      className="text-center py-3 px-4"
                      data-testid={`cell-${country.toLowerCase().replace(/\s+/g, "-")}-${claimType}`}
                    >
                      {matrix[country]?.[claimType] ? (
                        <Check className="h-5 w-5 text-green-600 dark:text-green-500 inline-block" />
                      ) : (
                        <X className="h-5 w-5 text-muted-foreground/30 inline-block" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-green-600 dark:text-green-500" />
          <span>Available</span>
          <span className="mx-2">•</span>
          <X className="h-4 w-4 text-muted-foreground/30" />
          <span>Not Available</span>
        </div>
      </main>
    </div>
  );
}
