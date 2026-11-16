export const progressionKeys = {
  all: ['progression'] as const,
  me: () => [...progressionKeys.all, 'me'] as const,
};
