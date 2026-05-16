import { Evaluation, EvaluationRequest } from '@cloudflare/voprf-ts';
import { toB64, fromB64 } from '@bbnew/shared';
import { SUITE } from './suite.js';

export const serializeEvalRequest = (req: EvaluationRequest): string =>
  toB64(req.serialize());

export const deserializeEvalRequest = (b64: string): EvaluationRequest =>
  EvaluationRequest.deserialize(SUITE, fromB64(b64));

/** An `Evaluation` serializes the evaluated element AND its DLEQ proof together. */
export const serializeEvaluation = (ev: Evaluation): string => toB64(ev.serialize());

export const deserializeEvaluation = (b64: string): Evaluation =>
  Evaluation.deserialize(SUITE, fromB64(b64));
