import { useState, type CSSProperties } from "react";

const DEFAULT_CLIP_RATIO = 0.76;
const DEFAULT_OFFSET_Y = 0;

export function FooterWatermarkTuner() {
  const [clipRatio, setClipRatio] = useState(DEFAULT_CLIP_RATIO);
  const [offsetY, setOffsetY] = useState(DEFAULT_OFFSET_Y);

  const clipPercent = Math.round(clipRatio * 100);

  return (
    <>
      <div
        className="landing-footer-watermark mt-10 w-full leading-none select-none md:mt-16"
        style={
          {
            "--watermark-clip-ratio": clipRatio,
            "--watermark-offset-y": `${offsetY}px`,
          } as CSSProperties
        }
      >
        <span className="font-display block w-full bg-linear-to-b from-primary from-20% via-primary/60 via-55% to-transparent bg-clip-text text-center text-[24vw] leading-[0.95] font-semibold tracking-[-0.015em] text-transparent lg:text-[15rem]">
          @tags
        </span>
      </div>

      <div className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-xl border border-primary/20 bg-background/95 p-4 shadow-lg backdrop-blur-md">
        <p className="mb-3 text-center text-xs font-medium text-muted-foreground">
          Temporary @tags tuner — tell me the values you like
        </p>

        <label className="mb-1 block text-sm font-medium">
          Clip height: {clipPercent}%
        </label>
        <input
          type="range"
          min={50}
          max={100}
          step={1}
          value={clipPercent}
          onChange={(event) => setClipRatio(Number(event.target.value) / 100)}
          className="mb-3 w-full accent-primary"
        />

        <label className="mb-1 block text-sm font-medium">
          Vertical offset: {offsetY}px
        </label>
        <input
          type="range"
          min={-120}
          max={120}
          step={1}
          value={offsetY}
          onChange={(event) => setOffsetY(Number(event.target.value))}
          className="w-full accent-primary"
        />

        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-center font-mono text-xs">
          clipRatio: {clipRatio.toFixed(2)} · offsetY: {offsetY}px
        </p>
      </div>
    </>
  );
}
