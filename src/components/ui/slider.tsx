import * as React from "react";

import { cn } from "@/lib/utils";

type SliderProps = {
  className?: string;
  max: number;
  min: number;
  onValueChange: (value: number[]) => void;
  step?: number;
  value: number[];
};

function Slider({ className, max, min, onValueChange, step = 1, value }: SliderProps) {
  const values = value.length === 1 ? [value[0]] : [Math.min(value[0], value[1]), Math.max(value[0], value[1])];
  const range = max - min;
  const left = ((values[0] - min) / range) * 100;
  const right = value.length === 1 ? 100 - left : 100 - ((values[1] - min) / range) * 100;

  function update(index: number, next: number) {
    if (value.length === 1) {
      onValueChange([next]);
      return;
    }

    const draft = [...values];
    draft[index] = next;
    onValueChange([Math.min(draft[0], draft[1]), Math.max(draft[0], draft[1])]);
  }

  return (
    <div className={cn("relative h-7", className)}>
      <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-secondary" />
      <div
        className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary"
        style={{ left: `${left}%`, right: `${right}%` }}
      />
      {values.map((item, index) => (
        <input
          aria-label={index === 0 ? "Minimum value" : "Maximum value"}
          className="pointer-events-none absolute inset-0 h-7 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary"
          key={index}
          max={max}
          min={min}
          onChange={(event) => update(index, Number(event.target.value))}
          step={step}
          type="range"
          value={item}
        />
      ))}
    </div>
  );
}

export { Slider };
