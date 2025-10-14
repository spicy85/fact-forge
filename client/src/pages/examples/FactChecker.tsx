import FactChecker from '../FactChecker';
import { ThemeProvider } from '@/lib/theme-provider';

export default function FactCheckerExample() {
  return (
    <ThemeProvider>
      <FactChecker />
    </ThemeProvider>
  );
}