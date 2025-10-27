import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import FactChecker from "@/pages/FactChecker";
import ClaimsMatrix from "@/pages/ClaimsMatrix";
import SourcesOverview from "@/pages/SourcesOverview";
import SourcePipeline from "@/pages/SourcePipeline";
import SourceIdentityMetrics from "@/pages/SourceIdentityMetrics";
import SourceActivityLog from "@/pages/SourceActivityLog";
import FactsActivityLog from "@/pages/FactsActivityLog";
import EvaluationScoring from "@/pages/EvaluationScoring";
import AdminScoring from "@/pages/AdminScoring";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={FactChecker} />
      <Route path="/claims-matrix" component={ClaimsMatrix} />
      <Route path="/sources" component={SourcesOverview} />
      <Route path="/sources/pipeline" component={SourcePipeline} />
      <Route path="/sources/identity-metrics" component={SourceIdentityMetrics} />
      <Route path="/sources/activity-log" component={SourceActivityLog} />
      <Route path="/facts/activity-log" component={FactsActivityLog} />
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