"use client";

/**
 * Web port of celebration-card.html. Same DOM structure + animations:
 *   - Radial backdrop (300ms fade)
 *   - Card rise (550ms cubic-bezier)
 *   - Badge 16s rotation, halo 3s pulse
 *   - 120-particle canvas confetti (gravity 0.16, ~150-frame life)
 *   - Coral gradient Continue pill
 *
 * Mounted globally by CelebrationMount — receives the currently-active
 * pending UserAchievement and renders the modal. Backdrop click /
 * Escape / Continue all call onDismiss; the parent fires POST /seen
 * and dequeues the next item.
 */

import { useEffect, useRef } from "react";

type Props = {
  slug: string;
  title: string;
  description: string;
  onDismiss: () => void;
};

const COLORS = [
  "#F7D595",
  "#E89653",
  "#E0533A",
  "#7C5AE0",
  "#F4A14E",
  "#FBE6C8",
];

export function CelebrationModal({ slug, title, description, onDismiss }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Confetti — mirror of celebration-card.html canvas loop.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.42;
    type Part = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      rot: number;
      vr: number;
      shape: "circle" | "rect";
      life: number;
    };
    const parts: Part[] = [];
    for (let i = 0; i < 120; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 9;
      parts.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 4,
        size: 5 + Math.random() * 7,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        shape: Math.random() < 0.4 ? "circle" : "rect",
        life: 0,
      });
    }

    function loop() {
      if (!ctx || !cv) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      let alive = false;
      for (const p of parts) {
        p.life++;
        p.vy += 0.16;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const op = Math.max(0, 1 - p.life / 150);
        if (op > 0 && p.y < cv.height + 40) alive = true;
        ctx.globalAlpha = op;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (alive) rafRef.current = requestAnimationFrame(loop);
    }
    loop();
    const onResize = () => {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [slug]);

  // Escape key dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <>
      <style jsx global>{`
        .acu-cele-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(
            ellipse at 50% 35%,
            rgba(40, 26, 16, 0.55) 0%,
            rgba(8, 8, 16, 0.86) 70%
          );
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          animation: acuCeleFade 0.3s ease both;
        }
        @keyframes acuCeleFade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .acu-cele-confetti {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .acu-cele-card {
          position: relative;
          text-align: center;
          padding: 0 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          animation: acuCeleRise 0.55s cubic-bezier(0.16, 0.9, 0.3, 1) both;
        }
        @keyframes acuCeleRise {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.92);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .acu-cele-orb {
          position: relative;
          width: 240px;
          height: 240px;
          margin-bottom: 8px;
        }
        .acu-cele-orb .halo {
          position: absolute;
          inset: -20px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(244, 161, 78, 0.3) 0%,
            transparent 72%
          );
          filter: blur(34px);
          animation: acuHaloPulse 3s ease-in-out infinite;
        }
        @keyframes acuHaloPulse {
          0%,
          100% {
            opacity: 0.35;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.06);
          }
        }
        .acu-cele-orb .spin {
          position: absolute;
          inset: 0;
          animation: acuCeleSpin 16s linear infinite;
        }
        .acu-cele-orb img {
          width: 100%;
          height: 100%;
        }
        @keyframes acuCeleSpin {
          from {
            transform: rotate(0);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .acu-cele-kicker {
          font-family: "Geist Mono", monospace;
          font-size: 11px;
          letter-spacing: 2.4px;
          text-transform: uppercase;
          color: #e89653;
          margin: 18px 0 10px;
        }
        .acu-cele-title {
          font-size: 34px;
          font-weight: 800;
          letter-spacing: -0.8px;
          margin: 0 0 10px;
          color: #f4f1ea;
        }
        .acu-cele-desc {
          font-size: 15px;
          line-height: 1.5;
          color: #a7aec4;
          max-width: 340px;
          margin: 0 0 30px;
        }
        .acu-cele-continue {
          padding: 15px 40px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          background: linear-gradient(135deg, #f3b26b, #e07a3c);
          color: #2a1206;
          font-family: "Manrope", system-ui, -apple-system, sans-serif;
          font-weight: 700;
          font-size: 16px;
          letter-spacing: -0.2px;
          box-shadow: 0 12px 30px rgba(224, 122, 60, 0.4);
          transition: transform 0.15s;
        }
        .acu-cele-continue:active {
          transform: scale(0.97);
        }
      `}</style>
      <div
        className="acu-cele-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) onDismiss();
        }}
      >
        <canvas ref={canvasRef} className="acu-cele-confetti" />
        <div className="acu-cele-card">
          <div className="acu-cele-orb">
            <div className="halo" />
            <div className="spin">
              {/* Static SVGs live in /public/badges (shared 52-asset set
                  copied from apps/mobile/assets/badges). Earned state
                  only — the celebration is the moment of earning. */}
              <img src={`/badges/badge_${slug}_earned.svg`} alt="" />
            </div>
          </div>
          <div className="acu-cele-kicker">Achievement unlocked</div>
          <h2 className="acu-cele-title">{title}</h2>
          <p className="acu-cele-desc">{description}</p>
          <button
            className="acu-cele-continue"
            onClick={onDismiss}
            type="button"
          >
            Continue
          </button>
        </div>
      </div>
    </>
  );
}
