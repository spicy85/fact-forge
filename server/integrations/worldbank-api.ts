import axios from 'axios';

const WORLD_BANK_BASE_URL = 'https://api.worldbank.org/v2';

export interface WorldBankData {
  country: string;
  year: number;
  value: number;
  indicator: string;
  indicatorName: string;
}

export interface WorldBankResponse {
  success: boolean;
  data?: WorldBankData[];
  error?: string;
}

const COUNTRY_ISO_MAP: Record<string, string> = {
  'United States': 'US',
  'Canada': 'CA',
  'Mexico': 'MX',
  'Brazil': 'BR',
  'Argentina': 'AR',
  'Chile': 'CL',
  'Colombia': 'CO',
  'Paraguay': 'PY',
  'People\'s Republic of China': 'CN',
  'India': 'IN',
  'Japan': 'JP',
  'South Korea': 'KR',
  'Indonesia': 'ID',
  'Thailand': 'TH',
  'Vietnam': 'VN',
  'Philippines': 'PH',
  'Malaysia': 'MY',
  'Singapore': 'SG',
  'Bangladesh': 'BD',
  'Pakistan': 'PK',
  'Germany': 'DE',
  'France': 'FR',
  'United Kingdom': 'GB',
  'Italy': 'IT',
  'Spain': 'ES',
  'Kingdom of the Netherlands': 'NL',
  'Belgium': 'BE',
  'Switzerland': 'CH',
  'Austria': 'AT',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Denmark': 'DK',
  'Finland': 'FI',
  'Poland': 'PL',
  'Czech Republic': 'CZ',
  'Greece': 'GR',
  'Portugal': 'PT',
  'Hungary': 'HU',
  'Romania': 'RO',
  'Ireland': 'IE',
  'Russia': 'RU',
  'Turkey': 'TR',
  'Israel': 'IL',
  'Saudi Arabia': 'SA',
  'Egypt': 'EG',
  'South Africa': 'ZA',
  'Nigeria': 'NG',
  'Australia': 'AU',
  'New Zealand': 'NZ'
};

// World Bank Indicator Codes
export const INDICATORS = {
  POPULATION: 'SP.POP.TOTL',           // Total population
  GDP_CURRENT: 'NY.GDP.MKTP.CD',       // GDP (current US$)
  GDP_PER_CAPITA: 'NY.GDP.PCAP.CD',    // GDP per capita (current US$)
  LAND_AREA: 'AG.LND.TOTL.K2',         // Land area (sq. km)
  INFLATION: 'FP.CPI.TOTL.ZG',         // Inflation, consumer prices (annual %)
  LIFE_EXPECTANCY: 'SP.DYN.LE00.IN',   // Life expectancy at birth
  UNEMPLOYMENT: 'SL.UEM.TOTL.ZS',      // Unemployment, total (% of total labor force)
};

export async function fetchWorldBankIndicator(
  countryName: string,
  indicatorCode: string,
  indicatorName: string
): Promise<WorldBankResponse> {
  try {
    const countryCode = COUNTRY_ISO_MAP[countryName];
    
    if (!countryCode) {
      return {
        success: false,
        error: `Country ISO code not found for ${countryName}`
      };
    }

    // Format: /v2/country/{country}/indicator/{indicator}?format=json&date=2020:2024
    const url = `${WORLD_BANK_BASE_URL}/country/${countryCode}/indicator/${indicatorCode}`;
    
    const response = await axios.get(url, {
      params: {
        format: 'json',
        date: '2020:2024',
        per_page: 100
      },
      headers: {
        'User-Agent': 'FactCheckerApp/1.0'
      },
      timeout: 15000
    });

    // World Bank returns [metadata, data] array
    const [metadata, observations] = response.data;
    
    if (!observations || observations.length === 0) {
      return {
        success: false,
        error: `No data found for ${countryName} - ${indicatorName}`
      };
    }

    // Filter out null values and map to our format
    const data = observations
      .filter((obs: any) => obs.value !== null)
      .map((obs: any) => ({
        country: countryName,
        year: parseInt(obs.date),
        value: obs.value,
        indicator: indicatorCode,
        indicatorName: indicatorName
      }));

    if (data.length === 0) {
      return {
        success: false,
        error: `No valid data found for ${countryName} - ${indicatorName}`
      };
    }

    return {
      success: true,
      data
    };

  } catch (error: any) {
    console.error(`Error fetching World Bank data for ${countryName}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function fetchAllIndicatorsForCountry(
  countryName: string
): Promise<Map<string, WorldBankData[]>> {
  const results = new Map<string, WorldBankData[]>();
  
  const indicatorList = [
    { code: INDICATORS.POPULATION, name: 'population' },
    { code: INDICATORS.GDP_CURRENT, name: 'gdp' },
    { code: INDICATORS.GDP_PER_CAPITA, name: 'gdp_per_capita' },
    { code: INDICATORS.LAND_AREA, name: 'area' },
    { code: INDICATORS.INFLATION, name: 'inflation' },
  ];

  for (const { code, name } of indicatorList) {
    const response = await fetchWorldBankIndicator(countryName, code, name);
    
    if (response.success && response.data) {
      results.set(name, response.data);
    }
    
    // Rate limiting - wait 200ms between requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return results;
}

export async function fetchWorldBankDataForAllCountries(): Promise<Map<string, Map<string, WorldBankData[]>>> {
  const results = new Map<string, Map<string, WorldBankData[]>>();
  
  const countries = Object.keys(COUNTRY_ISO_MAP);
  
  for (const country of countries) {
    console.log(`Fetching World Bank data for ${country}...`);
    
    const countryData = await fetchAllIndicatorsForCountry(country);
    
    if (countryData.size > 0) {
      results.set(country, countryData);
    }
    
    // Rate limiting between countries - wait 500ms
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}
