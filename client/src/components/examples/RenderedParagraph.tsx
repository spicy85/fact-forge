import { RenderedParagraph, VerifiedClaim } from '../RenderedParagraph';

export default function RenderedParagraphExample() {
  const text = 'Acme Inc has 123 stores and was founded in 1985 with approximately 500 employees.';
  const claims: VerifiedClaim[] = [
    {
      value: '123',
      status: 'verified',
      attribute: 'store_count',
      sourceUrl: 'https://example.com/source',
      tooltipContent: 'Verified: 123 stores',
      startIndex: 13,
      endIndex: 16,
    },
    {
      value: '1985',
      status: 'verified',
      attribute: 'founded_year',
      sourceUrl: 'https://example.com/source',
      tooltipContent: 'Verified: Founded in 1985',
      startIndex: 42,
      endIndex: 46,
    },
    {
      value: '500',
      status: 'unknown',
      attribute: 'employee_count',
      tooltipContent: 'No data available',
      startIndex: 68,
      endIndex: 71,
    },
  ];

  return (
    <div className="max-w-3xl p-6">
      <RenderedParagraph originalText={text} claims={claims} />
    </div>
  );
}