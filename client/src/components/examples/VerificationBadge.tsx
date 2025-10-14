import { VerificationBadge } from '../VerificationBadge';

export default function VerificationBadgeExample() {
  return (
    <div className="flex flex-wrap gap-4 p-6">
      <VerificationBadge
        status="verified"
        sourceUrl="https://example.com/source"
        tooltipContent="Verified from trusted source"
      />
      <VerificationBadge
        status="mismatch"
        sourceUrl="https://example.com/source"
        tooltipContent="Value does not match recorded data"
      />
      <VerificationBadge
        status="unknown"
        tooltipContent="No data available for this claim"
      />
    </div>
  );
}