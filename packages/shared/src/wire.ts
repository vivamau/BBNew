import { z } from 'zod';
import { ID_SCHEMES } from './identifier.js';

/**
 * Every cross-member payload. `.strict()` rejects unknown keys — this is a
 * security control, not just ergonomics: it structurally enforces that nothing
 * other than the allow-listed fields can ever cross the wire.
 */

const b64 = z.string().min(1);

export const MetaResponse = z
  .object({
    memberId: z.string().min(1),
    suite: z.string().min(1),
    activeKeyVersion: z.number().int().nonnegative(),
    activePublicKeyB64: b64,
    answerableVersions: z.array(z.number().int().nonnegative()),
  })
  .strict();
export type MetaResponse = z.infer<typeof MetaResponse>;

export const OprfEvaluateRequest = z
  .object({
    keyVersion: z.number().int().nonnegative(),
    evaluationRequestB64: b64,
  })
  .strict();
export type OprfEvaluateRequest = z.infer<typeof OprfEvaluateRequest>;

export const OprfEvaluateResponse = z
  .object({ evaluationB64: b64 })
  .strict();
export type OprfEvaluateResponse = z.infer<typeof OprfEvaluateResponse>;

export const LookupRequest = z
  .object({
    keyVersion: z.number().int().nonnegative(),
    tagB64: b64,
  })
  .strict();
export type LookupRequest = z.infer<typeof LookupRequest>;

/** Always returned, match or not, with a fixed-length blob. */
export const LookupResponse = z
  .object({
    nonceB64: b64,
    blobB64: b64,
  })
  .strict();
export type LookupResponse = z.infer<typeof LookupResponse>;

export const OnboardRequest = z
  .object({
    idRaw: z.string().min(1),
    scheme: z.enum(ID_SCHEMES as unknown as [string, ...string[]]),
    amount: z.number().positive(),
  })
  .strict();
export type OnboardRequest = z.infer<typeof OnboardRequest>;

export const OnboardResponse = z
  .object({
    wallet: z.string().min(1),
    adopted: z.boolean(),
    ownerMemberId: z.string().min(1),
    keyVersion: z.number().int().nonnegative(),
  })
  .strict();
export type OnboardResponse = z.infer<typeof OnboardResponse>;

export const RotateResponse = z
  .object({ newVersion: z.number().int().nonnegative() })
  .strict();
export type RotateResponse = z.infer<typeof RotateResponse>;
