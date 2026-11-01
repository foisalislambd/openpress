const LINK = /https?:\/\//gi;

export function linkCount(body: string) {
  return body.match(LINK)?.length ?? 0;
}

/**
 * Guest comments with two or more links are treated as spam.
 * Logged-in authors are approved. Other guests wait when moderation is on.
 */
export function initialCommentStatus(input: {
  body: string;
  authenticated: boolean;
  moderation: boolean;
}): 'APPROVED' | 'PENDING' | 'SPAM' {
  if (!input.authenticated && linkCount(input.body) >= 2) return 'SPAM';
  if (input.authenticated) return 'APPROVED';
  return input.moderation ? 'PENDING' : 'APPROVED';
}
