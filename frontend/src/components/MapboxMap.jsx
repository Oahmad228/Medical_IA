import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const defaultStyle = "mapbox://styles/mapbox/streets-v12";

export default function MapboxMap({
  center,
  markers = [],
  zoom = 12,
  onSelect,
  selectOnClick = false,
  showLocate = false,
  onLocate,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const clickHandlerRef = useRef(null);
  const fallbackStyleRef = useRef(false);
  const geolocateRef = useRef(null);
  const onLocateRef = useRef(onLocate);
  const lastCenterRef = useRef(null);
  const [mapStatus, setMapStatus] = useState("loading");

  useEffect(() => {
    onLocateRef.current = onLocate;
  }, [onLocate]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    const style = import.meta.env.VITE_MAPBOX_STYLE || defaultStyle;
    if (!token) {
      setMapStatus("missing-token");
      return;
    }

    mapboxgl.accessToken = token;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style,
      center: center || [0, 0],
      zoom,
      transformRequest: (url) => {
        if (url.includes("events.mapbox.com") || url.includes("events.mapbox.cn")) {
          return { url: "data:," };
        }
        return undefined;
      },
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    mapRef.current.on("load", () => {
      setMapStatus("ready");
      mapRef.current?.resize();
    });
    mapRef.current.on("error", (evt) => {
      const message = String(evt?.error?.message || "").toLowerCase();
      if (message.includes("events.mapbox.com") || message.includes("blocked_by_client")) {
        return;
      }
      if (!fallbackStyleRef.current && style !== defaultStyle) {
        fallbackStyleRef.current = true;
        mapRef.current?.setStyle(defaultStyle);
        return;
      }
      setMapStatus("error");
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!selectOnClick || typeof onSelect !== "function") {
      if (clickHandlerRef.current) {
        mapRef.current.off("click", clickHandlerRef.current);
        clickHandlerRef.current = null;
      }
      mapRef.current.getCanvas().style.cursor = "";
      return;
    }

    const handler = (evt) => {
      onSelect({ lat: evt.lngLat.lat, lng: evt.lngLat.lng });
    };
    clickHandlerRef.current = handler;
    mapRef.current.on("click", handler);
    mapRef.current.getCanvas().style.cursor = "crosshair";

    return () => {
      if (clickHandlerRef.current) {
        mapRef.current?.off("click", clickHandlerRef.current);
        clickHandlerRef.current = null;
      }
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
    };
  }, [onSelect, selectOnClick]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!showLocate) {
      if (geolocateRef.current) {
        mapRef.current.removeControl(geolocateRef.current);
        geolocateRef.current = null;
      }
      return;
    }
    if (geolocateRef.current) return;

    const control = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
      showUserHeading: true,
    });
    geolocateRef.current = control;
    mapRef.current.addControl(control, "bottom-right");
    control.on("geolocate", (evt) => {
      const lat = evt.coords.latitude;
      const lng = evt.coords.longitude;
      if (typeof onLocateRef.current === "function") {
        onLocateRef.current({ lat, lng });
      }
    });

    return () => {
      if (geolocateRef.current && mapRef.current) {
        mapRef.current.removeControl(geolocateRef.current);
      }
      geolocateRef.current = null;
    };
  }, [showLocate]);

  useEffect(() => {
    if (!mapRef.current || !center) return;
    const [lng, lat] = center;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const last = lastCenterRef.current;
    if (last && last[0] === lng && last[1] === lat) return;
    lastCenterRef.current = [lng, lat];
    mapRef.current.setCenter([lng, lat]);
    mapRef.current.resize();
  }, [center]);

  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    markers.forEach((marker) => {
      if (!Number.isFinite(marker?.lng) || !Number.isFinite(marker?.lat)) return;
      const pin = document.createElement("div");
      pin.style.width = "12px";
      pin.style.height = "12px";
      pin.style.borderRadius = "999px";
      pin.style.background = marker.color || "#22c55e";
      pin.style.boxShadow = "0 0 0 4px rgba(15, 23, 42, 0.15)";

      const mbMarker = new mapboxgl.Marker({ element: pin })
        .setLngLat([marker.lng, marker.lat])
        .addTo(mapRef.current);
      markersRef.current.push(mbMarker);
    });
    mapRef.current.resize();
  }, [markers]);

  return (
    <div className="mapbox-shell">
      <div className="mapbox-shell__map" ref={containerRef} />
      {mapStatus === "missing-token" ? (
        <div className="mapbox-shell__overlay">Cle Mapbox manquante.</div>
      ) : null}
      {mapStatus === "error" ? (
        <div className="mapbox-shell__toast">Carte indisponible pour le moment.</div>
      ) : null}
    </div>
  );
}
