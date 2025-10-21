import { Check, X, HelpCircle, ExternalLink, CheckCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type VerificationStatus = "verified" | "close" | "mismatch" | "unknown";

interface VerificationBadgeProps {
  status: VerificationStatus;
  sourceUrl?: string;
  tooltipContent?: string;
}

export function VerificationBadge({
  status,
  sourceUrl,
  tooltipContent,
}: VerificationBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case "verified":
        return {
          icon: Check,
          label: "Verified",
          className: "bg-primary text-primary-foreground hover-elevate active-elevate-2",
        };
      case "close":
        return {
          icon: CheckCheck,
          label: "Close",
          className: "bg-green-600 dark:bg-green-700 text-white hover-elevate active-elevate-2",
        };
      case "mismatch":
        return {
          icon: X,
          label: "Mismatch",
          className: "bg-destructive text-destructive-foreground hover-elevate active-elevate-2",
        };
      case "unknown":
        return {
          icon: HelpCircle,
          label: "Unknown",
          className: "bg-muted text-muted-foreground",
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  const isInteractive = status !== "unknown" && (sourceUrl || tooltipContent);

  const badgeContent = (
    <span
      className={`${config.className} inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 transition-transform ${isInteractive ? "cursor-pointer" : ""}`}
      data-testid={`badge-${status}`}
    >
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
      {sourceUrl && status !== "unknown" && (
        <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
      )}
    </span>
  );

  if (tooltipContent || sourceUrl) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {sourceUrl && status !== "unknown" ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
              onClick={(e) => e.stopPropagation()}
              data-testid={`link-source-${status}`}
            >
              {badgeContent}
            </a>
          ) : (
            <button className="inline-block border-0 bg-transparent p-0">
              {badgeContent}
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">{tooltipContent || sourceUrl}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return badgeContent;
}