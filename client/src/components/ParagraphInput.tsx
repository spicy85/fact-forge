import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface ParagraphInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onSubmit?: () => void;
}

export function ParagraphInput({
  value,
  onChange,
  onClear,
  onSubmit,
}: ParagraphInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && onSubmit && value.trim()) {
      e.preventDefault();
      onSubmit();
    }
  };
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
        placeholder="Paste a paragraph containing numeric claims here... Press Enter to verify, or Shift+Enter for new line."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="min-h-[200px] resize-none"
        data-testid="input-paragraph"
      />
      <p className="text-xs text-muted-foreground">
        {value.length} characters
      </p>
    </div>
  );
}