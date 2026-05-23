import TripLayout from "./TripLayout";
import ItineraryPage from "./ItineraryPage";
import ExpensesPage from "./ExpensesPage";
import MapPage from "./MapPage";
import MembersPage from "./MembersPage";
import FlightsPage from "./FlightsPage";

interface TripPageProps {
  tripId: number;
  section: "itinerary" | "expenses" | "map" | "members" | "flights";
}

export default function TripPage({ tripId, section }: TripPageProps) {
  const renderSection = () => {
    switch (section) {
      case "itinerary": return <ItineraryPage tripId={tripId} />;
      case "expenses": return <ExpensesPage tripId={tripId} />;
      case "map": return <MapPage tripId={tripId} />;
      case "members": return <MembersPage tripId={tripId} />;
      case "flights": return <FlightsPage tripId={tripId} />;
      default: return <ItineraryPage tripId={tripId} />;
    }
  };

  return (
    <TripLayout tripId={tripId}>
      {renderSection()}
    </TripLayout>
  );
}
