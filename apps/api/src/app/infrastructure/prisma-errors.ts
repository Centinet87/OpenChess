export function isLastOwnerError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('LAST_OWNER');
}
