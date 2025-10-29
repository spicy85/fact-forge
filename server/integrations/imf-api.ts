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
export const IFS_INDICATORS = {
  GDP_CURRENT: 'NGDP_XDC',           // Nominal GDP in domestic currency
  INFLATION: 'PCPI_IX',              // Consumer Price Index
  UNEMPLOYMENT: 'LUR_PT',            // Unemployment rate (percent)
};

// IMF WEO (World Economic Outlook) Indicator Codes
export const WEO_INDICATORS = {
  GDP_GROWTH: 'NGDP_RPCH',           // Real GDP growth (% change)
  GDP_USD: 'NGDPD',                  // GDP in current USD
  GOVT_DEBT: 'GGXWDG_NGDP',         // General government gross debt (% GDP)
  FISCAL_BALANCE: 'GGXCNL_NGDP',    // Government net lending/borrowing (% GDP)
  CURRENT_ACCOUNT: 'BCA_NGDPD',     // Current account balance (% GDP)
  GOVT_REVENUE: 'GGR_NGDP',         // General government revenue (% GDP)
  GOVT_EXPENDITURE: 'GGX_NGDP',     // General government total expenditure (% GDP)
};

// Legacy export for backwards compatibility
export const INDICATORS = IFS_INDICATORS;

/**
 * Generic function to fetch any IMF IFS indicator
 */
export async function fetchIMFIndicator(
  countryName: string,
  indicatorCode: string,
  indicatorName: string,
  startYear: number = 2020,
  endYear: number = 2024
): Promise<IMFResponse> {
  return fetchIMFData('IFS', countryName, indicatorCode, indicatorName, startYear, endYear);
}

/**
 * Generic function to fetch any IMF WEO indicator
 */
export async function fetchWEOIndicator(
  countryName: string,
  indicatorCode: string,
  indicatorName: string,
  startYear: number = 2020,
  endYear: number = 2024
): Promise<IMFResponse> {
  return fetchIMFData('WEO', countryName, indicatorCode, indicatorName, startYear, endYear);
}

/**
 * Generic function to fetch data from any IMF database (IFS or WEO)
 */
async function fetchIMFData(
  database: 'IFS' | 'WEO',
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

    // Format: CompactData/{DATABASE}/A.{COUNTRY}.{INDICATOR}
    // A = Annual frequency
    const url = `${IMF_BASE_URL}/CompactData/${database}/A.${countryCode}.${indicatorCode}`;
    
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
    console.error(`Error fetching ${database} ${indicatorName} for ${countryName}:`, error.message);
    
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
  return fetchIMFIndicator(countryName, IFS_INDICATORS.INFLATION, 'inflation_rate');
}

export async function fetchIMFUnemployment(countryName: string): Promise<IMFResponse> {
  return fetchIMFIndicator(countryName, IFS_INDICATORS.UNEMPLOYMENT, 'unemployment_rate');
}

// WEO-specific fetch functions
export async function fetchWEOGDPGrowth(countryName: string): Promise<IMFResponse> {
  return fetchWEOIndicator(countryName, WEO_INDICATORS.GDP_GROWTH, 'gdp_growth_rate');
}

export async function fetchWEOGDPUSD(countryName: string): Promise<IMFResponse> {
  return fetchWEOIndicator(countryName, WEO_INDICATORS.GDP_USD, 'gdp_usd');
}

export async function fetchWEOGovtDebt(countryName: string): Promise<IMFResponse> {
  return fetchWEOIndicator(countryName, WEO_INDICATORS.GOVT_DEBT, 'government_debt');
}

export async function fetchWEOFiscalBalance(countryName: string): Promise<IMFResponse> {
  return fetchWEOIndicator(countryName, WEO_INDICATORS.FISCAL_BALANCE, 'fiscal_balance');
}

export async function fetchWEOCurrentAccount(countryName: string): Promise<IMFResponse> {
  return fetchWEOIndicator(countryName, WEO_INDICATORS.CURRENT_ACCOUNT, 'current_account_balance');
}

export async function fetchWEOGovtRevenue(countryName: string): Promise<IMFResponse> {
  return fetchWEOIndicator(countryName, WEO_INDICATORS.GOVT_REVENUE, 'government_revenue');
}

export async function fetchWEOGovtExpenditure(countryName: string): Promise<IMFResponse> {
  return fetchWEOIndicator(countryName, WEO_INDICATORS.GOVT_EXPENDITURE, 'government_expenditure');
}

