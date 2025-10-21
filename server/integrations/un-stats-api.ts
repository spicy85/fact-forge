import axios from 'axios';

const UN_STATS_BASE_URL = 'http://data.un.org/WS/rest';

export interface UNStatsPopulationData {
  country: string;
  year: number;
  value: number;
  indicator: string;
}

export interface UNStatsResponse {
  success: boolean;
  data?: UNStatsPopulationData[];
  error?: string;
}

const COUNTRY_CODE_MAP: Record<string, string> = {
  'United States': '840',
  'Canada': '124',
  'Mexico': '484',
  'Brazil': '076',
  'Argentina': '032',
  'Chile': '152',
  'Colombia': '170',
  'Paraguay': '600',
  'People\'s Republic of China': '156',
  'India': '356',
  'Japan': '392',
  'South Korea': '410',
  'Indonesia': '360',
  'Thailand': '764',
  'Vietnam': '704',
  'Philippines': '608',
  'Malaysia': '458',
  'Singapore': '702',
  'Bangladesh': '050',
  'Pakistan': '586',
  'Germany': '276',
  'France': '250',
  'United Kingdom': '826',
  'Italy': '380',
  'Spain': '724',
  'Kingdom of the Netherlands': '528',
  'Belgium': '056',
  'Switzerland': '756',
  'Austria': '040',
  'Sweden': '752',
  'Norway': '578',
  'Denmark': '208',
  'Finland': '246',
  'Poland': '616',
  'Czech Republic': '203',
  'Greece': '300',
  'Portugal': '620',
  'Hungary': '348',
  'Romania': '642',
  'Ireland': '372',
  'Russia': '643',
  'Turkey': '792',
  'Israel': '376',
  'Saudi Arabia': '682',
  'Egypt': '818',
  'South Africa': '710',
  'Nigeria': '566',
  'Australia': '036',
  'New Zealand': '554'
};

export async function fetchUNPopulation(countryName: string): Promise<UNStatsResponse> {
  try {
    const countryCode = COUNTRY_CODE_MAP[countryName];
    
    if (!countryCode) {
      return {
        success: false,
        error: `Country code not found for ${countryName}`
      };
    }

    // Using SDG Global Database (DF_SDG_GLH) with population indicators
    // Format: /data/{dataflow}/.{indicator}.{country}
    // SP_POP_TOTL = Total population
    const url = `${UN_STATS_BASE_URL}/data/DF_SDG_GLH/..SP_POP_TOTL.${countryCode}`;
    
    const response = await axios.get(url, {
      params: {
        format: 'sdmx-json',
        startPeriod: '2020',
        endPeriod: '2024'
      },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FactCheckerApp/1.0'
      },
      timeout: 60000
    });

    const observations = extractObservations(response.data);
    
    if (observations.length === 0) {
      return {
        success: false,
        error: `No population data found for ${countryName}`
      };
    }

    const data = observations.map(obs => ({
      country: countryName,
      year: parseInt(obs.year),
      value: obs.value,
      indicator: 'population'
    }));

    return {
      success: true,
      data
    };

  } catch (error: any) {
    console.error(`Error fetching UN Stats data for ${countryName}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

function extractObservations(sdmxData: any): Array<{ year: string; value: number }> {
  try {
    const dataSets = sdmxData?.data?.dataSets;
    
    if (!dataSets || dataSets.length === 0) {
      return [];
    }

    const observations = dataSets[0]?.observations;
    const structure = sdmxData?.data?.structure;
    
    if (!observations || !structure) {
      return [];
    }

    const timeDimension = structure.dimensions.observation.find((d: any) => 
      d.id === 'TIME_PERIOD' || d.id.includes('TIME')
    );

    if (!timeDimension) {
      return [];
    }

    const timeValues = timeDimension.values;
    const results: Array<{ year: string; value: number }> = [];

    for (const [key, values] of Object.entries(observations)) {
      const indices = key.split(':').map(Number);
      const timeIndex = indices[indices.length - 1];
      
      if (timeValues[timeIndex]) {
        const year = timeValues[timeIndex].id;
        const value = Array.isArray(values) ? values[0] : (values as any);
        
        if (typeof value === 'number' && !isNaN(value)) {
          results.push({
            year,
            value: Math.round(value * 1000)
          });
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Error extracting observations:', error);
    return [];
  }
}

export async function fetchUNStatsForAllCountries(): Promise<Map<string, UNStatsPopulationData[]>> {
  const results = new Map<string, UNStatsPopulationData[]>();
  
  const countries = Object.keys(COUNTRY_CODE_MAP);
  
  for (const country of countries) {
    console.log(`Fetching UN Stats data for ${country}...`);
    const response = await fetchUNPopulation(country);
    
    if (response.success && response.data) {
      results.set(country, response.data);
    }
    
    // Rate limiting - wait 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}
