import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EntitySelectorProps {
  entities: string[];
  selectedEntity: string;
  onEntityChange: (entity: string) => void;
}

export function EntitySelector({
  entities,
  selectedEntity,
  onEntityChange,
}: EntitySelectorProps) {
  const [customEntity, setCustomEntity] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const handleSelectChange = (value: string) => {
    if (value === "custom") {
      setUseCustom(true);
      onEntityChange(customEntity);
    } else {
      setUseCustom(false);
      onEntityChange(value);
    }
  };

  const handleCustomInputChange = (value: string) => {
    setCustomEntity(value);
    if (useCustom) {
      onEntityChange(value);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="entity-select" className="text-sm font-medium">
          Select Entity
        </Label>
        <Select
          value={useCustom ? "custom" : selectedEntity}
          onValueChange={handleSelectChange}
        >
          <SelectTrigger id="entity-select" data-testid="select-entity">
            <SelectValue placeholder="Choose an entity..." />
          </SelectTrigger>
          <SelectContent>
            {entities.map((entity) => (
              <SelectItem key={entity} value={entity}>
                {entity}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom entity...</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select a pre-configured entity or enter a custom one
        </p>
      </div>

      {useCustom && (
        <div className="space-y-2">
          <Label htmlFor="custom-entity" className="text-sm font-medium">
            Custom Entity Name
          </Label>
          <Input
            id="custom-entity"
            type="text"
            placeholder="Enter entity name..."
            value={customEntity}
            onChange={(e) => handleCustomInputChange(e.target.value)}
            data-testid="input-custom-entity"
          />
        </div>
      )}
    </div>
  );
}