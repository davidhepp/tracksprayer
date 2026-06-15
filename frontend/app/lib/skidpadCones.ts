import skidpadConeData from "../data/skidpad_cones.json";
import type { Point } from "./mapMath";
import type { Cone } from "./missionTypes";

export type ConeType = Cone["type"];

export type SkidpadCone = Readonly<Cone>;

export type SkidpadOverlayTransform = Readonly<{
  offsetX: number;
  offsetY: number;
  rotationRad: number;
  metersToPixels: number;
}>;

export type SkidpadCameraTransform = Readonly<{
  offsetX: number;
  offsetY: number;
  scale: number;
}>;

type RawCone = {
  name: unknown;
  type: unknown;
  x: unknown;
  y: unknown;
};

type RawConeFile = {
  cones?: RawCone[];
};

export const EXPECTED_CONE_COUNTS: Record<ConeType, number> = {
  blue: 29,
  yellow: 29,
  orange: 12,
  orange_big: 4,
};

export const EXPECTED_TOTAL_CONES = 74;

export const SKIDPAD_GUIDES = {
  circleCenters: [
    { x: 0, y: 9.125 },
    { x: 0, y: -9.125 },
  ],
  innerRadiusMeters: 7.475,
  outerRadiusMeters: 10.775,
};

export const SKIDPAD_OVERLAY_TRANSFORM: SkidpadOverlayTransform = {
  offsetX: 0,
  offsetY: 0,
  rotationRad: 0,
  metersToPixels: 1,
};

export const SKIDPAD_CAMERA_TRANSFORM: SkidpadCameraTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

const CONE_TYPES = new Set<ConeType>(["blue", "yellow", "orange", "orange_big"]);

export function loadSkidpadCones(): readonly SkidpadCone[] {
  const rawData = skidpadConeData as RawConeFile;

  if (!Array.isArray(rawData.cones)) {
    throw new Error("skidpad_cones.json must contain a cones array.");
  }

  const cones = rawData.cones.map((rawCone, index) => {
    if (
      typeof rawCone.name !== "string" ||
      !isConeType(rawCone.type) ||
      typeof rawCone.x !== "number" ||
      typeof rawCone.y !== "number" ||
      !Number.isFinite(rawCone.x) ||
      !Number.isFinite(rawCone.y)
    ) {
      throw new Error(`Invalid skidpad cone at index ${index}.`);
    }

    return Object.freeze({
      id: rawCone.name,
      name: rawCone.name,
      type: rawCone.type,
      color: rawCone.type,
      point: Object.freeze({
        x: rawCone.x,
        y: rawCone.y,
      }),
    });
  });

  validateConeCounts(cones);

  return Object.freeze(cones);
}

export function worldToScreen(
  x: number,
  y: number,
  transform: SkidpadOverlayTransform = SKIDPAD_OVERLAY_TRANSFORM,
  camera: SkidpadCameraTransform = SKIDPAD_CAMERA_TRANSFORM,
): Point {
  const scaledX = x * transform.metersToPixels;
  const scaledY = y * transform.metersToPixels;
  const cos = Math.cos(transform.rotationRad);
  const sin = Math.sin(transform.rotationRad);
  const rotatedX = scaledX * cos - scaledY * sin;
  const rotatedY = scaledX * sin + scaledY * cos;

  return {
    x: (rotatedX + transform.offsetX) * camera.scale + camera.offsetX,
    y: (-(rotatedY + transform.offsetY)) * camera.scale + camera.offsetY,
  };
}

function validateConeCounts(cones: readonly SkidpadCone[]) {
  const counts = cones.reduce<Record<ConeType, number>>(
    (current, cone) => ({
      ...current,
      [cone.type]: current[cone.type] + 1,
    }),
    {
      blue: 0,
      yellow: 0,
      orange: 0,
      orange_big: 0,
    },
  );

  const invalidCount = Object.entries(EXPECTED_CONE_COUNTS).find(
    ([type, expected]) => counts[type as ConeType] !== expected,
  );

  if (cones.length !== EXPECTED_TOTAL_CONES || invalidCount) {
    throw new Error(
      `Expected ${EXPECTED_TOTAL_CONES} skidpad cones (${JSON.stringify(
        EXPECTED_CONE_COUNTS,
      )}), got ${cones.length} (${JSON.stringify(counts)}).`,
    );
  }
}

function isConeType(value: unknown): value is ConeType {
  return typeof value === "string" && CONE_TYPES.has(value as ConeType);
}
