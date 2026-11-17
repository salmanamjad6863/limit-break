/**
 * A/S Rank Trial verification (SYSTEMS.md §4.4). The rank is granted on pass; leaderboards
 * only show A/S once a moderator approves a short video of the trial.
 */
import type { PendingReview, ReviewInput, VerificationUploadResponse } from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import type { Deps } from '../../lib/types';

export const BUCKET = 'trial-videos';
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export class VerificationError extends Error {
  constructor(public status: 400 | 403 | 404 | 409 | 503, message: string) {
    super(message);
  }
}

const videoPath = (userId: string, attemptId: string) => `${userId}/${attemptId}.mp4`;

async function ownAttempt(prisma: PrismaClient, userId: string, id: string) {
  const a = await prisma.trialAttempt.findUnique({ where: { id } });
  if (!a || a.userId !== userId) throw new VerificationError(404, 'trial not found');
  if (a.verification !== 'required' && a.verification !== 'rejected') throw new VerificationError(409, `nothing to verify (status: ${a.verification})`);
  return a;
}

export async function startUpload(prisma: PrismaClient, deps: Deps, userId: string, attemptId: string): Promise<VerificationUploadResponse> {
  if (!deps.storage) throw new VerificationError(503, 'video uploads are not configured');
  await ownAttempt(prisma, userId, attemptId);
  const path = videoPath(userId, attemptId);
  return { uploadUrl: await deps.storage.signUpload(BUCKET, path), videoKey: path, maxBytes: MAX_VIDEO_BYTES };
}

export async function submit(prisma: PrismaClient, userId: string, attemptId: string, videoKey: string) {
  await ownAttempt(prisma, userId, attemptId);
  // the key is derived, never trusted from the client: no pointing at someone else's file
  if (videoKey !== videoPath(userId, attemptId)) throw new VerificationError(400, 'invalid video key');
  await prisma.trialAttempt.update({ where: { id: attemptId }, data: { verification: 'pending', videoKey, submittedAt: new Date(), reviewNote: null } });
  return { verification: 'pending' as const };
}

function assertModerator(deps: Deps, userId: string) {
  if (!deps.moderatorIds?.includes(userId)) throw new VerificationError(403, 'moderators only');
}

export async function listPending(prisma: PrismaClient, deps: Deps, moderatorId: string): Promise<PendingReview[]> {
  assertModerator(deps, moderatorId);
  const rows = await prisma.trialAttempt.findMany({ where: { verification: 'pending' }, orderBy: { submittedAt: 'asc' }, take: 50 });
  return Promise.all(rows.map(async (r) => ({
    attemptId: r.id, userId: r.userId, target: r.targetRank === 'SOVEREIGN' ? 'S' : r.targetRank, composite: Math.round(r.composite * 10) / 10,
    videoUrl: r.videoKey && deps.storage ? await deps.storage.signRead(BUCKET, r.videoKey, 3600) : null,
    submittedAt: (r.submittedAt ?? r.createdAt).toISOString(),
  })));
}

export async function review(prisma: PrismaClient, deps: Deps, moderatorId: string, attemptId: string, input: ReviewInput) {
  assertModerator(deps, moderatorId);
  const a = await prisma.trialAttempt.findUnique({ where: { id: attemptId } });
  if (!a) throw new VerificationError(404, 'trial not found');
  if (a.userId === moderatorId) throw new VerificationError(403, 'you cannot review your own trial');
  if (a.verification !== 'pending') throw new VerificationError(409, `not pending (status: ${a.verification})`);
  if (input.decision === 'rejected' && !input.note?.trim()) throw new VerificationError(400, 'say why, so the hunter can re-record');
  await prisma.trialAttempt.update({
    where: { id: attemptId },
    data: { verification: input.decision, verified: input.decision === 'verified', reviewerId: moderatorId, reviewNote: input.note?.trim() || null, reviewedAt: new Date() },
  });
  return { verification: input.decision };
}
