import React, { useEffect, useRef, useState } from 'react';

export type HoldKind = 'hold' | 'start' | 'finish';

export interface HoldMarker {
  x: number;
  y: number;
  kind: HoldKind;
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

interface ColorSample {
  hue: number;
  saturation: number;
  value: number;
}

const hexToColorSample = (hex: string): ColorSample | null => {
  const value = hex.replace('#', '');
  if (!/^[\da-f]{3}$|^[\da-f]{6}$/i.test(value)) return null;
  const fullHex = value.length === 3 ? value.split('').map((part) => part + part).join('') : value;
  const red = parseInt(fullHex.slice(0, 2), 16) / 255;
  const green = parseInt(fullHex.slice(2, 4), 16) / 255;
  const blue = parseInt(fullHex.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta > 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return { hue, saturation: max === 0 ? 0 : delta / max, value: max };
};

const pixelMatchesColor = (red: number, green: number, blue: number, target: ColorSample) => {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const value = max / 255;
  const saturation = max === 0 ? 0 : delta / max;

  if (target.saturation < 0.2) {
    if (target.value > 0.75) return value > 0.72 && saturation < 0.32;
    if (target.value < 0.2) return value < 0.22 && saturation < 0.45;
    return Math.abs(value - target.value) < 0.16 && saturation < 0.28;
  }

  if (saturation < 0.24 || value < 0.1 || value > 0.98) return false;
  let hue = 0;
  if (delta > 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const hueDistance = Math.min(Math.abs(hue - target.hue), 360 - Math.abs(hue - target.hue));
  return hueDistance <= 22;
};

const findColorRegions = (pixels: Uint8ClampedArray, width: number, height: number, color: string) => {
  const target = hexToColorSample(color);
  if (!target) return [] as Array<{ x: number; y: number; area: number }>;

  const total = width * height;
  const mask = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    const pixelIndex = index * 4;
    if (pixelMatchesColor(pixels[pixelIndex], pixels[pixelIndex + 1], pixels[pixelIndex + 2], target)) {
      mask[index] = 1;
    }
  }

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const minimumArea = Math.max(18, Math.floor(total * 0.00006));
  const maximumArea = Math.floor(total * 0.12);
  const regions: Array<{ x: number; y: number; area: number }> = [];

  for (let index = 0; index < total; index += 1) {
    if (!mask[index] || visited[index]) continue;

    let head = 0;
    let tail = 0;
    queue[tail] = index;
    tail += 1;
    visited[index] = 1;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (head < tail) {
      const current = queue[head];
      head += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (!mask[next] || visited[next]) continue;
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
    }

    if (area < minimumArea || area > maximumArea || maxX - minX < 3 || maxY - minY < 3) continue;
    regions.push({ x: sumX / area / width, y: sumY / area / height, area });
  }

  const selected: typeof regions = [];
  for (const region of regions.sort((a, b) => b.area - a.area)) {
    const isNearAnother = selected.some((existing) => Math.hypot(existing.x - region.x, existing.y - region.y) < 0.02);
    if (!isNearAnother) selected.push(region);
  }
  return selected.slice(0, 80);
};

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
    setAnalysisMessage('Looking for holds that match the selected color…');
    const photo = new Image();
    photo.crossOrigin = 'anonymous';
    photo.onload = () => {
      if (cancelled) return;
      try {
        const scale = Math.min(1, 720 / Math.max(photo.naturalWidth, photo.naturalHeight));
        const width = Math.max(1, Math.round(photo.naturalWidth * scale));
        const height = Math.max(1, Math.round(photo.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Canvas is unavailable');
        context.drawImage(photo, 0, 0, width, height);
        const regions = findColorRegions(context.getImageData(0, 0, width, height).data, width, height, color);

        if (regions.length >= 2) {
          const ordered = [...regions].sort((a, b) => b.y - a.y);
          const detected: HoldMarker[] = ordered.map((region, index) => ({
            x: region.x,
            y: region.y,
            kind: index === 0 ? 'start' : index === ordered.length - 1 ? 'finish' : 'hold',
          }));
          onChangeRef.current(detected);
          setStatus('detected');
          setAnalysisMessage('Found ' + detected.length + ' color-matched regions. The lowest is marked as start and the highest as finish; please check them.');
        } else {
          onChangeRef.current(regions.map((region) => ({ x: region.x, y: region.y, kind: 'hold' })));
          setStatus('needs-help');
          setAnalysisMessage('I could not confidently find enough holds. Choose a marker below, then tap the photo to mark the holds, start, and finish.');
        }
      } catch {
        if (cancelled) return;
        setStatus('needs-help');
        setAnalysisMessage('Automatic scanning did not work for this photo. You can still mark the holds, start, and finish by hand.');
      }
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
          <p className="mt-1 text-xs text-zinc-500">Color scanning runs on this device; the photo is not sent to an AI service.</p>
        </div>
        <button
          type="button"
          disabled={!color || status === 'analyzing'}
          onClick={() => setAnalysisVersion((version) => version + 1)}
          className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          {status === 'analyzing' ? 'Scanning…' : 'Scan again'}
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
        {markers.map((marker, index) => (
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
    {markers.map((marker, index) => (
      <span
        key={'preview-' + index + '-' + marker.x + '-' + marker.y}
        className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[10px] font-black text-white shadow-[0_0_0_2px_rgba(0,0,0,0.75)]"
        style={{ left: (marker.x * 100) + '%', top: (marker.y * 100) + '%', backgroundColor: kindColor(marker.kind, color || '') }}
      >
        {kindBadge(marker.kind, index)}
      </span>
    ))}
  </div>
);
