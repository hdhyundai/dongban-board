/**
 * Unified Typography for all HD Hyundai Samho Shipyard Mini-Games
 * Standardized on Pretendard & HD Hyundai design tokens.
 */

export const GAME_FONT_FAMILY = '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
export const GAME_MONO_FAMILY = '"Pretendard", "SF Mono", Menlo, Consolas, monospace';

export const getGameCanvasFont = (
  size: number,
  weight: "normal" | "medium" | "bold" | "black" = "bold",
  isMono: boolean = false
): string => {
  const family = isMono ? GAME_MONO_FAMILY : GAME_FONT_FAMILY;
  const weightStr = weight === "black" ? "900" : weight === "bold" ? "700" : weight === "medium" ? "500" : "400";
  return `${weightStr} ${size}px ${family}`;
};
