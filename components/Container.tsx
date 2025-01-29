"use client";
import { MapContainer } from "@/components/MapContainer";
import { Flex, Slider, Text } from "@radix-ui/themes";
import { useState } from "react";

export const Container = ({}) => {
  const [snapRadiusMetres, setSnapRadiusMetres] = useState(0.5);
  const [snapGuideRatio, setSnapGuideRatio] = useState(3);
  const [snapAngleDistance, setSnapAngleDistance] = useState(3);

  return (
    <div className="flex w-full">
      <MapContainer
        snapRadiusMetres={snapRadiusMetres}
        snapGuideRatio={snapGuideRatio}
        snapAngleDistance={snapAngleDistance}
      />
      <div className="absolute top-5 left-5 w-full max-w-64">
        <Flex direction="column" gap="2">
          <Text size="1">Snap radius: {snapRadiusMetres.toFixed(2)}m</Text>
          <Slider
            value={[snapRadiusMetres]}
            onValueChange={(value) => setSnapRadiusMetres(value[0])}
            min={0}
            max={5}
            step={0.01}
          />
          <Text size="1">Snap guide length: {snapGuideRatio}x</Text>
          <Slider
            value={[snapGuideRatio]}
            onValueChange={(value) => setSnapGuideRatio(value[0])}
            min={2}
            max={10}
            step={1}
          />
          <Text size="1">Snap angle distance: {snapAngleDistance}°</Text>
          <Slider
            value={[snapAngleDistance]}
            onValueChange={(value) => setSnapAngleDistance(value[0])}
            min={2}
            max={10}
            step={1}
          />
        </Flex>
      </div>
    </div>
  );
};
