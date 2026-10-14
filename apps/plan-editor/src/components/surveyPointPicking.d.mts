export type SurveyPointScreenCandidate = { id: string; point: [number, number] }

export function findNearestSurveyPoint(
  screenPoint: [number, number],
  candidates: SurveyPointScreenCandidate[],
  maxDistance?: number,
): string | null
