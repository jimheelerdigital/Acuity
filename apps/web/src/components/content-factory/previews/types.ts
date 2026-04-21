export interface PreviewPiece {
  id: string;
  type: string;
  title: string;
  body: string;
  hook: string;
  cta: string;
  targetKeyword: string | null;
  predictedScore: number;
}
