import type { HoldMarker } from './HoldAnnotator';

const MODEL_SIDE = 2560;
const MODEL_URL =
  'https://huggingface.co/jwlarocque/yolov8n-freeclimbs-detect-2/resolve/70bfd1ab33c90a8d5e37715843daf72416f88335/yolov8n-freeclimbs-detect-2-fp32.onnx';
const SCORE_THRESHOLD = 0.32;
const NMS_IOU_THRESHOLD = 0.45;
const MAX_NMS_CANDIDATES = 5000;
const MAX_DETECTIONS = 2000;

interface ColorSample {
  hue: number;
  saturation: number;
  value: number;
}

interface TensorLike {
  data: Float32Array | Float64Array;
  dims: readonly number[];
}

interface SessionLike {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, TensorLike>>;
}

interface Detection {
  left: number;
  top: number;
  right: number;
  bottom: number;
  score: number;
}

interface PixelPoint {
  x: number;
  y: number;
}

interface BoundaryEdge {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  used: boolean;
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

const pixelMatchesColor = (redByte: number, greenByte: number, blueByte: number, target: ColorSample) => {
  const red = redByte / 255;
  const green = greenByte / 255;
  const blue = blueByte / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const value = max;
  const saturation = max === 0 ? 0 : delta / max;

  if (target.saturation < 0.2) {
    if (target.value > 0.75) return value > 0.72 && saturation < 0.32;
    if (target.value < 0.2) return value < 0.22 && saturation < 0.45;
    return Math.abs(value - target.value) < 0.16 && saturation < 0.28;
  }

  if (saturation < 0.36 || value < 0.12 || value > 0.98) return false;
  let hue = 0;
  if (delta > 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const hueDistance = Math.min(Math.abs(hue - target.hue), 360 - Math.abs(hue - target.hue));
  return hueDistance <= 20;
};

let sessionPromise: Promise<SessionLike> | null = null;

const getModelSession = async (): Promise<SessionLike> => {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.wasmPaths = new URL(`${import.meta.env.BASE_URL}ort/`, window.location.origin).href;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      return await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      }) as unknown as SessionLike;
    })().catch((error: unknown) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
};

const intersectionOverUnion = (left: Detection, right: Detection) => {
  const intersectionWidth = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const intersectionHeight = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  const intersection = intersectionWidth * intersectionHeight;
  const leftArea = (left.right - left.left) * (left.bottom - left.top);
  const rightArea = (right.right - right.left) * (right.bottom - right.top);
  const union = leftArea + rightArea - intersection;
  return union > 0 ? intersection / union : 0;
};

