import { Card } from "@/components/ui/card";
import { VerificationBadge, VerificationStatus } from "./VerificationBadge";

export interface VerifiedClaim {
  value: string;
  status: VerificationStatus;
  attribute?: string;
  sourceUrl?: string;
  tooltipContent?: string;
  startIndex: number;
  endIndex: number;
}

interface RenderedParagraphProps {
  originalText: string;
  claims: VerifiedClaim[];
}

export function RenderedParagraph({
  originalText,
  claims,
}: RenderedParagraphProps) {
  const sortedClaims = [...claims].sort((a, b) => a.startIndex - b.startIndex);

  const renderParagraphWithBadges = () => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    sortedClaims.forEach((claim, idx) => {
      if (claim.startIndex > lastIndex) {
        parts.push(
          <span key={`text-${idx}`}>
            {originalText.slice(lastIndex, claim.startIndex)}
          </span>
        );
      }

      parts.push(
        <span key={`claim-${idx}`} className="inline-flex items-center gap-1">
          <span className="font-mono font-semibold">{claim.value}</span>
          <VerificationBadge
            status={claim.status}
            sourceUrl={claim.sourceUrl}
            tooltipContent={claim.tooltipContent}
          />
        </span>
      );

      lastIndex = claim.endIndex;
    });

    if (lastIndex < originalText.length) {
      parts.push(
        <span key="text-end">{originalText.slice(lastIndex)}</span>
      );
    }

    return parts;
  };

  return (
    <Card className="p-6" data-testid="card-rendered-paragraph">
      <div className="text-base leading-relaxed">
        {renderParagraphWithBadges()}
      </div>
    </Card>
  );
}