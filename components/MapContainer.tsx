"use client";
import { useState } from "react";
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

export const MapContainer = ({
  snapRadiusMetres,
}: {
  snapRadiusMetres: number;
}) => {
  const [polygons, setPolygons] = useState<PolygonObj[]>([
    {
      feature: createPolygonAtAPoint({
        lat: 51.51406,
        lng: -0.12248,
        width: 12,
        height: 20,
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
    {
      feature: createPolygonAtAPoint({
        lat: 51.51416,
        lng: -0.12248,
        width: 7.5,
        height: 10,
      }),
      active: false,
      angle: 0,
    },
    {
      feature: createPolygonAtAPoint({
        lat: 51.5142,
        lng: -0.1228,
        width: 5,
        height: 20,
      }),
      active: false,
      angle: 0,
    },
  ]);
  const [lines, setLines] = useState<PolygonDerivativeLine[]>([]);
  const [points, setPoints] = useState<PolygonDerivativePoint[]>([]);
  const [bearings, setBearings] = useState<number[]>([]);
  const [intersectingPoints, setIntersectingPoints] = useState<
    PolygonDerivativePoint[]
  >([]);
  const [snapLines, setSnapLines] = useState<PolygonDerivativeLine[]>([]);
  const [snapPolygon, setSnapPolygon] =
    useState<GeoJSON.Feature<GeoJSON.Polygon> | null>(null);

  const intersectingPointFeatures = useMemo(() => {
    return turf.featureCollection(
      intersectingPoints.map((point) =>
        turf.circle(point.feature, snapRadiusMetres, {
          units: "meters",
        })
      )
    );
  }, [intersectingPoints, snapRadiusMetres]);

  const snapLineFeatures = useMemo(() => {
    return turf.featureCollection(snapLines.map((line) => line.feature));
  }, [snapLines]);

  useEffect(() => computeGuides(), [polygons, snapRadiusMetres]);

  const computeGuides = () => {
    const newLines: PolygonDerivativeLine[] = [];
    const newPoints: PolygonDerivativePoint[] = [];

    polygons.forEach((polygon) => {
      const polygonCenter = turf.getCoord(turf.centroid(polygon.feature));
      const rotated = turf.transformRotate(polygon.feature, polygon.angle, {
        pivot: polygonCenter,
      });

      const lines = turf
        .transformScale(turf.lineSegment(rotated), 2)
        .features.map((line) => ({
          feature: {
            ...line,
            id: `${polygon.feature.properties.id}-${line.id}`,
          },
          polygonId: polygon.feature.properties.id,
        }));

      newLines.push(...lines);

      const points = turf
        .explode(rotated)
        .features.slice(0, -1)
        .map((point) => ({
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
    <>
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
              onSnapLinesUpdate={setSnapLines}
            />
          ))}

          <Source type="geojson" data={intersectingPointFeatures}>
            <Layer
              type="circle"
              paint={{
                "circle-radius": 1,
                "circle-color": "red",
                "circle-opacity": 0.5,
              }}
            />
          </Source>
          <Source type="geojson" data={snapLineFeatures}>
            <Layer
              type="line"
              paint={{
                "line-color": "red",
                "line-width": 0.5,
                "line-opacity": 1,
                "line-dasharray": [2, 5],
              }}
            />
          </Source>
          {snapPolygon && (
            <Source type="geojson" data={snapPolygon}>
              <Layer
                type="fill"
                paint={{ "fill-color": "red", "fill-opacity": 0.2 }}
              />
            </Source>
          )}
        </Map>
      </div>
    </>
  );
};
