import { useQuery } from "@tanstack/react-query";
import type { WidgetId } from "@/lib/home-widgets";
import { WIDGET_REGISTRY } from "@/lib/home-widgets";

export interface ResolvedHomeLayout {
  visibleWidgets: WidgetId[];
  hiddenWidgets: WidgetId[];
  pinnedTop?: WidgetId[];
}

interface HomeLayoutResponse {
  layout: {
    visibleWidgets: string[];
    hiddenWidgets: string[];
    pinnedTop?: string[];
  };
  defaultPage: string;
}

function isValidWidgetId(id: string): id is WidgetId {
  return id in WIDGET_REGISTRY;
}

function sanitizeLayout(raw: HomeLayoutResponse["layout"]): ResolvedHomeLayout {
  return {
    visibleWidgets: (raw.visibleWidgets || []).filter(isValidWidgetId),
    hiddenWidgets: (raw.hiddenWidgets || []).filter(isValidWidgetId),
    pinnedTop: raw.pinnedTop?.filter(isValidWidgetId),
  };
}

const EMPTY_LAYOUT: ResolvedHomeLayout = { visibleWidgets: [], hiddenWidgets: [] };

export function useEffectiveHomeLayout(enabled: boolean = true): {
  layout: ResolvedHomeLayout;
  defaultPage: string;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<HomeLayoutResponse>({
    queryKey: ["/api/me/home-layout"],
    enabled,
  });

  if (!data) {
    return { layout: EMPTY_LAYOUT, defaultPage: "/", isLoading };
  }

  return {
    layout: sanitizeLayout(data.layout),
    defaultPage: data.defaultPage || "/",
    isLoading: false,
  };
}

export function useEffectiveDefaultPage(enabled: boolean = true): {
  page: string;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<HomeLayoutResponse>({
    queryKey: ["/api/me/home-layout"],
    enabled,
  });

  return { page: data?.defaultPage || "/", isLoading };
}
