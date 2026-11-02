import type { ChallengeInput, GameView } from '@openchess/contracts';
import { api } from '../../../shared/api/client';

export const gamesApi = {
  list: () => api.get<GameView[]>('/club/games'),
  challenge: (input: ChallengeInput) =>
    api.post<GameView>('/club/games', input),
  respond: (gameId: string, action: 'accept' | 'decline') =>
    api.post<GameView>(`/club/games/${gameId}/${action}`),
};