const decodeDetections = (output: TensorLike): Detection[] => {
  if (output.dims.length !== 3 || output.dims[0] !== 1) {
    throw new Error('The climbing-hold model returned an unsupported output shape.');
  }

  const attributesFirst = output.dims[1] < output.dims[2];
  const attributeCount = attributesFirst ? output.dims[1] : output.dims[2];
  const predictionCount = attributesFirst ? output.dims[2] : output.dims[1];
  if (attributeCount < 5 || predictionCount < 1) {
    throw new Error('The climbing-hold model returned no detections.');
  }

  const getValue = (prediction: number, attribute: number) => (
    attributesFirst
      ? output.data[attribute * predictionCount + prediction]
      : output.data[prediction * attributeCount + attribute]
  );
  // Ultralytics can export either raw YOLO predictions (cx, cy, w, h, scores)
  // or an NMS-enabled output (x1, y1, x2, y2, score, class).
  const nmsOutput = attributeCount === 6 && predictionCount <= 3000;
  const detections: Detection[] = [];

  for (let prediction = 0; prediction < predictionCount; prediction += 1) {
    let score: number;
    let left: number;
    let top: number;
    let right: number;
    let bottom: number;

    if (nmsOutput) {
      score = getValue(prediction, 4);
      left = getValue(prediction, 0);
      top = getValue(prediction, 1);
      right = getValue(prediction, 2);
      bottom = getValue(prediction, 3);
    } else {
      score = 0;
      for (let attribute = 4; attribute < attributeCount; attribute += 1) {
        score = Math.max(score, getValue(prediction, attribute));
      }
      const centerX = getValue(prediction, 0);
      const centerY = getValue(prediction, 1);
      const width = getValue(prediction, 2);
      const height = getValue(prediction, 3);
      left = centerX - width / 2;
      top = centerY - height / 2;
      right = centerX + width / 2;
      bottom = centerY + height / 2;
    }

    if (!Number.isFinite(score) || score < SCORE_THRESHOLD) continue;
    if ([left, top, right, bottom].some((coordinate) => !Number.isFinite(coordinate))) continue;
    if (Math.max(Math.abs(left), Math.abs(top), Math.abs(right), Math.abs(bottom)) <= 2) {
      left *= MODEL_SIDE;
      top *= MODEL_SIDE;
      right *= MODEL_SIDE;
      bottom *= MODEL_SIDE;
    }

    const detection = {
      left: Math.max(0, Math.min(MODEL_SIDE, left)),
      top: Math.max(0, Math.min(MODEL_SIDE, top)),
      right: Math.max(0, Math.min(MODEL_SIDE, right)),
      bottom: Math.max(0, Math.min(MODEL_SIDE, bottom)),
      score,
    };
    if (detection.right - detection.left < 2 || detection.bottom - detection.top < 2) continue;
    detections.push(detection);
  }

  detections.sort((left, right) => right.score - left.score);
  const selected: Detection[] = [];
  for (const detection of detections.slice(0, MAX_NMS_CANDIDATES)) {
    if (selected.some((existing) => intersectionOverUnion(existing, detection) > NMS_IOU_THRESHOLD)) continue;
    selected.push(detection);
    if (selected.length >= MAX_DETECTIONS) break;
  }
  return selected;
};

const getVertexKey = (x: number, y: number) => x + ',' + y;

const polygonArea = (points: PixelPoint[]) => {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
};

const squaredDistanceFromSegment = (point: PixelPoint, start: PixelPoint, end: PixelPoint) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  if (deltaX === 0 && deltaY === 0) {
    const pointDeltaX = point.x - start.x;
    const pointDeltaY = point.y - start.y;
    return pointDeltaX * pointDeltaX + pointDeltaY * pointDeltaY;
  }
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / (deltaX * deltaX + deltaY * deltaY)));
  const closestX = start.x + projection * deltaX;
  const closestY = start.y + projection * deltaY;
  const pointDeltaX = point.x - closestX;
  const pointDeltaY = point.y - closestY;
  return pointDeltaX * pointDeltaX + pointDeltaY * pointDeltaY;
};

const simplifyOpenPolygon = (points: PixelPoint[], tolerance: number) => {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const toleranceSquared = tolerance * tolerance;

  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop() as [number, number];
    let farthestIndex = -1;
    let farthestDistance = toleranceSquared;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = squaredDistanceFromSegment(points[index], points[startIndex], points[endIndex]);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestIndex < 0) continue;
    keep[farthestIndex] = 1;
    stack.push([startIndex, farthestIndex], [farthestIndex, endIndex]);
  }

  return points.filter((_, index) => keep[index] === 1);
};

const simplifyClosedPolygon = (points: PixelPoint[], tolerance: number) => {
  if (points.length <= 4) return points;
  let farthestIndex = 1;
  let farthestDistance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const deltaX = points[index].x - points[0].x;
    const deltaY = points[index].y - points[0].y;
    const distance = deltaX * deltaX + deltaY * deltaY;
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }

  const firstHalf = simplifyOpenPolygon(points.slice(0, farthestIndex + 1), tolerance);
  const secondHalf = simplifyOpenPolygon([...points.slice(farthestIndex), points[0]], tolerance);
  const simplified = [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
  return simplified.length >= 3 ? simplified : points;
};

