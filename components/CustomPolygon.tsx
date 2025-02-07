import React, { useMemo, useCallback, useState } from "react";
import { Layer, Marker, Source } from "react-map-gl";
import {
  transformRotate,
  centroid,
  getCoord,
  bearing,
  destination,
  point,
  lineString,
  transformTranslate,
  distance,
  nearestPointOnLine,
  featureCollection,
  clone,
  bbox,
  explode,
  circle,
} from "@turf/turf";
import type { RBush } from "@turf/geojson-rbush";
import {
  PolygonDerivativeLine,
  PolygonDerivativePoint,
  PolygonObj,
} from "./MapContainer";

export type FeaturePolygonWithProps = GeoJSON.Feature & {
  geometry: GeoJSON.Polygon;
  properties: {
    polygonId: string;
    id: string;
    type: string;
  };
};

type CustomPolygonProps = {
  id: string;
  geojson: PolygonObj;
  points: PolygonDerivativePoint[];
  lines: PolygonDerivativeLine[];
  bearings: { [key: number]: PolygonDerivativeLine[] };
  label: string;
  snapRadiusMetres: number;
  snapAngleDistance: number;
  geospatialIndex: RBush<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>;
  onDelete: () => void;
  onUpdate: (polygonData: PolygonObj) => void;
  onIntersectingPointsUpdate: (points: PolygonDerivativePoint[]) => void;
  onSnapLinesUpdate: (lines: PolygonDerivativeLine[]) => void;
  onSnapBearingUpdate: (bearingLines: PolygonDerivativeLine[]) => void;
};

