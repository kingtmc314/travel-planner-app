import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import TripLayout from "./pages/trip/TripLayout";
import ItineraryPage from "./pages/trip/ItineraryPage";
import ExpensesPage from "./pages/trip/ExpensesPage";
import MapPage from "./pages/trip/MapPage";
import MembersPage from "./pages/trip/MembersPage";
import FlightsPage from "./pages/trip/FlightsPage";
import TravelHistory from "./pages/TravelHistory";
import FlightPassport from "./pages/FlightPassport";

function TripRoutes({ tripId }: { tripId: number }) {
  return (
    <TripLayout tripId={tripId}>
      <Switch>
        <Route path="/trips/:tripId/itinerary" component={() => <ItineraryPage tripId={tripId} />} />
        <Route path="/trips/:tripId/expenses" component={() => <ExpensesPage tripId={tripId} />} />
        <Route path="/trips/:tripId/map" component={() => <MapPage tripId={tripId} />} />
        <Route path="/trips/:tripId/members" component={() => <MembersPage tripId={tripId} />} />
        <Route path="/trips/:tripId/flights" component={() => <FlightsPage tripId={tripId} />} />
        <Route component={() => <ItineraryPage tripId={tripId} />} />
      </Switch>
    </TripLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/trips/:tripId/:tab?">
        {(params) => <TripRoutes tripId={Number(params.tripId)} />}
      </Route>
      <Route path="/travel-history" component={TravelHistory} />
      <Route path="/flight-passport" component={FlightPassport} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
