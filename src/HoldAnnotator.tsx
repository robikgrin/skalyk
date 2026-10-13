import React, { useEffect, useRef, useState } from 'react';
import { detectColoredHolds } from './climbingHoldModel';

export type HoldKind = 'hold' | 'start' | 'finish';

export interface HoldMarker {
  x: number;
  y: number;
  kind: HoldKind;
  contour?: Array<{ x: number; y: number }>;
}

export const HOLD_COLOR_OPTIONS = [
  { label: 'Red', hex: '#ef4444' },
  { label: 'Orange', hex: '#f97316' },
  { label: 'Yellow', hex: '#eab308' },
  { label: 'Green', hex: '#22c55e' },
  { label: 'Blue', hex: '#3b82f6' },
  { label: 'Purple', hex: '#a855f7' },
  { label: 'Pink', hex: '#ec4899' },
  { label: 'White', hex: '#f8fafc' },
  { label: 'Black', hex: '#171717' },
];

interface HoldAnnotatorProps {
  image: string;
  color: string;
  markers: HoldMarker[];
  onChange: (markers: HoldMarker[]) => void;
}

const kindLabel = (kind: HoldKind) => {
  if (kind === 'start') return 'Start';
  if (kind === 'finish') return 'Finish';
  return 'Hold';
};

const kindBadge = (kind: HoldKind, index: number) => {
  if (kind === 'start') return 'S';
  if (kind === 'finish') return 'F';
  return String(index + 1);
};

const kindColor = (kind: HoldKind, holdColor: string) => {
  if (kind === 'start') return '#84cc16';
  if (kind === 'finish') return '#f97316';
  return holdColor || '#3b82f6';
};

const contourPath = (marker: HoldMarker) => marker.contour?.length
  ? 'M ' + marker.contour.map((point) => point.x + ' ' + point.y).join(' L ') + ' Z'
  : '';