export const CustomPolygon = ({
  id,
  geojson,
  label,
  lines,
  bearings,
  points,
  snapRadiusMetres,
  snapAngleDistance,
  geospatialIndex,
  onDelete,
  onIntersectingPointsUpdate,
  onSnapLinesUpdate,
  onSnapBearingUpdate,
  onUpdate,
}: CustomPolygonProps) => {
  const polygonCenter = useMemo(
    () => getCoord(centroid(geojson.feature)),
    [geojson]
  );

  const [snapAngle, setSnapAngle] = useState<number | null>(null);

  const rotatedData = useMemo(
    () =>
      transformRotate(geojson.feature, snapAngle ?? geojson.angle, {
        pivot: polygonCenter,
      }),
    [geojson, polygonCenter, snapAngle]
  );

  const markerPosition = useMemo(
    () =>
      destination(point(polygonCenter), 20, geojson.angle, {
        units: "meters",
      }).geometry.coordinates,
    [polygonCenter, geojson.angle]
  );

  const lineData = useMemo(
    () => lineString([polygonCenter, markerPosition]),
    [polygonCenter, markerPosition]
  );

  const intersectingWithActivePolygon = useMemo(() => {
    if (!geojson.active) return featureCollection([]);

    const pointsToCheck = explode(geojson.feature)
      .features.slice(0, -1)
      .map((point) =>
        circle(point, snapRadiusMetres, { units: "meters", steps: 6 })
      );

    const intersectingFeatures = pointsToCheck.flatMap((point) =>
      geospatialIndex
        .search(point)
        .features.filter((feature) => feature.properties?.id !== id)
    );

    console.log(
      "intersectingFeatures",
      geojson.feature.geometry.coordinates,
      intersectingFeatures
    );
    return featureCollection(intersectingFeatures);
  }, [geojson, geospatialIndex]);

  /*
   * Angle snapping algorithm
   * 1. Each time the block rotation angle changes
   * 2. Loop through bearings (bearings are constrained to [0, 180])
   * 2.1 Find the distance between the new rotation angle and the bearing
   * 2.2 If the distance is less than the snapAngleDistance AND we have not already seen a closer bearing
   *        AND that bearing doesn't only have lines from the current polygon
   *    - Then set the nearest bearing, nearest bearing distance and nearest bearing lines
   *      (with lines from the current polygon filtered out)
   */

  const handleMarkerDrag = useCallback(
    (event: any) => {
      const { lngLat } = event;
      const newPosition = [lngLat.lng, lngLat.lat];
      const newRotation = Math.round(bearing(polygonCenter, newPosition));
      if (newRotation === geojson.angle) {
        return;
      }

      let nearestBearing = null;
      let nearestBearingDistance = Infinity;
      let nearestBearingLines: PolygonDerivativeLine[] = [];

      Object.keys(bearings).forEach((bearing) => {
        const bearingInt = parseInt(bearing);

        const clampedRotation = (180 + newRotation) % 180;

        const dist = Math.abs(bearingInt - clampedRotation);
        if (dist < snapAngleDistance && dist < nearestBearingDistance) {
          const possibleNearestBearingLines = bearings[bearingInt].filter(
            (bearing) => bearing.polygonId !== id
          );

          if (possibleNearestBearingLines.length > 0) {
            nearestBearingLines = possibleNearestBearingLines;
            nearestBearingDistance = dist;
            nearestBearing = bearingInt;
          }
        }
      });

      onSnapBearingUpdate(nearestBearingLines);
      setSnapAngle(nearestBearing);
      onUpdate({ ...geojson, angle: newRotation });
    },
    [
      bearings,
      geojson,
      id,
      onSnapBearingUpdate,
      onUpdate,
      polygonCenter,
      setSnapAngle,
      snapAngleDistance,
    ]
  );

  const handleMarkerDragEnd = useCallback(() => {
    if (snapAngle !== null) {
      const angle = geojson.angle < 0 ? snapAngle - 180 : snapAngle;
      console.log(
        "Rotation ended, setting angle to snapped angle: ",
        angle,
        " from ",
        geojson.angle
      );
      onUpdate({ ...geojson, angle });
    }
    onSnapBearingUpdate([]);
    setSnapAngle(null);
  }, [onSnapBearingUpdate, setSnapAngle, snapAngle, geojson, onUpdate]);

  const [snapPolygon, setSnapPolygon] =
    useState<FeaturePolygonWithProps | null>(null);

  const _handlePolygonDrag = useCallback(
    (event: any) => {
      const { lngLat } = event;
      const newCenter = [lngLat.lng, lngLat.lat];
      const feature = transformTranslate(
        geojson.feature,
        distance(point(polygonCenter), point(newCenter)),
        bearing(polygonCenter, newCenter)
      );

      onUpdate({ ...geojson, feature });
    },
    [geojson, onUpdate, polygonCenter]
  );

  const handlePolygonDrag = useCallback(
    (event: any) => {
      const { lngLat } = event;

      const newCenter = [lngLat.lng, lngLat.lat];
      const newData = transformTranslate(
        geojson.feature,
        distance(point(polygonCenter), point(newCenter)),
        bearing(polygonCenter, newCenter)
      );

      const pointsToCheck = explode(newData)
        .features.slice(0, -1)
        .map((point) => ({
          point,
          snapCircle: circle(point, snapRadiusMetres, {
            units: "meters",
            steps: 6,
          }),
        }));

      const snapLines: PolygonDerivativeLine[] = [];
      const snapVectors: { dist: number; bearing: number }[] = [];

      for (const { point, snapCircle } of pointsToCheck) {
        const intersectingLines = geospatialIndex
          .search(snapCircle)
          .features.filter(
            (feature) => feature.properties?.id !== id
          ) as PolygonDerivativeLine[];

        if (intersectingLines.length === 1) {
          const closestPoint = nearestPointOnLine(intersectingLines[0], point, {
            units: "meters",
          });
        }
      }

      onUpdate({ ...geojson, feature: newData });
    },
    [
      geojson,
      id,
      lines,
      points,
      polygonCenter,
      rotatedData,
      snapRadiusMetres,
      onUpdate,
      onIntersectingPointsUpdate,
      onSnapLinesUpdate,
    ]
  );

  const handlePolygonDragEnd = useCallback(() => {
    let feature = geojson.feature;
    if (snapPolygon) {
      // snapPolygon is rotated, we need to rotate it back since geojson includes the rotation angle separately
      const pivot = getCoord(centroid(snapPolygon));
      feature = transformRotate(snapPolygon, -geojson.angle, {
        pivot,
      });
      onUpdate({ ...geojson, feature });
      setSnapPolygon(null);
      onIntersectingPointsUpdate([]);
      onSnapLinesUpdate([]);
    }

    geospatialIndex.remove(
      geojson.feature,
      (a, b) => a.properties?.id === b.properties?.id
    );

    const featureToIndex = clone(feature);
    featureToIndex.bbox = bbox(featureToIndex);
    geospatialIndex.insert(featureToIndex);
  }, [
    snapPolygon,
    geojson,
    onUpdate,
    onIntersectingPointsUpdate,
    onSnapLinesUpdate,
  ]);

  return (
    <div className="border border-blue-800">
      <Source type="geojson" data={snapPolygon ? snapPolygon : rotatedData}>
        <Layer
          type="fill"
          paint={{
            "fill-color": snapPolygon ? "red" : "gray",
            "fill-opacity": 0.2,
          }}
        />
      </Source>

      {geojson.active && (
        <>
          <Source type="geojson" data={intersectingWithActivePolygon}>
            <Layer
              type="fill"
              paint={{
                "fill-color": "purple",
                "fill-opacity": 0.2,
              }}
            />
          </Source>

          <Source type="geojson" data={lineData}>
            <Layer
              type="line"
              paint={{
                "line-color": "gray",
                "line-width": 2,
                "line-dasharray": [2, 2],
              }}
            />
          </Source>
          <Marker
            longitude={polygonCenter[0]}
            latitude={polygonCenter[1]}
            draggable
            onDrag={handlePolygonDrag}
            onDragEnd={handlePolygonDragEnd}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                backgroundColor: "white",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                color: "white",
                fontWeight: "bold",
                opacity: 1,
                border: "2px solid gray",
              }}
            >
              <img
                src="/move-alt-svgrepo-com.png"
                alt="Move"
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          </Marker>

          <Marker longitude={markerPosition[0]} latitude={markerPosition[1]}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                backgroundColor: "white",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                color: "white",
                fontWeight: "bold",
                opacity: 1,
                border: "2px solid gray",
              }}
            >
              <img
                src="/rotate-svgrepo-com.png"
                alt="Rotate"
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          </Marker>

          <Marker
            offset={[0, 200]}
            longitude={polygonCenter[0]}
            latitude={polygonCenter[1]}
          >
            <div
              style={{
                borderRadius: "20px",
                backgroundColor: "gray",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                opacity: 1,
                border: "2px solid gray",
                padding: "5px 10px",
                gap: 10,
                color: "white",
              }}
            >
              {label}
              <img
                src="/delete-2-svgrepo-com.svg"
                alt="Rotate"
                style={{
                  width: "20px",
                  cursor: "pointer",
                  filter: "brightness(0) invert(1)",
                }}
                onClick={onDelete}
              />
            </div>
          </Marker>

          <Marker
            longitude={markerPosition[0]}
            latitude={markerPosition[1]}
            draggable
            onDrag={handleMarkerDrag}
            onDragEnd={handleMarkerDragEnd}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                display: "flex",
              }}
            ></div>
          </Marker>
        </>
      )}
    </div>
  );
};
