import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

type LocationData = {
  id: number;
  name: string;
  address: string | null;
  squareLocationId: string | null;
  isDefault: boolean;
};

type UserLocationEntry = {
  id: number;
  userId: string;
  locationId: number;
  isPrimary: boolean;
  location: LocationData;
};

type LocationContextType = {
  locations: LocationData[];
  myLocations: UserLocationEntry[];
  selectedLocationId: number | null;
  selectedLocation: LocationData | null;
  setSelectedLocationId: (id: number | null) => void;
  isLoading: boolean;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
};

const LocationContext = createContext<LocationContextType | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [showAll, setShowAll] = useState(false);

  const { data: allLocations, isLoading: locsLoading } = useQuery<LocationData[]>({
    queryKey: ["/api/locations"],
  });

  const { data: myLocations, isLoading: myLocsLoading } = useQuery<UserLocationEntry[]>({
    queryKey: ["/api/my-locations"],
  });

  const [selectedId, setSelectedId] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem("jarvis-location-id");
      if (!saved) return null;
      const parsed = parseInt(saved);
      return isNaN(parsed) ? null : parsed;
    } catch {
      return null;
    }
  });

  const allowedLocationIds = useMemo(() => {
    if (!myLocations || myLocations.length === 0) return allLocations?.map(l => l.id) ?? [];
    return myLocations.map(ml => ml.locationId);
  }, [myLocations, allLocations]);

  const defaultLocationId = useMemo(() => {
    if (myLocations && myLocations.length > 0) {
      const primary = myLocations.find(ml => ml.isPrimary);
      return primary ? primary.locationId : myLocations[0].locationId;
    }
    if (allLocations && allLocations.length > 0) {
      const def = allLocations.find(l => l.isDefault);
      return def ? def.id : allLocations[0].id;
    }
    return null;
  }, [myLocations, allLocations]);

  const resolvedId = useMemo(() => {
    if (selectedId !== null && allowedLocationIds.includes(selectedId)) {
      return selectedId;
    }
    return defaultLocationId;
  }, [selectedId, allowedLocationIds, defaultLocationId]);

  const setSelectedLocationId = useCallback((id: number | null) => {
    setSelectedId(id);
    try {
      if (id !== null) {
        localStorage.setItem("jarvis-location-id", String(id));
      } else {
        localStorage.removeItem("jarvis-location-id");
      }
    } catch {}
  }, []);

  const selectedLocation = allLocations?.find(l => l.id === resolvedId) ?? null;

  return (
    <LocationContext.Provider value={{
      locations: allLocations ?? [],
      myLocations: myLocations ?? [],
      selectedLocationId: resolvedId,
      selectedLocation,
      setSelectedLocationId,
      isLoading: locsLoading || myLocsLoading,
      showAll,
      setShowAll,
    }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationContext() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocationContext must be used within LocationProvider");
  return ctx;
}
