import { useState } from 'react';
import { ParagraphInput } from '../ParagraphInput';

export default function ParagraphInputExample() {
  const [value, setValue] = useState('Acme Inc has 123 stores and was founded in 1985.');

  return (
    <div className="max-w-3xl p-6">
      <ParagraphInput
        value={value}
        onChange={setValue}
        onClear={() => setValue('')}
      />
    </div>
  );
}