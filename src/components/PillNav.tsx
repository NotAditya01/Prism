import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { gsap } from "gsap";

import "./PillNav.css";

export type PillNavItem = {
  label: string;
  href?: string;
  active?: boolean;
  onSelect?: () => void;
};

type PillNavProps = {
  logo: ReactNode;
  brand: string;
  items: PillNavItem[];
  className?: string;
  ease?: string;
  baseColor?: string;
  pillColor?: string;
  hoverColor?: string;
  hoveredPillTextColor?: string;
  pillTextColor?: string;
  initialLoadAnimation?: boolean;
  onLogoClick: () => void;
};

export default function PillNav({
  logo,
  brand,
  items,
  className = "",
  ease = "power2.out",
  baseColor = "#18201D",
  pillColor = "#202925",
  hoverColor = "#B5F35B",
  hoveredPillTextColor = "#18201D",
  pillTextColor = "#F5F1E6",
  initialLoadAnimation = true,
  onLogoClick,
}: PillNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const itemSignature = items.map((item) => `${item.label}:${item.href ?? "button"}:${item.active ? "active" : "idle"}`).join("|");
  const circleRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const timelineRefs = useRef<Array<gsap.core.Timeline | null>>([]);
  const tweenRefs = useRef<Array<gsap.core.Tween | null>>([]);
  const logoRef = useRef<HTMLButtonElement>(null);
  const logoTweenRef = useRef<gsap.core.Tween | null>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function layout() {
      circleRefs.current.forEach((circle, index) => {
        if (!circle?.parentElement) return;
        const pill = circle.parentElement;
        const { width, height } = pill.getBoundingClientRect();
        const radius = ((width * width) / 4 + height * height) / (2 * height);
        const diameter = Math.ceil(2 * radius) + 2;
        const delta = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - (width * width) / 4))) + 1;
        const originY = diameter - delta;
        circle.style.width = `${diameter}px`;
        circle.style.height = `${diameter}px`;
        circle.style.bottom = `-${delta}px`;
        gsap.set(circle, { xPercent: -50, scale: 0, transformOrigin: `50% ${originY}px` });

        const label = pill.querySelector<HTMLElement>(".pill-label");
        const hoverLabel = pill.querySelector<HTMLElement>(".pill-label-hover");
        if (label) gsap.set(label, { y: 0 });
        if (hoverLabel) gsap.set(hoverLabel, { y: height + 12, opacity: 0 });

        timelineRefs.current[index]?.kill();
        const timeline = gsap.timeline({ paused: true });
        timeline.to(circle, { scale: 1.2, xPercent: -50, duration: 2, ease, overwrite: "auto" }, 0);
        if (label) timeline.to(label, { y: -(height + 8), duration: 2, ease, overwrite: "auto" }, 0);
        if (hoverLabel) timeline.to(hoverLabel, { y: 0, opacity: 1, duration: 2, ease, overwrite: "auto" }, 0);
        timelineRefs.current[index] = timeline;
      });
    }

    layout();
    window.addEventListener("resize", layout);
    void document.fonts?.ready.then(layout).catch(() => undefined);
    if (menuRef.current) gsap.set(menuRef.current, { visibility: "hidden", opacity: 0, y: 10 });

    if (initialLoadAnimation) {
      if (logoRef.current) gsap.fromTo(logoRef.current, { scale: 0 }, { scale: 1, duration: 0.55, ease });
      if (itemsRef.current) gsap.fromTo(itemsRef.current, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.65, ease });
    }

    return () => {
      window.removeEventListener("resize", layout);
      timelineRefs.current.forEach((timeline) => timeline?.kill());
      tweenRefs.current.forEach((tween) => tween?.kill());
    };
  }, [ease, initialLoadAnimation, itemSignature]);

  function animateTo(index: number, end: boolean) {
    const timeline = timelineRefs.current[index];
    if (!timeline) return;
    tweenRefs.current[index]?.kill();
    tweenRefs.current[index] = timeline.tweenTo(end ? timeline.duration() : 0, {
      duration: end ? 0.3 : 0.2,
      ease,
      overwrite: "auto",
    });
  }

  function rotateLogo() {
    const logoElement = logoRef.current?.querySelector("svg");
    if (!logoElement) return;
    logoTweenRef.current?.kill();
    gsap.set(logoElement, { rotate: 0 });
    logoTweenRef.current = gsap.to(logoElement, { rotate: 360, duration: 0.35, ease, overwrite: "auto" });
  }

  function toggleMobile() {
    const next = !mobileOpen;
    setMobileOpen(next);
    const lines = hamburgerRef.current?.querySelectorAll(".hamburger-line");
    if (lines?.length === 2) {
      gsap.to(lines[0], { rotation: next ? 45 : 0, y: next ? 3 : 0, duration: 0.25, ease });
      gsap.to(lines[1], { rotation: next ? -45 : 0, y: next ? -3 : 0, duration: 0.25, ease });
    }
    if (menuRef.current) {
      if (next) {
        gsap.set(menuRef.current, { visibility: "visible" });
        gsap.to(menuRef.current, { opacity: 1, y: 0, duration: 0.28, ease });
      } else {
        gsap.to(menuRef.current, {
          opacity: 0,
          y: 10,
          duration: 0.2,
          ease,
          onComplete: () => gsap.set(menuRef.current, { visibility: "hidden" }),
        });
      }
    }
  }

  function select(item: PillNavItem) {
    setMobileOpen(false);
    item.onSelect?.();
  }

  const variables = {
    "--pill-base": baseColor,
    "--pill-bg": pillColor,
    "--pill-hover": hoverColor,
    "--pill-hover-text": hoveredPillTextColor,
    "--pill-text": pillTextColor,
  } as CSSProperties;

  return (
    <div className={`pill-nav-container ${className}`} style={variables}>
      <nav aria-label="Primary navigation" className="pill-nav-shell">
        <button aria-label="PRISM home" className="pill-logo" onClick={onLogoClick} onMouseEnter={rotateLogo} ref={logoRef} type="button">
          {logo}
          <span>{brand}</span>
        </button>

        <div className="pill-nav-items pill-desktop" ref={itemsRef}>
          <ul className="pill-list">
            {items.map((item, index) => (
              <li key={`${item.label}-${item.href ?? index}`}>
                {item.href ? (
                  <a className={`pill${item.active ? " is-active" : ""}`} href={item.href} onMouseEnter={() => animateTo(index, true)} onMouseLeave={() => animateTo(index, false)}>
                    <PillContents item={item} refCallback={(element) => { circleRefs.current[index] = element; }} />
                  </a>
                ) : (
                  <button className={`pill${item.active ? " is-active" : ""}`} onClick={() => select(item)} onMouseEnter={() => animateTo(index, true)} onMouseLeave={() => animateTo(index, false)} type="button">
                    <PillContents item={item} refCallback={(element) => { circleRefs.current[index] = element; }} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <button aria-label="Toggle navigation" className="pill-mobile mobile-menu-button" onClick={toggleMobile} ref={hamburgerRef} type="button">
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
      </nav>

      <div className="mobile-menu-popover pill-mobile" ref={menuRef}>
        {items.map((item) => item.href ? (
          <a className={`mobile-menu-link${item.active ? " is-active" : ""}`} href={item.href} key={item.label}>{item.label}</a>
        ) : (
          <button className={`mobile-menu-link${item.active ? " is-active" : ""}`} key={item.label} onClick={() => select(item)} type="button">{item.label}</button>
        ))}
      </div>
    </div>
  );
}

function PillContents({ item, refCallback }: { item: PillNavItem; refCallback: (element: HTMLSpanElement | null) => void }) {
  return (
    <>
      <span aria-hidden="true" className="hover-circle" ref={refCallback} />
      <span className="label-stack">
        <span className="pill-label">{item.label}</span>
        <span aria-hidden="true" className="pill-label-hover">{item.label}</span>
      </span>
    </>
  );
}
