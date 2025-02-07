"use client";
import { useCallback, useState } from "react";
import Map, { Layer, Source } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  CustomPolygon,
  FeaturePolygonWithProps,
} from "@/components/CustomPolygon";
import { useEffect, useMemo, useRef } from "react";
import { createPolygonAtAPoint } from "@/tools/createPolygonAtAPoint";
import * as turf from "@turf/turf";
import { times } from "lodash";

export type PolygonObj = {
  feature: FeaturePolygonWithProps;
  active: boolean;
  angle: number;
};

export type PolygonDerivativeLine = GeoJSON.Feature<GeoJSON.LineString> & {
  properties: {
    polygonId: string;
  };
};

export type PolygonDerivativePoint = GeoJSON.Feature<GeoJSON.Point> & {
  properties: {
    polygonId: string;
  };
};

const generateRandomPolygon = (): PolygonObj => ({
  feature: createPolygonAtAPoint({
    lat: 51.51 - Math.random() * 0.001,
    lng: -0.12 - Math.random() * 0.01,
    width: 10 + Math.random() * 10,
    height: 10 + Math.random() * 20,
  }),
  active: false,
  angle: 0,
});

export const MapContainer = ({
  snapRadiusMetres,
  snapGuideRatio,
  snapAngleDistance,
}: {
  snapRadiusMetres: number;
  snapGuideRatio: number;
  snapAngleDistance: number;
}) => {
  const [polygons, setPolygons] = useState<PolygonObj[]>(
    times(100, generateRandomPolygon)
  );

  const centroid = turf.centerOfMass(
    turf.featureCollection(polygons.map((p) => p.feature))
  );
  const [points, setPoints] = useState<PolygonDerivativePoint[]>([]);
  const [lines, setLines] = useState<PolygonDerivativeLine[]>([]);
  const [bearings, setBearings] = useState<
    Record<number, PolygonDerivativeLine[]>
  >({});
  const [intersectingPoints, setIntersectingPoints] = useState<
    PolygonDerivativePoint[]
  >([]);
  const geospatialIndex = useMemo(() => {
    const tree = turf.geojsonRbush();
    tree.load(lines.map((l) => turf.clone(l)));

    return tree;
  }, [lines]);

  const [snapLines, setSnapLines] = useState<PolygonDerivativeLine[]>([]);
  const [snapBearings, setSnapBearings] = useState<PolygonDerivativeLine[]>([]);

  const intersectingPointFeatures = useMemo(() => {
    return turf.featureCollection(
      intersectingPoints.map((point) =>
        turf.circle(point, snapRadiusMetres, {
          units: "meters",
        })
      )
    );
  }, [intersectingPoints, snapRadiusMetres]);

  const snapLineFeatures = useMemo(() => {
    return turf.featureCollection(snapLines.map((line) => line));
  }, [snapLines]);

  const snapBearingsFeatures = useMemo(() => {
    return turf.featureCollection(
      Object.values(snapBearings)
        .flat()
        .map((line) => line)
    );
  }, [snapBearings]);

  const computeGuides = useCallback(() => {
    const newLines: PolygonDerivativeLine[] = [];
    const newPoints: PolygonDerivativePoint[] = [];
    setBearings({});

    polygons.forEach((polygon) => {
      const polygonCenter = turf.getCoord(turf.centroid(polygon.feature));
      const rotated = turf.transformRotate(polygon.feature, polygon.angle, {
        pivot: polygonCenter,
      });

      // bearings are in the range [-180, 180], we want to clamp the angles to [0, 180)
      // so that it doesn't matter which side of the polygon the bearing is on
      let bearing = (180 + Math.round(polygon.angle)) % 180;
      let normal = Math.round(bearing + 90) % 180;

      const lines = turf
        .transformScale(turf.lineSegment(rotated), snapGuideRatio)
        .features.map((line) => ({
          ...line,
          id: `${polygon.feature.properties.id}-${line.id}`,
          properties: {
            polygonId: polygon.feature.properties.id,
          },
        }));

      setBearings((prev) => ({
        ...prev,
        [bearing]: [...(prev[bearing] || []), lines[0]],
        [normal]: [...(prev[normal] || []), lines[1]],
      }));

      newLines.push(...lines);

      const points = turf
        .explode(rotated)
        .features.slice(0, -1)
        .map((point) => ({
          ...point,
          properties: {
            polygonId: polygon.feature.properties.id,
          },
        }));

      newPoints.push(...points);
    });

    setLines(newLines);
    setPoints(newPoints);
  }, [polygons, snapGuideRatio]);

  useEffect(() => computeGuides(), [polygons, snapRadiusMetres, computeGuides]);

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
            longitude: centroid.geometry.coordinates[0],
            latitude: centroid.geometry.coordinates[1],
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
              bearings={bearings}
              snapRadiusMetres={snapRadiusMetres}
              snapAngleDistance={snapAngleDistance}
              geospatialIndex={geospatialIndex}
              onDelete={() => {
                geospatialIndex.remove(
                  polygon.feature,
                  (a, b) => a.properties?.polygonId === b.properties?.polygonId
                );
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
              onSnapBearingUpdate={setSnapBearings}
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
          <Source type="geojson" data={snapBearingsFeatures}>
            <Layer
              type="line"
              paint={{
                "line-color": "red",
                "line-opacity": 0.5,
                "line-width": 1,
              }}
            />
          </Source>
        </Map>
      </div>
    </>
  );
};
