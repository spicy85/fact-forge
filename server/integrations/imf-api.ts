import axios from 'axios';

const IMF_BASE_URL = 'http://dataservices.imf.org/REST/SDMX_JSON.svc';

export interface IMFEconomicData {
  country: string;
  year: number;
  value: number;
  indicator: string;
  indicatorName: string;
  as_of_date: string; // ISO date string YYYY-MM-DD
}

export interface IMFResponse {
  success: boolean;
  data?: IMFEconomicData[];
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

// IMF IFS (International Financial Statistics) Indicator Codes
export const INDICATORS = {
  GDP_CURRENT: 'NGDP_XDC',           // Nominal GDP in domestic currency
  INFLATION: 'PCPI_IX',              // Consumer Price Index
  UNEMPLOYMENT: 'LUR_PT',            // Unemployment rate (percent)
  // Note: Debt to GDP is typically in Fiscal Monitor or WEO, not IFS
};

/**
 * Generic function to fetch any IMF indicator
 */
export async function fetchIMFIndicator(
  countryName: string,
  indicatorCode: string,
  indicatorName: string,
  startYear: number = 2020,
  endYear: number = 2024
): Promise<IMFResponse> {
  try {
    const countryCode = COUNTRY_ISO_MAP[countryName];
    
    if (!countryCode) {
      return {
        success: false,
        error: `Country ISO code not found for ${countryName}`
      };
    }

    // Format: CompactData/IFS/A.{COUNTRY}.{INDICATOR}
    // A = Annual frequency
    const url = `${IMF_BASE_URL}/CompactData/IFS/A.${countryCode}.${indicatorCode}`;
    
    const response = await axios.get(url, {
      params: {
        startPeriod: startYear.toString(),
        endPeriod: endYear.toString()
      },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FactCheckerApp/1.0'
      },
      timeout: 60000
    });

    const observations = extractIMFObservations(response.data);
    
    if (observations.length === 0) {
      return {
        success: false,
        error: `No ${indicatorName} data found for ${countryName}`
      };
    }

    const data = observations.map(obs => {
      const year = parseInt(obs.year);
      // For annual frequency data (A), we use January 1st of the year as the as_of_date
      // This is consistent with how we handle annual data from other sources
      return {
        country: countryName,
        year,
        value: obs.value,
        indicator: indicatorCode,
        indicatorName: indicatorName,
        as_of_date: `${year}-01-01`
      };
    });

    return {
      success: true,
      data
    };

  } catch (error: any) {
    console.error(`Error fetching IMF ${indicatorName} for ${countryName}:`, error.message);
    
    // Check for specific error patterns
    if (error.response?.status === 404) {
      return {
        success: false,
        error: `Indicator ${indicatorCode} not available for ${countryName}`
      };
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

export async function fetchIMFGDP(countryName: string): Promise<IMFResponse> {
  try {
    const countryCode = COUNTRY_ISO_MAP[countryName];
    
    if (!countryCode) {
      return {
        success: false,
        error: `Country ISO code not found for ${countryName}`
      };
    }

    // Fetch nominal GDP in national currency (NGDP_XDC)
    // Using annual frequency (A)
    // Format: CompactData/{database}/{freq}.{country}.{indicator}
    const url = `${IMF_BASE_URL}/CompactData/IFS/A.${countryCode}.NGDP_XDC`;
    
    const response = await axios.get(url, {
      params: {
        startPeriod: '2020',
        endPeriod: '2024'
      },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FactCheckerApp/1.0'
      },
      timeout: 60000
    });

    const observations = extractIMFObservations(response.data);
    
    if (observations.length === 0) {
      return {
        success: false,
        error: `No GDP data found for ${countryName}`
      };
    }

    const data = observations.map(obs => {
      const year = parseInt(obs.year);
      return {
        country: countryName,
        year,
        value: obs.value,
        indicator: 'NGDP_XDC',
        indicatorName: 'gdp',
        as_of_date: `${year}-01-01`
      };
    });

    return {
      success: true,
      data
    };

  } catch (error: any) {
    console.error(`Error fetching IMF data for ${countryName}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function fetchIMFInflation(countryName: string): Promise<IMFResponse> {
  return fetchIMFIndicator(countryName, INDICATORS.INFLATION, 'inflation_rate');
}

export async function fetchIMFUnemployment(countryName: string): Promise<IMFResponse> {
  return fetchIMFIndicator(countryName, INDICATORS.UNEMPLOYMENT, 'unemployment_rate');
}

/**
 * Fetch all available IMF indicators for a country
 */
export async function fetchAllIMFIndicatorsForCountry(
  countryName: string,
  startYear: number = 2020,
  endYear: number = 2024
): Promise<Map<string, IMFEconomicData[]>> {
  const results = new Map<string, IMFEconomicData[]>();
  
  const indicatorList = [
    { code: INDICATORS.GDP_CURRENT, name: 'gdp' },
    { code: INDICATORS.INFLATION, name: 'inflation_rate' },
    { code: INDICATORS.UNEMPLOYMENT, name: 'unemployment_rate' },
  ];

  for (const { code, name } of indicatorList) {
    const response = await fetchIMFIndicator(countryName, code, name, startYear, endYear);
    
    if (response.success && response.data) {
      results.set(name, response.data);
    }
    
    // Rate limiting - wait 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}

function extractIMFObservations(imfData: any): Array<{ year: string; value: number }> {
  try {
    const series = imfData?.CompactData?.DataSet?.Series;
    
    if (!series) {
      return [];
    }

    const obs = series.Obs;
    
    if (!obs) {
      return [];
    }

    const observations = Array.isArray(obs) ? obs : [obs];
    const results: Array<{ year: string; value: number }> = [];

    for (const observation of observations) {
      const year = observation['@TIME_PERIOD'];
      const value = parseFloat(observation['@OBS_VALUE']);
      
      if (year && !isNaN(value)) {
        results.push({ year, value });
      }
    }

    return results;
  } catch (error) {
    console.error('Error extracting IMF observations:', error);
    return [];
  }
}

/**
 * Fetch IMF data for multiple countries
 */
export async function fetchIMFDataForCountries(
  countries: string[],
  startYear: number = 2020,
  endYear: number = 2024
): Promise<Map<string, Map<string, IMFEconomicData[]>>> {
  const results = new Map<string, Map<string, IMFEconomicData[]>>();
  
  for (const country of countries) {
    console.log(`Fetching IMF data for ${country}...`);
    
    const countryData = await fetchAllIMFIndicatorsForCountry(country, startYear, endYear);
    
    if (countryData.size > 0) {
      results.set(country, countryData);
    }
    
    // Rate limiting between countries - wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}

export async function fetchIMFDataForAllCountries(): Promise<Map<string, IMFEconomicData[]>> {
  const results = new Map<string, IMFEconomicData[]>();
  
  const countries = Object.keys(COUNTRY_ISO_MAP);
  
  for (const country of countries) {
    console.log(`Fetching IMF data for ${country}...`);
    
    const gdpResponse = await fetchIMFGDP(country);
    const inflationResponse = await fetchIMFInflation(country);
    const unemploymentResponse = await fetchIMFUnemployment(country);
    
    const allData: IMFEconomicData[] = [];
    
    if (gdpResponse.success && gdpResponse.data) {
      allData.push(...gdpResponse.data);
    }
    
    if (inflationResponse.success && inflationResponse.data) {
      allData.push(...inflationResponse.data);
    }

    if (unemploymentResponse.success && unemploymentResponse.data) {
      allData.push(...unemploymentResponse.data);
    }
    
    if (allData.length > 0) {
      results.set(country, allData);
    }
    
    // Rate limiting - wait 1 second between countries
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}