/**
 * Fetch all available IMF indicators for a country (both IFS and WEO)
 */
export async function fetchAllIMFIndicatorsForCountry(
  countryName: string,
  startYear: number = 2020,
  endYear: number = 2024
): Promise<Map<string, IMFEconomicData[]>> {
  const results = new Map<string, IMFEconomicData[]>();
  
  // IFS indicators (database: IFS)
  const ifsIndicatorList = [
    { code: IFS_INDICATORS.GDP_CURRENT, name: 'gdp', database: 'IFS' as const },
    { code: IFS_INDICATORS.INFLATION, name: 'inflation_rate', database: 'IFS' as const },
    { code: IFS_INDICATORS.UNEMPLOYMENT, name: 'unemployment_rate', database: 'IFS' as const },
  ];

  // WEO indicators (database: WEO)
  const weoIndicatorList = [
    { code: WEO_INDICATORS.GDP_GROWTH, name: 'gdp_growth_rate', database: 'WEO' as const },
    { code: WEO_INDICATORS.GDP_USD, name: 'gdp_usd', database: 'WEO' as const },
    { code: WEO_INDICATORS.GOVT_DEBT, name: 'government_debt', database: 'WEO' as const },
    { code: WEO_INDICATORS.FISCAL_BALANCE, name: 'fiscal_balance', database: 'WEO' as const },
    { code: WEO_INDICATORS.CURRENT_ACCOUNT, name: 'current_account_balance', database: 'WEO' as const },
    { code: WEO_INDICATORS.GOVT_REVENUE, name: 'government_revenue', database: 'WEO' as const },
    { code: WEO_INDICATORS.GOVT_EXPENDITURE, name: 'government_expenditure', database: 'WEO' as const },
  ];

  const allIndicators = [...ifsIndicatorList, ...weoIndicatorList];

  for (const { code, name, database } of allIndicators) {
    const response = await fetchIMFData(database, countryName, code, name, startYear, endYear);
    
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
    
    // IFS indicators
    const gdpResponse = await fetchIMFGDP(country);
    const inflationResponse = await fetchIMFInflation(country);
    const unemploymentResponse = await fetchIMFUnemployment(country);
    
    // WEO indicators
    const gdpGrowthResponse = await fetchWEOGDPGrowth(country);
    const gdpUsdResponse = await fetchWEOGDPUSD(country);
    const govtDebtResponse = await fetchWEOGovtDebt(country);
    const fiscalBalanceResponse = await fetchWEOFiscalBalance(country);
    const currentAccountResponse = await fetchWEOCurrentAccount(country);
    const govtRevenueResponse = await fetchWEOGovtRevenue(country);
    const govtExpenditureResponse = await fetchWEOGovtExpenditure(country);
    
    const allData: IMFEconomicData[] = [];
    
    // Add IFS data
    if (gdpResponse.success && gdpResponse.data) {
      allData.push(...gdpResponse.data);
    }
    
    if (inflationResponse.success && inflationResponse.data) {
      allData.push(...inflationResponse.data);
    }

    if (unemploymentResponse.success && unemploymentResponse.data) {
      allData.push(...unemploymentResponse.data);
    }
    
    // Add WEO data
    if (gdpGrowthResponse.success && gdpGrowthResponse.data) {
      allData.push(...gdpGrowthResponse.data);
    }
    
    if (gdpUsdResponse.success && gdpUsdResponse.data) {
      allData.push(...gdpUsdResponse.data);
    }
    
    if (govtDebtResponse.success && govtDebtResponse.data) {
      allData.push(...govtDebtResponse.data);
    }
    
    if (fiscalBalanceResponse.success && fiscalBalanceResponse.data) {
      allData.push(...fiscalBalanceResponse.data);
    }
    
    if (currentAccountResponse.success && currentAccountResponse.data) {
      allData.push(...currentAccountResponse.data);
    }
    
    if (govtRevenueResponse.success && govtRevenueResponse.data) {
      allData.push(...govtRevenueResponse.data);
    }
    
    if (govtExpenditureResponse.success && govtExpenditureResponse.data) {
      allData.push(...govtExpenditureResponse.data);
    }
    
    if (allData.length > 0) {
      results.set(country, allData);
    }
    
    // Rate limiting - wait 1 second between countries
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}