export const HoldAnnotator = ({ image, color, markers, onChange }: HoldAnnotatorProps) => {
  const [activeTool, setActiveTool] = useState<HoldKind>('hold');
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'detected' | 'needs-help' | 'manual'>(
    markers.length >= 2 ? 'detected' : 'idle',
  );
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const firstRun = useRef(true);
  const previousInput = useRef({ image, color });
  const markersRef = useRef(markers);
  const onChangeRef = useRef(onChange);

  useEffect(() => { markersRef.current = markers; }, [markers]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const isFirstRun = firstRun.current;
    const imageChanged = previousInput.current.image !== image;
    const colorChanged = previousInput.current.color !== color;
    firstRun.current = false;
    previousInput.current = { image, color };

    if (!image || !color) {
      setStatus('idle');
      setAnalysisMessage('');
      return undefined;
    }
    if (isFirstRun && markersRef.current.length > 0 && analysisVersion === 0) return undefined;
    if (!isFirstRun && !imageChanged && !colorChanged && analysisVersion === 0) return undefined;

    let cancelled = false;
    onChangeRef.current([]);
    setStatus('analyzing');
    setAnalysisMessage('Loading the pretrained climbing-hold model and checking the selected color…');
    const photo = new Image();
    photo.crossOrigin = 'anonymous';
    photo.onload = () => {
      if (cancelled) return;
      void (async () => {
        try {
          const detected = await detectColoredHolds(photo, color);
          if (cancelled) return;
          onChangeRef.current(detected);
          if (detected.length >= 2) {
            setStatus('detected');
            setAnalysisMessage('Outlined ' + detected.length + ' likely holds matching this color. Check the suggested start and finish and add or remove outlines if needed.');
          } else {
            setStatus('needs-help');
            setAnalysisMessage('The model found only ' + detected.length + ' clear hold(s) in this color. Add the missing holds, start, and finish by hand.');
          }
        } catch (error) {
          if (cancelled) return;
          console.error('Climbing-hold model inference failed:', error);
          onChangeRef.current([]);
          setStatus('needs-help');
          setAnalysisMessage('The model could not be loaded. Try again when online, or mark the holds, start, and finish by hand.');
        }
      })();
    };
    photo.onerror = () => {
      if (cancelled) return;
      setStatus('needs-help');
      setAnalysisMessage('This photo could not be scanned automatically. Mark the holds, start, and finish by hand.');
    };
    photo.src = image;

    return () => { cancelled = true; };
  }, [image, color, analysisVersion]);

  const addOrUpdateMarker = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const marker: HoldMarker = {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
      kind: activeTool,
    };
    const nearbyIndex = markers.findIndex((existing) => Math.hypot(existing.x - marker.x, existing.y - marker.y) < 0.035);
    const next = [...markers];
    if (nearbyIndex >= 0) next[nearbyIndex] = marker;
    else next.push(marker);
    onChange(next);
    setStatus('manual');
    setAnalysisMessage(next.length + ' markers placed. Tap a marker tool, then tap the photo to add or move it.');
  };

  const updateMarkerKind = (index: number, kind: HoldKind) => {
    onChange(markers.map((marker, markerIndex) => markerIndex === index ? { ...marker, kind } : marker));
    setStatus('manual');
  };

  const removeMarker = (index: number) => {
    onChange(markers.filter((_, markerIndex) => markerIndex !== index));
    setStatus('manual');
  };

  const toolButton = (kind: HoldKind, label: string) => (
    <button
      key={kind}
      type="button"
      onClick={() => setActiveTool(kind)}
      className={'rounded-lg border px-3 py-2 text-xs font-bold uppercase transition-colors ' + (activeTool === kind ? 'border-lime-400 bg-lime-400 text-zinc-950' : 'border-zinc-700 bg-zinc-900 text-zinc-300')}
    >
      {label}
    </button>
  );

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">Route photo marks</h3>
          <p className="mt-1 text-xs text-zinc-500">Photo analysis runs on this device; the photo is not sent to an AI service.</p>
        </div>
        <button
          type="button"
          disabled={!color || status === 'analyzing'}
          onClick={() => setAnalysisVersion((version) => version + 1)}
          className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          {status === 'analyzing' ? 'Analyzing…' : 'Analyze again'}
        </button>
      </div>
      <div className={'rounded-lg px-3 py-2 text-xs ' + (status === 'needs-help' ? 'bg-orange-500/10 text-orange-200' : 'bg-zinc-900 text-zinc-400')}>
        {!color ? 'Choose the route color to start scanning.' : analysisMessage || 'Choose the route color to start scanning.'}
      </div>

      <div
        className="relative w-full cursor-crosshair select-none overflow-hidden rounded-xl bg-zinc-950"
        onClick={addOrUpdateMarker}
        aria-label="Route photo. Tap to add or move a marker."
      >
        <img src={image} alt="Climbing wall route" className="block h-auto w-full" draggable={false} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          {markers.filter((marker) => marker.contour && marker.contour.length > 2).map((marker, index) => (
            <g key={'contour-' + index}>
              <path d={contourPath(marker)} fill="none" stroke="#111827" strokeWidth="6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              <path d={contourPath(marker)} fill="none" stroke="#bef264" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </g>
          ))}
        </svg>
        {markers.map((marker, index) => (
          marker.kind === 'hold' && marker.contour
            ? null
            : (
          <button
            key={String(index) + '-' + marker.x + '-' + marker.y}
            type="button"
            title={kindLabel(marker.kind) + '. Choose a tool and tap this marker to change it.'}
            aria-label={kindLabel(marker.kind) + ' marker ' + (index + 1)}
            onClick={(event) => {
              event.stopPropagation();
              updateMarkerKind(index, activeTool);
            }}
            className="absolute z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[10px] font-black text-white shadow-[0_0_0_2px_rgba(0,0,0,0.75)]"
            style={{ left: (marker.x * 100) + '%', top: (marker.y * 100) + '%', backgroundColor: kindColor(marker.kind, color) }}
          >
            {kindBadge(marker.kind, index)}
          </button>
            )
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Tap photo as:</span>
        {toolButton('hold', 'Hold')}
        {toolButton('start', 'Start')}
        {toolButton('finish', 'Finish')}
      </div>

      {markers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {markers.map((marker, index) => (
            <button
              key={'marker-chip-' + index}
              type="button"
              onClick={() => removeMarker(index)}
              className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-orange-500"
              title="Remove this marker"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: kindColor(marker.kind, color) }} />
              {kindLabel(marker.kind)} {marker.kind === 'hold' ? index + 1 : ''}
              <span className="text-zinc-500">×</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export const HoldPhotoPreview = ({ image, color, markers }: { image: string; color?: string; markers: HoldMarker[] }) => (
  <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-950">
    <img src={image} alt="Route holds with start and finish marked" className="block h-auto w-full" />
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      {markers.filter((marker) => marker.contour && marker.contour.length > 2).map((marker, index) => (
        <g key={'preview-contour-' + index}>
          <path d={contourPath(marker)} fill="none" stroke="#111827" strokeWidth="6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <path d={contourPath(marker)} fill="none" stroke="#bef264" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </g>
      ))}
    </svg>
    {markers.map((marker, index) => (
      marker.kind === 'hold' && marker.contour
        ? null
        : (
      <span
        key={'preview-' + index + '-' + marker.x + '-' + marker.y}
        className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[10px] font-black text-white shadow-[0_0_0_2px_rgba(0,0,0,0.75)]"
        style={{ left: (marker.x * 100) + '%', top: (marker.y * 100) + '%', backgroundColor: kindColor(marker.kind, color || '') }}
      >
        {kindBadge(marker.kind, index)}
      </span>
        )
    ))}
  </div>
);
