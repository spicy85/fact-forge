import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import FactChecker from "@/pages/FactChecker";
import ClaimsMatrix from "@/pages/ClaimsMatrix";
import SourcesOverview from "@/pages/SourcesOverview";
import EvaluationScoring from "@/pages/EvaluationScoring";
import AdminScoring from "@/pages/AdminScoring";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={FactChecker} />
      <Route path="/claims-matrix" component={ClaimsMatrix} />
      <Route path="/sources" component={SourcesOverview} />
      <Route path="/evaluation-scoring" component={EvaluationScoring} />
      <Route path="/admin" component={AdminScoring} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;