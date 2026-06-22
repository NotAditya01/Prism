import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { gsap } from "gsap";
import { InertiaPlugin } from "gsap/InertiaPlugin";

import "./DotGrid.css";

gsap.registerPlugin(InertiaPlugin);

type DotGridProps = {
  dotSize?: number;
  gap?: number;
  baseColor?: string;
  activeColor?: string;
  proximity?: number;
  speedTrigger?: number;
  shockRadius?: number;
  shockStrength?: number;
  maxSpeed?: number;
  resistance?: number;
  returnDuration?: number;
  idleMotion?: number;
  idleSpeed?: number;
  className?: string;
  style?: CSSProperties;
};

type Dot = {
  cx: number;
  cy: number;
  xOffset: number;
  yOffset: number;
  inertiaApplied: boolean;
};

type PointerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  lastTime: number;
  lastX: number;
  lastY: number;
};

function throttle<T extends (...args: never[]) => void>(callback: T, limit: number) {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = performance.now();
    if (now - lastCall < limit) return;
    lastCall = now;
    callback(...args);
  };
}

function hexToRgb(hex: string) {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16),
  };
}

export default function DotGrid({
  dotSize = 16,
  gap = 32,
  baseColor = "#5227FF",
  activeColor = "#5227FF",
  proximity = 150,
  speedTrigger = 100,
  shockRadius = 250,
  shockStrength = 5,
  maxSpeed = 5000,
  resistance = 750,
  returnDuration = 1.5,
  idleMotion = 0,
  idleSpeed = 0.001,
  className = "",
  style,
}: DotGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const pointerRef = useRef<PointerState>({
    x: -10_000,
    y: -10_000,
    vx: 0,
    vy: 0,
    speed: 0,
    lastTime: 0,
    lastX: 0,
    lastY: 0,
  });

  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);
  const circlePath = useMemo(() => {
    if (typeof window === "undefined" || !window.Path2D) return null;
    const path = new Path2D();
    path.arc(0, 0, dotSize / 2, 0, Math.PI * 2);
    return path;
  }, [dotSize]);

  const buildGrid = useCallback(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const { width, height } = wrapper.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (context) context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const cellSize = dotSize + gap;
    const columns = Math.max(1, Math.floor((width + gap) / cellSize));
    const rows = Math.max(1, Math.floor((height + gap) / cellSize));
    const startX = (width - (cellSize * columns - gap)) / 2 + dotSize / 2;
    const startY = (height - (cellSize * rows - gap)) / 2 + dotSize / 2;
    const dots: Dot[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        dots.push({
          cx: startX + column * cellSize,
          cy: startY + row * cellSize,
          xOffset: 0,
          yOffset: 0,
          inertiaApplied: false,
        });
      }
    }
    dotsRef.current = dots;
  }, [dotSize, gap]);

  useEffect(() => {
    if (!circlePath) return;
    const dotPath: Path2D = circlePath;
    let frame = 0;
    const proximitySquared = proximity * proximity;

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / pixelRatio;
      const height = canvas.height / pixelRatio;
      context.clearRect(0, 0, width, height);

      const { x: pointerX, y: pointerY } = pointerRef.current;
      const time = performance.now() * idleSpeed;
      for (const dot of dotsRef.current) {
        const dx = dot.cx - pointerX;
        const dy = dot.cy - pointerY;
        const distanceSquared = dx * dx + dy * dy;
        let fill = baseColor;
        let depthScale = 1;
        let glow = 0;
        if (distanceSquared <= proximitySquared) {
          const mix = 1 - Math.sqrt(distanceSquared) / proximity;
          const red = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * mix);
          const green = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * mix);
          const blue = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * mix);
          fill = `rgb(${red}, ${green}, ${blue})`;
          depthScale = 1 + mix * 0.6;
          glow = mix * 14;
        }

        const idleX = Math.sin(time + dot.cy * 0.018) * idleMotion;
        const idleY = Math.cos(time * 0.82 + dot.cx * 0.016) * idleMotion;

        context.save();
        context.translate(dot.cx + dot.xOffset + idleX, dot.cy + dot.yOffset + idleY);
        context.scale(depthScale, depthScale);
        context.fillStyle = fill;
        context.shadowBlur = glow;
        context.shadowColor = activeColor;
        context.fill(dotPath);
        context.restore();
      }
      frame = window.requestAnimationFrame(draw);
    }

    draw();
    return () => window.cancelAnimationFrame(frame);
  }, [activeColor, activeRgb, baseColor, baseRgb, circlePath, idleMotion, idleSpeed, proximity]);

  useEffect(() => {
    buildGrid();
    const observer = new ResizeObserver(buildGrid);
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [buildGrid]);

  useEffect(() => {
    function returnDot(dot: Dot) {
      gsap.to(dot, {
        xOffset: 0,
        yOffset: 0,
        duration: returnDuration,
        ease: "elastic.out(1, 0.75)",
        onComplete: () => {
          dot.inertiaApplied = false;
        },
      });
    }

    function onMove(event: MouseEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const now = performance.now();
      const pointer = pointerRef.current;
      const elapsed = pointer.lastTime ? Math.max(now - pointer.lastTime, 1) : 16;
      const deltaX = event.clientX - pointer.lastX;
      const deltaY = event.clientY - pointer.lastY;
      let velocityX = (deltaX / elapsed) * 1000;
      let velocityY = (deltaY / elapsed) * 1000;
      let pointerSpeed = Math.hypot(velocityX, velocityY);
      if (pointerSpeed > maxSpeed) {
        const scale = maxSpeed / pointerSpeed;
        velocityX *= scale;
        velocityY *= scale;
        pointerSpeed = maxSpeed;
      }

      const rect = canvas.getBoundingClientRect();
      Object.assign(pointer, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        vx: velocityX,
        vy: velocityY,
        speed: pointerSpeed,
        lastTime: now,
        lastX: event.clientX,
        lastY: event.clientY,
      });

      for (const dot of dotsRef.current) {
        const distance = Math.hypot(dot.cx - pointer.x, dot.cy - pointer.y);
        if (pointerSpeed <= speedTrigger || distance >= proximity || dot.inertiaApplied) continue;
        dot.inertiaApplied = true;
        gsap.killTweensOf(dot);
        gsap.to(dot, {
          inertia: {
            xOffset: dot.cx - pointer.x + velocityX * 0.005,
            yOffset: dot.cy - pointer.y + velocityY * 0.005,
            resistance,
          },
          onComplete: () => returnDot(dot),
        });
      }
    }

    function onClick(event: MouseEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      for (const dot of dotsRef.current) {
        const distance = Math.hypot(dot.cx - clickX, dot.cy - clickY);
        if (distance >= shockRadius || dot.inertiaApplied) continue;
        const falloff = Math.max(0, 1 - distance / shockRadius);
        dot.inertiaApplied = true;
        gsap.killTweensOf(dot);
        gsap.to(dot, {
          inertia: {
            xOffset: (dot.cx - clickX) * shockStrength * falloff,
            yOffset: (dot.cy - clickY) * shockStrength * falloff,
            resistance,
          },
          onComplete: () => returnDot(dot),
        });
      }
    }

    const throttledMove = throttle(onMove, 50);
    window.addEventListener("mousemove", throttledMove, { passive: true });
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("mousemove", throttledMove);
      window.removeEventListener("click", onClick);
      gsap.killTweensOf(dotsRef.current);
    };
  }, [maxSpeed, proximity, resistance, returnDuration, shockRadius, shockStrength, speedTrigger]);

  return (
    <section aria-hidden="true" className={`dot-grid ${className}`} style={style}>
      <div className="dot-grid__wrap" ref={wrapperRef}>
        <canvas className="dot-grid__canvas" ref={canvasRef} />
      </div>
    </section>
  );
}
