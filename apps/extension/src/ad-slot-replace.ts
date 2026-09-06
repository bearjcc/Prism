export interface MeasuredFootprint {
  readonly width: number;
  readonly height: number;
}

const FOOTPRINT_TOLERANCE_PX = 2;

export function measureAdSlotFootprint(element: Element): MeasuredFootprint {
  const htmlElement = element as HTMLElement;
  const rect = element.getBoundingClientRect();
  let width = rect.width;
  let height = rect.height;
  if (width <= 0) {
    width = htmlElement.offsetWidth;
  }
  if (height <= 0) {
    height = htmlElement.offsetHeight;
  }

  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  if (style !== undefined) {
    if (width <= 0) {
      width = readPositiveLength(style.width) ?? readPositiveLength(style.minWidth) ?? 0;
    }
    if (height <= 0) {
      height =
        readPositiveLength(style.height) ?? readPositiveLength(style.minHeight) ?? 0;
    }
  }

  return {
    width: Math.max(0, width),
    height: Math.max(0, height),
  };
}

export function applyFootprintToImage(
  image: HTMLImageElement,
  footprint: MeasuredFootprint,
): void {
  if (footprint.width > 0) {
    image.width = Math.round(footprint.width);
    image.style.width = `${footprint.width}px`;
  }
  if (footprint.height > 0) {
    image.height = Math.round(footprint.height);
    image.style.height = `${footprint.height}px`;
  }
  image.style.display = "block";
  image.style.maxWidth = "100%";
  image.style.objectFit = "cover";
  image.style.boxSizing = "border-box";
}

export function footprintsMatch(
  expected: MeasuredFootprint,
  actual: MeasuredFootprint,
  tolerancePx = FOOTPRINT_TOLERANCE_PX,
): boolean {
  return (
    Math.abs(expected.width - actual.width) <= tolerancePx &&
    Math.abs(expected.height - actual.height) <= tolerancePx
  );
}

function readPositiveLength(value: string): number | undefined {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}
