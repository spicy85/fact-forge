import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface ParagraphInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

export function ParagraphInput({
  value,
  onChange,
  onClear,
}: ParagraphInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="paragraph-input" className="text-sm font-medium">
          Paragraph to Verify
        </Label>
        {value && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            data-testid="button-clear-paragraph"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>
      <Textarea
        id="paragraph-input"
        placeholder="Paste a paragraph containing numeric claims here... For example: 'Acme Inc was founded in 1985 and now has 123 stores across the country, generating $50 million in revenue.'"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[200px] resize-none"
        data-testid="input-paragraph"
      />
      <p className="text-xs text-muted-foreground">
        {value.length} characters
      </p>
    </div>
  );
}