const traceLargestContour = (
  componentMask: Uint8Array,
  componentIndices: number[],
  width: number,
  cropLeft: number,
  cropTop: number,
): PixelPoint[] => {
  const edges: BoundaryEdge[] = [];
  const addEdge = (startX: number, startY: number, endX: number, endY: number) => {
    edges.push({ startX, startY, endX, endY, used: false });
  };

  for (const index of componentIndices) {
    const x = index % width;
    const y = Math.floor(index / width);
    if (y === 0 || !componentMask[index - width]) addEdge(x, y, x + 1, y);
    if (x === width - 1 || !componentMask[index + 1]) addEdge(x + 1, y, x + 1, y + 1);
    if (y === Math.floor(componentMask.length / width) - 1 || !componentMask[index + width]) addEdge(x + 1, y + 1, x, y + 1);
    if (x === 0 || !componentMask[index - 1]) addEdge(x, y + 1, x, y);
  }

  const outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const key = getVertexKey(edge.startX, edge.startY);
    const options = outgoing.get(key) || [];
    options.push(index);
    outgoing.set(key, options);
  });

  const contours: PixelPoint[][] = [];
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    if (edges[edgeIndex].used) continue;
    const first = edges[edgeIndex];
    const points: PixelPoint[] = [{ x: first.startX + cropLeft, y: first.startY + cropTop }];
    let currentIndex = edgeIndex;
    let closed = false;

    for (let step = 0; step <= edges.length; step += 1) {
      const edge = edges[currentIndex];
      if (edge.used) break;
      edge.used = true;
      points.push({ x: edge.endX + cropLeft, y: edge.endY + cropTop });
      if (edge.endX === first.startX && edge.endY === first.startY) {
        closed = true;
        break;
      }
      const nextEdges = outgoing.get(getVertexKey(edge.endX, edge.endY)) || [];
      const nextIndex = nextEdges.find((candidate) => !edges[candidate].used);
      if (nextIndex === undefined) break;
      currentIndex = nextIndex;
    }

    if (closed && points.length > 4) {
      points.pop();
      contours.push(points);
    }
  }

  contours.sort((left, right) => Math.abs(polygonArea(right)) - Math.abs(polygonArea(left)));
  return contours[0] ? simplifyClosedPolygon(contours[0], 4) : [];
};

const findColorContour = (
  detection: Detection,
  pixels: Uint8ClampedArray,
  color: ColorSample,
  imageBounds: { left: number; top: number; right: number; bottom: number },
): { x: number; y: number; contour: Array<{ x: number; y: number }> } | null => {
  const paddingX = Math.round((detection.right - detection.left) * 0.12);
  const paddingY = Math.round((detection.bottom - detection.top) * 0.12);
  const left = Math.max(imageBounds.left, Math.floor(detection.left - paddingX));
  const top = Math.max(imageBounds.top, Math.floor(detection.top - paddingY));
  const right = Math.min(imageBounds.right, Math.ceil(detection.right + paddingX));
  const bottom = Math.min(imageBounds.bottom, Math.ceil(detection.bottom + paddingY));
  const width = right - left;
  const height = bottom - top;
  if (width < 4 || height < 4) return null;

  const cropArea = width * height;
  const mask = new Uint8Array(cropArea);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = ((top + y) * MODEL_SIDE + left + x) * 4;
      if (pixelMatchesColor(pixels[pixelIndex], pixels[pixelIndex + 1], pixels[pixelIndex + 2], color)) {
        mask[y * width + x] = 1;
      }
    }
  }

  const queue = new Int32Array(cropArea);
  const minimumArea = Math.max(180, Math.floor(cropArea * 0.015));
  const minimumBoxCoverage = 0.2;
  let bestComponent: number[] = [];
  let bestSumX = 0;
  let bestSumY = 0;

  for (let index = 0; index < cropArea; index += 1) {
    if (!mask[index]) continue;
    let head = 0;
    let tail = 0;
    const component: number[] = [];
    queue[tail] = index;
    tail += 1;
    mask[index] = 0;
    let sumX = 0;
    let sumY = 0;

    while (head < tail) {
      const current = queue[head];
      head += 1;
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      sumX += x;
      sumY += y;
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || !mask[neighbor]) continue;
        mask[neighbor] = 0;
        queue[tail] = neighbor;
        tail += 1;
      }
    }

    if (component.length < minimumArea || component.length / cropArea < minimumBoxCoverage) continue;
    if (component.length > bestComponent.length) {
      bestComponent = component;
      bestSumX = sumX;
      bestSumY = sumY;
    }
  }

  if (bestComponent.length === 0) return null;
  const componentMask = new Uint8Array(cropArea);
  for (const index of bestComponent) componentMask[index] = 1;
  const contourPixels = traceLargestContour(componentMask, bestComponent, width, left, top);
  if (contourPixels.length < 3) return null;

  return {
    x: (left + bestSumX / bestComponent.length - imageBounds.left) / (imageBounds.right - imageBounds.left),
    y: (top + bestSumY / bestComponent.length - imageBounds.top) / (imageBounds.bottom - imageBounds.top),
    contour: contourPixels.map((point) => ({
      x: (point.x - imageBounds.left) / (imageBounds.right - imageBounds.left),
      y: (point.y - imageBounds.top) / (imageBounds.bottom - imageBounds.top),
    })),
  };
};

