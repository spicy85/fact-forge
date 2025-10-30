/**
 * Country name to ISO 3166-1 alpha-2 code mapping
 * Used for World Bank API and other services that require ISO country codes
 */
export const COUNTRY_ISO_MAP: Record<string, string> = {
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

/**
 * Convert a country name to its ISO code
 * @param countryName - Full country name
 * @returns ISO code or undefined if not found
 */
export function getCountryISOCode(countryName: string): string | undefined {
  return COUNTRY_ISO_MAP[countryName];
}
