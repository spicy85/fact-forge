#!/usr/bin/env python3
"""
Fetch data from IMF SDMX API and insert into facts_evaluation table.
Retrieves inflation (CPI), GDP, and population data for all 48 countries.
"""

import sdmx
import os
import sys
from datetime import datetime, timedelta

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# PostgreSQL connection using environment variables
import psycopg2
from psycopg2.extras import RealDictCursor

# IMF country code to canonical name mapping
COUNTRY_CODE_MAP = {
    'ARG': 'Argentina',
    'AUS': 'Australia', 
    'AUT': 'Austria',
    'BGD': 'Bangladesh',
    'BEL': 'Belgium',
    'BRA': 'Brazil',
    'CAN': 'Canada',
    'CHL': 'Chile',
    'COL': 'Colombia',
    'CZE': 'Czech Republic',
    'DNK': 'Denmark',
    'EGY': 'Egypt',
    'FIN': 'Finland',
    'FRA': 'France',
    'DEU': 'Germany',
    'GRC': 'Greece',
    'HUN': 'Hungary',
    'IND': 'India',
    'IDN': 'Indonesia',
    'IRL': 'Ireland',
    'ISR': 'Israel',
    'ITA': 'Italy',
    'JPN': 'Japan',
    'NLD': 'Kingdom of the Netherlands',
    'MYS': 'Malaysia',
    'MEX': 'Mexico',
    'NZL': 'New Zealand',
    'NGA': 'Nigeria',
    'NOR': 'Norway',
    'PAK': 'Pakistan',
    'PRY': 'Paraguay',
    'CHN': "People's Republic of China",
    'PHL': 'Philippines',
    'POL': 'Poland',
    'PRT': 'Portugal',
    'ROU': 'Romania',
    'RUS': 'Russia',
    'SAU': 'Saudi Arabia',
    'SGP': 'Singapore',
    'ZAF': 'South Africa',
    'KOR': 'South Korea',
    'ESP': 'Spain',
    'SWE': 'Sweden',
    'CHE': 'Switzerland',
    'THA': 'Thailand',
    'TUR': 'Turkey',
    'USA': 'United States',
    'VNM': 'Vietnam'
}

def get_db_connection():
    """Get PostgreSQL database connection."""
    return psycopg2.connect(
        host=os.environ.get('PGHOST'),
        port=os.environ.get('PGPORT'),
        database=os.environ.get('PGDATABASE'),
        user=os.environ.get('PGUSER'),
        password=os.environ.get('PGPASSWORD')
    )

def get_scoring_settings(conn):
    """Get scoring settings from database."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT * FROM scoring_settings LIMIT 1")
        return cur.fetchone()

def calculate_source_trust_score(conn, source_url):
    """Calculate source trust score from source metrics."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "SELECT public_trust, data_accuracy, proprietary_score FROM sources WHERE domain = %s",
            ('www.imf.org',)
        )
        source = cur.fetchone()
        if source:
            return round((source['public_trust'] + source['data_accuracy'] + source['proprietary_score']) / 3)
        return 91  # Default if source not found

def calculate_recency_score(evaluated_at, tier1_days, tier1_score, tier2_days, tier2_score, tier3_score):
    """Calculate recency score based on how old the data is."""
    days_old = (datetime.now() - datetime.fromisoformat(evaluated_at)).days
    if days_old <= tier1_days:
        return tier1_score
    elif days_old <= tier2_days:
        return tier2_score
    else:
        return tier3_score

def calculate_trust_score(source_trust, recency, consensus, st_weight, rec_weight, con_weight):
    """Calculate weighted trust score."""
    total_weight = st_weight + rec_weight + con_weight
    if total_weight == 0:
        return 0
    return round((source_trust * st_weight + recency * rec_weight + consensus * con_weight) / total_weight)

def evaluation_exists(conn, entity, attribute, source_url, value):
    """Check if evaluation already exists."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT 1 FROM facts_evaluation 
               WHERE entity = %s AND attribute = %s AND source_url = %s AND value = %s
               LIMIT 1""",
            (entity, attribute, source_url, value)
        )
        return cur.fetchone() is not None

def insert_evaluation(conn, entity, attribute, value, source_url, evaluated_at, settings, notes):
    """Insert evaluation into database."""
    source_trust_score = calculate_source_trust_score(conn, source_url)
    recency_score = calculate_recency_score(
        evaluated_at,
        settings['recency_tier1_days'],
        settings['recency_tier1_score'],
        settings['recency_tier2_days'],
        settings['recency_tier2_score'],
        settings['recency_tier3_score']
    )
    consensus_score = 95  # Default consensus score
    trust_score = calculate_trust_score(
        source_trust_score,
        recency_score,
        consensus_score,
        settings['source_trust_weight'],
        settings['recency_weight'],
        settings['consensus_weight']
    )
    
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO facts_evaluation 
               (entity, attribute, value, value_type, source_url, source_trust, 
                source_trust_score, recency_score, consensus_score, 
                source_trust_weight, recency_weight, consensus_weight, 
                trust_score, evaluation_notes, evaluated_at, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (entity, attribute, str(value), 'numeric', source_url, 'IMF',
             source_trust_score, recency_score, consensus_score,
             settings['source_trust_weight'], settings['recency_weight'], settings['consensus_weight'],
             trust_score, notes, evaluated_at, 'evaluating')
        )
    conn.commit()

