import { ResultsTable, VerificationResult } from '../ResultsTable';

export default function ResultsTableExample() {
  const results: VerificationResult[] = [
    {
      claimedValue: '123',
      attribute: 'store_count',
      verdict: 'verified',
      recordedValue: '123',
      asOfDate: '2024-01-15',
      citation: 'https://example.com/acme-stores',
    },
    {
      claimedValue: '1985',
      attribute: 'founded_year',
      verdict: 'verified',
      recordedValue: '1985',
      asOfDate: '2024-01-15',
      citation: 'https://example.com/acme-history',
    },
    {
      claimedValue: '124',
      attribute: 'store_count',
      verdict: 'mismatch',
      recordedValue: '123',
      asOfDate: '2024-01-15',
      citation: 'https://example.com/acme-stores',
    },
    {
      claimedValue: '500',
      attribute: 'employee_count',
      verdict: 'unknown',
    },
  ];

  return (
    <div className="max-w-6xl p-6">
      <ResultsTable results={results} />
    </div>
  );
}