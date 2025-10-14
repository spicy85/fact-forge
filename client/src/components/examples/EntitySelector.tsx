import { useState } from 'react';
import { EntitySelector } from '../EntitySelector';

export default function EntitySelectorExample() {
  const [selectedEntity, setSelectedEntity] = useState('Acme Inc');
  const entities = ['Acme Inc', 'TechCorp', 'GlobalMart'];

  return (
    <div className="max-w-md p-6">
      <EntitySelector
        entities={entities}
        selectedEntity={selectedEntity}
        onEntityChange={setSelectedEntity}
      />
      <p className="mt-4 text-sm text-muted-foreground">
        Selected: {selectedEntity || 'None'}
      </p>
    </div>
  );
}