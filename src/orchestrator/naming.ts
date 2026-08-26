/** Same branch name in both repos, matching create-game.md's CHE-<GAME_SLUG> convention. */
export function gameBranchName(gameId: string): string {
  return `CHE-${gameId.toUpperCase()}`;
}
