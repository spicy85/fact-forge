import axios from 'axios';

const IMF_BASE_URL = 'http://dataservices.imf.org/REST/SDMX_JSON.svc';

export interface IMFEconomicData {
  country: string;
  year: number;
  value: number;
  indicator: string;
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
    // Format: CompactData/{database}/{freq}.{country}.{indicator}.
    const url = `${IMF_BASE_URL}/CompactData/IFS/A.${countryCode}.NGDP_XDC.`;
    
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

    const data = observations.map(obs => ({
      country: countryName,
      year: parseInt(obs.year),
      value: obs.value,
      indicator: 'gdp'
    }));

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
  try {
    const countryCode = COUNTRY_ISO_MAP[countryName];
    
    if (!countryCode) {
      return {
        success: false,
        error: `Country ISO code not found for ${countryName}`
      };
    }

    // Fetch Consumer Price Index (PCPI_IX)
    const url = `${IMF_BASE_URL}/CompactData/IFS/A.${countryCode}.PCPI_IX.`;
    
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
        error: `No inflation data found for ${countryName}`
      };
    }

    const data = observations.map(obs => ({
      country: countryName,
      year: parseInt(obs.year),
      value: obs.value,
      indicator: 'inflation'
    }));

    return {
      success: true,
      data
    };

  } catch (error: any) {
    console.error(`Error fetching IMF inflation for ${countryName}:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
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

export async function fetchIMFDataForAllCountries(): Promise<Map<string, IMFEconomicData[]>> {
  const results = new Map<string, IMFEconomicData[]>();
  
  const countries = Object.keys(COUNTRY_ISO_MAP);
  
  for (const country of countries) {
    console.log(`Fetching IMF data for ${country}...`);
    
    const gdpResponse = await fetchIMFGDP(country);
    const inflationResponse = await fetchIMFInflation(country);
    
    const allData: IMFEconomicData[] = [];
    
    if (gdpResponse.success && gdpResponse.data) {
      allData.push(...gdpResponse.data);
    }
    
    if (inflationResponse.success && inflationResponse.data) {
      allData.push(...inflationResponse.data);
    }
    
    if (allData.length > 0) {
      results.set(country, allData);
    }
    
    // Rate limiting - wait 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}