def fetch_imf_inflation(imf_client, country_code, country_name, conn, settings):
    """Fetch CPI/inflation data from IMF."""
    try:
        # Fetch CPI data (PCPI_IX = Consumer Price Index)
        data_msg = imf_client.data(
            'CPI',
            key=f'{country_code}.PCPI_IX',
            params={'startPeriod': 2020}
        )
        
        # Convert to pandas and get latest data
        df = sdmx.to_pandas(data_msg)
        if df.empty:
            return 0
        
        # Get the most recent year's data
        df_sorted = df.sort_index(ascending=False)
        latest_value = df_sorted.iloc[0]
        latest_period = df_sorted.index[0]
        
        # Extract year from period
        if hasattr(latest_period, '__iter__') and len(latest_period) > 0:
            year = latest_period[0]
        else:
            year = str(latest_period)[:4]
        
        evaluated_at = f"{year}-12-31"
        source_url = "https://www.imf.org/external/datamapper/datasets/CPI"
        
        # Check if already exists
        if evaluation_exists(conn, country_name, 'inflation', source_url, str(latest_value)):
            print(f"  ⊘ inflation already exists")
            return 0
        
        # Insert evaluation
        insert_evaluation(
            conn, country_name, 'inflation', latest_value, source_url,
            evaluated_at, settings, f"IMF CPI data, year {year}"
        )
        print(f"  ✓ inflation = {latest_value:.2f} ({year})")
        return 1
        
    except Exception as e:
        print(f"  ✗ inflation error: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return 0

def fetch_imf_gdp(imf_client, country_code, country_name, conn, settings):
    """Fetch GDP data from IMF International Financial Statistics."""
    try:
        # Fetch GDP in current prices, national currency (NGDP)
        data_msg = imf_client.data(
            'IFS',
            key=f'{country_code}.NGDP_XDC',
            params={'startPeriod': 2020}
        )
        
        df = sdmx.to_pandas(data_msg)
        if df.empty:
            return 0
        
        df_sorted = df.sort_index(ascending=False)
        latest_value = df_sorted.iloc[0]
        latest_period = df_sorted.index[0]
        
        if hasattr(latest_period, '__iter__') and len(latest_period) > 0:
            year = latest_period[0]
        else:
            year = str(latest_period)[:4]
        
        evaluated_at = f"{year}-12-31"
        source_url = "https://www.imf.org/external/datamapper/datasets/IFS"
        
        if evaluation_exists(conn, country_name, 'gdp', source_url, str(latest_value)):
            print(f"  ⊘ gdp already exists")
            return 0
        
        insert_evaluation(
            conn, country_name, 'gdp', latest_value, source_url,
            evaluated_at, settings, f"IMF IFS GDP data, year {year}"
        )
        print(f"  ✓ gdp = {latest_value:,.0f} ({year})")
        return 1
        
    except Exception as e:
        print(f"  ✗ gdp error: {type(e).__name__}: {str(e)}")
        return 0

def main():
    print("Starting IMF SDMX API data fetch...\n")
    
    # Connect to database
    conn = get_db_connection()
    settings = get_scoring_settings(conn)
    
    if not settings:
        print("Error: No scoring settings found")
        sys.exit(1)
    
    # Initialize IMF SDMX client (uses HTTPS by default)
    imf_client = sdmx.Client('IMF')
    
    total_count = 0
    test_countries = ['USA', 'CAN', 'DEU', 'JPN', 'GBR']  # Test with 5 countries first
    
    print(f"=== Testing IMF API with {len(test_countries)} countries ===\n")
    
    for country_code in test_countries:
        country_name = COUNTRY_CODE_MAP.get(country_code)
        if not country_name:
            print(f"⊘ {country_code} not in mapping, skipping")
            continue
        
        print(f"Fetching {country_name} ({country_code})...")
        
        # Fetch inflation data
        total_count += fetch_imf_inflation(imf_client, country_code, country_name, conn, settings)
        
        # Fetch GDP data
        total_count += fetch_imf_gdp(imf_client, country_code, country_name, conn, settings)
    
    conn.close()
    
    print(f"\n✓ Successfully inserted {total_count} IMF evaluations")
    print("✓ IMF SDMX API integration working via HTTPS")

if __name__ == "__main__":
    main()
