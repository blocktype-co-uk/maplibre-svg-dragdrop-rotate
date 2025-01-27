"use client";
import * as React from "react";
import Map, { Layer, Source } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  CustomPolygon,
  FeaturePolygonWithProps,
} from "@/components/CustomPolygon";
import { useEffect, useMemo, useRef } from "react";
import { createPolygonAtAPoint } from "@/tools/createPolygonAtAPoint";
import * as turf from "@turf/turf";

export type PolygonObj = {
  feature: FeaturePolygonWithProps;
  active: boolean;
  angle: number;
};

export type PolygonDerivativeLine = {
  feature: GeoJSON.Feature<GeoJSON.LineString>;
  polygonId: string;
};

export type PolygonDerivativePoint = {
  feature: GeoJSON.Feature<GeoJSON.Point>;
  polygonId: string;
};

export const MapContainer = () => {
  const [snapRadiusMetres, setSnapRadiusMetres] = React.useState(0.5);
  const [polygons, setPolygons] = React.useState<PolygonObj[]>([
    {
      feature: createPolygonAtAPoint({
        lat: 51.51406,
        lng: -0.12248,
        width: 10,
        height: 15,
      }),
      active: false,
      angle: 0,
    },
    {
      feature: createPolygonAtAPoint({
        lat: 51.5142,
        lng: -0.1225,
        width: 15,
        height: 10,
      }),
      active: false,
      angle: 0,
    },
  ]);
  const [lines, setLines] = React.useState<PolygonDerivativeLine[]>([]);
  const [points, setPoints] = React.useState<PolygonDerivativePoint[]>([]);
  const [intersectingPoints, setIntersectingPoints] = React.useState<
    PolygonDerivativePoint[]
  >([]);
  const [intersectingLines, setIntersectingLines] = React.useState<
    PolygonDerivativeLine[]
  >([]);

  const intersectingPointFeatures = useMemo(() => {
    return intersectingPoints.map((point) =>
      turf.circle(point.feature, snapRadiusMetres, {
        units: "meters",
      })
    );
  }, [intersectingPoints]);

  const intersectingLineFeatures = useMemo(() => {
    return intersectingLines.map((line) => line.feature);
  }, [intersectingLines]);

  useEffect(() => computeGuides(), [polygons]);

  const computeGuides = () => {
    const newLines: PolygonDerivativeLine[] = [];
    const newPoints: PolygonDerivativePoint[] = [];

    polygons.forEach((polygon) => {
      const polygonCenter = turf.getCoord(turf.centroid(polygon.feature));
      const rotated = turf.transformRotate(polygon.feature, polygon.angle, {
        pivot: polygonCenter,
      });

      const lines = turf
        .transformScale(turf.lineSegment(rotated), 3)
        .features.map((line) => ({
          feature: line,
          polygonId: polygon.feature.properties.id,
        }));

      newLines.push(...lines);

      const points = turf.explode(rotated).features.map((point) => ({
        feature: point,
        polygonId: polygon.feature.properties.id,
      }));

      newPoints.push(...points);
    });

    setLines(newLines);
    setPoints(newPoints);
  };

  const handlePolygonUpdate = (polygonData: PolygonObj) => {
    setPolygons((prev) =>
      prev.map((p) =>
        p.feature.properties.id === polygonData.feature.properties.id
          ? polygonData
          : p
      )
    );
  };

  const mapRef = useRef(null);

  const handleMapClick = (e: maplibregl.MapMouseEvent) => {
    if (!mapRef.current) return;
    const map = mapRef.current as maplibregl.Map;
    const features = map.queryRenderedFeatures(e.point);
    console.log("features", features);

    if (
      features.length > 0 &&
      features[0].properties?.type === "FeaturePolygonWithProps"
    ) {
      const id = features[0].properties.id;
      const newPolygons = polygons.map((polygon) => {
        if (polygon.feature.properties.id === id) {
          return {
            ...polygon,
            active: true,
          };
        }
        return {
          ...polygon,
          active: false,
        };
      });
      setPolygons(newPolygons);
    } else {
      //deselect all polygons
      setPolygons((prev) =>
        prev.map((polygon) => ({
          ...polygon,
          active: false,
        }))
      );
    }
  };

  return (
    <div className="w-full h-full">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: -0.12249096587602795,
          latitude: 51.51417051192398,
          zoom: 19,
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
        onClick={handleMapClick}
      >
        {polygons.map((polygon) => (
          <CustomPolygon
            id={polygon.feature.properties.id}
            label={polygon.feature.properties.id}
            key={polygon.feature.properties.id} // Use the unique id as the key
            geojson={polygon}
            points={points}
            lines={lines}
            snapRadiusMetres={snapRadiusMetres}
            onDelete={() => {
              setPolygons((prev) =>
                prev.filter(
                  (p) =>
                    p.feature.properties.id !== polygon.feature.properties.id
                )
              );
            }}
            onUpdate={handlePolygonUpdate}
            onIntersectingPointsUpdate={setIntersectingPoints}
            onIntersectingLinesUpdate={setIntersectingLines}
          />
        ))}

        <Source
          type="geojson"
          data={turf.featureCollection(lines.map((line) => line.feature))}
        >
          <Layer
            type="line"
            paint={{
              "line-color": "blue",
              "line-width": 1,
              "line-opacity": 0.2,
            }}
          />
        </Source>
        <Source
          type="geojson"
          data={turf.featureCollection(intersectingPointFeatures)}
        >
          <Layer
            type="circle"
            paint={{
              "circle-radius": 1,
              "circle-color": "red",
              "circle-opacity": 0.5,
            }}
          />
        </Source>
        <Source
          type="geojson"
          data={turf.featureCollection(intersectingLineFeatures)}
        >
          <Layer type="line" paint={{ "line-color": "red", "line-width": 2 }} />
        </Source>
      </Map>
    </div>
  );
};