type HoldGeometry = Pick<HoldMarker, 'x' | 'y' | 'contour'>;

const markerBounds = (marker: HoldGeometry) => {
  if (!marker.contour?.length) return null;
  const xs = marker.contour.map((point) => point.x);
  const ys = marker.contour.map((point) => point.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
};

const isSameHold = (left: HoldGeometry, right: HoldGeometry) => {
  if (Math.hypot(left.x - right.x, left.y - right.y) < 0.022) return true;
  const leftBounds = markerBounds(left);
  const rightBounds = markerBounds(right);
  if (!leftBounds || !rightBounds) return false;
  const intersectionWidth = Math.max(0, Math.min(leftBounds.right, rightBounds.right) - Math.max(leftBounds.left, rightBounds.left));
  const intersectionHeight = Math.max(0, Math.min(leftBounds.bottom, rightBounds.bottom) - Math.max(leftBounds.top, rightBounds.top));
  const intersection = intersectionWidth * intersectionHeight;
  const leftArea = (leftBounds.right - leftBounds.left) * (leftBounds.bottom - leftBounds.top);
  const rightArea = (rightBounds.right - rightBounds.left) * (rightBounds.bottom - rightBounds.top);
  return intersection / Math.max(1e-8, Math.min(leftArea, rightArea)) > 0.45;
};

/** Find same-color holds that the detector missed, directly from the whole photo. */
const findUnboxedColorHolds = (
  pixels: Uint8ClampedArray,
  color: ColorSample,
  imageBounds: { left: number; top: number; right: number; bottom: number },
): HoldMarker[] => {
  const width = imageBounds.right - imageBounds.left;
  const height = imageBounds.bottom - imageBounds.top;
  const pixelCount = width * height;
  const mask = new Uint8Array(pixelCount);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = ((imageBounds.top + y) * MODEL_SIDE + imageBounds.left + x) * 4;
      const index = y * width + x;
      if (pixelMatchesColor(pixels[sourceIndex], pixels[sourceIndex + 1], pixels[sourceIndex + 2], color)) {
        mask[index] = 1;
      }
    }
  }

  const queue = new Int32Array(pixelCount);
  const componentMask = new Uint8Array(pixelCount);
  const minimumArea = Math.max(320, Math.floor(pixelCount * 0.0003));
  const minimumFill = 0.32;
  const candidates: HoldMarker[] = [];

  for (let index = 0; index < pixelCount; index += 1) {
    if (!mask[index]) continue;
    let head = 0;
    let tail = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    queue[tail++] = index;
    mask[index] = 0;

    while (head < tail) {
      const current = queue[head++];
      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;

      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
          if (deltaX === 0 && deltaY === 0) continue;
          const neighborX = x + deltaX;
          const neighborY = y + deltaY;
          if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) continue;
          const neighbor = neighborY * width + neighborX;
          if (!mask[neighbor]) continue;
          mask[neighbor] = 0;
          queue[tail++] = neighbor;
        }
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    if (tail < minimumArea || boxWidth < 8 || boxHeight < 8 || tail / (boxWidth * boxHeight) < minimumFill) continue;

    const componentIndices = Array.from(queue.subarray(0, tail));
    for (const componentIndex of componentIndices) componentMask[componentIndex] = 1;
    const contourPixels = traceLargestContour(componentMask, componentIndices, width, imageBounds.left, imageBounds.top);
    for (const componentIndex of componentIndices) componentMask[componentIndex] = 0;
    if (contourPixels.length < 3) continue;

    candidates.push({
      x: (imageBounds.left + sumX / tail - imageBounds.left) / width,
      y: (imageBounds.top + sumY / tail - imageBounds.top) / height,
      kind: 'hold',
      contour: contourPixels.map((point) => ({
        x: (point.x - imageBounds.left) / width,
        y: (point.y - imageBounds.top) / height,
      })),
    });
  }

  return candidates;
};

