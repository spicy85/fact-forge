import { readFileSync } from "fs";
import { join } from "path";

// Wikidata SPARQL endpoint
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

// Load country Q-IDs from centralized mapping file
const COUNTRY_QIDS: Record<string, string> = JSON.parse(
  readFileSync(join(process.cwd(), "public/country-qids.json"), "utf-8")
);

// Wikidata property IDs for historical events
const EVENT_PROPERTIES = {
  inception: 'P571',        // founding/inception date
  dissolved: 'P576',        // dissolution/abolished date
  independence: 'P571',     // independence date (usually same as inception for countries)
  significantEvent: 'P793', // significant event
};

export interface HistoricalEventResult {
  entity: string;
  entity_type: 'country';
  event_year: number;
  event_date?: string;      // Optional ISO date (YYYY-MM-DD)
  event_type: string;       // 'founding', 'independence', 'war', 'treaty', etc.
  title: string;
  description: string;
  source_name: string;
  source_url: string;
  importance: number;       // 1-10 scale
  verified: number;         // 1 for Wikidata sources
}

async function executeSparqlQuery(sparql: string): Promise<any> {
  const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Replit-FactChecker/1.0',
      'Accept': 'application/sparql-results+json'
    }
  });

  if (!response.ok) {
    throw new Error(`Wikidata SPARQL query failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function fetchCountryEvents(countryName: string, qid: string): Promise<HistoricalEventResult[]> {
  const results: HistoricalEventResult[] = [];

  try {
    // First, try to get independence date (P1619) - this is more specific
    const independenceQuery = `
      SELECT ?value WHERE {
        wd:${qid} wdt:P1619 ?value.
      }
      LIMIT 1
    `;

    const independenceData = await executeSparqlQuery(independenceQuery);
    if (independenceData.results?.bindings?.length > 0) {
      const binding = independenceData.results.bindings[0];
      const dateValue = binding.value.value;
      const date = new Date(dateValue);
      const year = date.getFullYear();
      
      // Skip if year is invalid (NaN)
      if (!isNaN(year)) {
        const event_date = dateValue.split('T')[0]; // Extract YYYY-MM-DD

        results.push({
          entity: countryName,
          entity_type: 'country',
          event_year: year,
          event_date,
          event_type: 'independence',
          title: `Independence of ${countryName}`,
          description: `${countryName} gained independence on ${event_date}.`,
          source_name: 'www.wikidata.org',
          source_url: `https://www.wikidata.org/wiki/${qid}#P1619`,
          importance: 10,
          verified: 1
        });
      }
    }

    // Query for inception/founding date (P571) - but only if we didn't find independence
    if (results.length === 0) {
      const inceptionQuery = `
        SELECT ?value ?label WHERE {
          wd:${qid} wdt:P571 ?value.
          OPTIONAL { wd:${qid} rdfs:label ?label. FILTER(LANG(?label) = "en") }
        }
        LIMIT 1
      `;

      const inceptionData = await executeSparqlQuery(inceptionQuery);
      if (inceptionData.results?.bindings?.length > 0) {
        const binding = inceptionData.results.bindings[0];
        const dateValue = binding.value.value;
        const date = new Date(dateValue);
        const year = date.getFullYear();
        
        // Skip if year is invalid (NaN)
        if (!isNaN(year)) {
          const event_date = dateValue.split('T')[0]; // Extract YYYY-MM-DD

          results.push({
            entity: countryName,
            entity_type: 'country',
            event_year: year,
            event_date,
            event_type: 'founding',
            title: `Founding of ${countryName}`,
            description: `${countryName} was founded on ${event_date}.`,
            source_name: 'www.wikidata.org',
            source_url: `https://www.wikidata.org/wiki/${qid}#P571`,
            importance: 10,
            verified: 1
          });
        }
      }
    }

    // Query for significant events (P793)
    const eventsQuery = `
      SELECT ?event ?eventLabel ?pointInTime WHERE {
        wd:${qid} p:P793 ?statement.
        ?statement ps:P793 ?event.
        OPTIONAL { ?statement pq:P585 ?pointInTime. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 10
    `;

    const eventsData = await executeSparqlQuery(eventsQuery);
    if (eventsData.results?.bindings?.length > 0) {
      for (const binding of eventsData.results.bindings) {
        const eventLabel = binding.eventLabel?.value;
        const pointInTime = binding.pointInTime?.value;

        if (eventLabel && pointInTime) {
          const date = new Date(pointInTime);
          const year = date.getFullYear();
          
          // Skip if year is invalid (NaN)
          if (isNaN(year)) {
            console.warn(`Invalid date for event "${eventLabel}" in ${countryName}: ${pointInTime}`);
            continue;
          }
          
          const event_date = pointInTime.split('T')[0];

          // Categorize event type based on label keywords
          let eventType = 'other';
          let importance = 6; // Default medium importance

          const labelLower = eventLabel.toLowerCase();
          if (labelLower.includes('war') || labelLower.includes('battle')) {
            eventType = 'war';
            importance = 9;
          } else if (labelLower.includes('revolution')) {
            eventType = 'revolution';
            importance = 9;
          } else if (labelLower.includes('treaty') || labelLower.includes('agreement')) {
            eventType = 'treaty';
            importance = 7;
          } else if (labelLower.includes('independence')) {
            eventType = 'independence';
            importance = 10;
          } else if (labelLower.includes('unification') || labelLower.includes('reunification')) {
            eventType = 'unification';
            importance = 9;
          } else if (labelLower.includes('liberation')) {
            eventType = 'liberation';
            importance = 8;
          }

          results.push({
            entity: countryName,
            entity_type: 'country',
            event_year: year,
            event_date,
            event_type: eventType,
            title: eventLabel,
            description: `${eventLabel} occurred in ${countryName} on ${event_date}.`,
            source_name: 'www.wikidata.org',
            source_url: `https://www.wikidata.org/wiki/${qid}#P793`,
            importance,
            verified: 1
          });
        }
      }
    }

    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));

  } catch (error: any) {
    console.error(`Error fetching events for ${countryName}:`, error.message);
  }

  return results;
}

/**
 * Fetch historical events from Wikidata for specified countries
 * @param countryNames Array of country names to fetch events for
 * @returns Array of historical events
 */
export async function fetchHistoricalEvents(countryNames: string[]): Promise<HistoricalEventResult[]> {
  const allEvents: HistoricalEventResult[] = [];

  for (const countryName of countryNames) {
    const qid = COUNTRY_QIDS[countryName];
    if (!qid) {
      console.warn(`No Wikidata QID found for ${countryName}`);
      continue;
    }

    console.log(`Fetching historical events for ${countryName} (${qid})...`);
    const events = await fetchCountryEvents(countryName, qid);
    allEvents.push(...events);
  }

  return allEvents;
}

/**
 * Get all available country names
 */
export function getAvailableCountries(): string[] {
  return Object.keys(COUNTRY_QIDS).sort();
}
