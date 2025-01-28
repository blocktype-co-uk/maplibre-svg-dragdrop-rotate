"use client";
import { MapContainer } from "@/components/MapContainer";
import { Flex, Slider, Text } from "@radix-ui/themes";
import { useState } from "react";

export const Container = ({}) => {
  const [snapRadiusMetres, setSnapRadiusMetres] = useState(0.5);

  return (
    <div className="flex w-full">
      <MapContainer snapRadiusMetres={snapRadiusMetres} />
      <div className="absolute top-5 left-5 w-full max-w-64">
        <Flex direction="row" align="center" gap="2">
          <Slider
            value={[snapRadiusMetres]}
            onValueChange={(value) => setSnapRadiusMetres(value[0])}
            min={0}
            max={5}
            step={0.01}
          />
          <Text size="1">{snapRadiusMetres.toFixed(2)}&nbsp;(m)</Text>
        </Flex>
      </div>
    </div>
  );
};