export const detectColoredHolds = async (photo: HTMLImageElement, selectedColor: string): Promise<HoldMarker[]> => {
  const target = hexToColorSample(selectedColor);
  if (!target) throw new Error('Choose a route color first.');

  const canvas = document.createElement('canvas');
  canvas.width = MODEL_SIDE;
  canvas.height = MODEL_SIDE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser cannot read the photo pixels.');

  const scale = Math.min(MODEL_SIDE / photo.naturalWidth, MODEL_SIDE / photo.naturalHeight);
  const width = Math.max(1, Math.round(photo.naturalWidth * scale));
  const height = Math.max(1, Math.round(photo.naturalHeight * scale));
  const left = Math.floor((MODEL_SIDE - width) / 2);
  const top = Math.floor((MODEL_SIDE - height) / 2);
  context.fillStyle = 'rgb(114, 114, 114)';
  context.fillRect(0, 0, MODEL_SIDE, MODEL_SIDE);
  context.drawImage(photo, left, top, width, height);
  const imageData = context.getImageData(0, 0, MODEL_SIDE, MODEL_SIDE);

  const channelSize = MODEL_SIDE * MODEL_SIDE;
  const input = new Float32Array(channelSize * 3);
  for (let pixel = 0; pixel < channelSize; pixel += 1) {
    const pixelOffset = pixel * 4;
    input[pixel] = imageData.data[pixelOffset] / 255;
    input[channelSize + pixel] = imageData.data[pixelOffset + 1] / 255;
    input[channelSize * 2 + pixel] = imageData.data[pixelOffset + 2] / 255;
  }

  const session = await getModelSession();
  const ort = await import('onnxruntime-web/wasm');
  const inputTensor = new ort.Tensor('float32', input, [1, 3, MODEL_SIDE, MODEL_SIDE]);
  const outputs = await session.run({ [session.inputNames[0]]: inputTensor });
  const output = outputs[session.outputNames[0]];
  if (!output) throw new Error('The climbing-hold model did not return a prediction.');

  const detections = decodeDetections(output);
  const imageBounds = { left, top, right: left + width, bottom: top + height };
  const markers: HoldMarker[] = [];
  for (const detection of detections) {
    const marker = findColorContour(detection, imageData.data, target, imageBounds);
    if (!marker) continue;

    const duplicate = markers.some((existing) => isSameHold(existing, marker));
    if (!duplicate) markers.push({ ...marker, kind: 'hold' });
    if (markers.length >= 80) break;
  }

  for (const marker of findUnboxedColorHolds(imageData.data, target, imageBounds)) {
    if (markers.some((existing) => isSameHold(existing, marker))) continue;
    markers.push(marker);
    if (markers.length >= 80) break;
  }

  const ordered = markers.sort((leftMarker, rightMarker) => rightMarker.y - leftMarker.y);
  if (ordered.length < 2) return ordered;
  return ordered.map((marker, index) => ({
    ...marker,
    kind: index === 0 ? 'start' : index === ordered.length - 1 ? 'finish' : 'hold',
  }));
};
