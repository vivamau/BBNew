/**
 * Common identifier schemes agreed per humanitarian response/community/country.
 * The concrete scheme is PII; only its NORMALIZED form is ever fed into the OPRF,
 * and even that never leaves the network-member that holds it.
 */
export type IdScheme = 'NID' | 'TAX' | 'UNHCR' | 'BIO';

export const ID_SCHEMES: readonly IdScheme[] = ['NID', 'TAX', 'UNHCR', 'BIO'];

const SEPARATORS = /[\s\-._/\\]+/g;

/**
 * Deterministic canonical form of a beneficiary common identifier.
 *
 * Two differently-typed-but-equivalent inputs for the same person under the same
 * scheme MUST map to the same string (so the OPRF yields the same pseudonym);
 * different identifiers MUST NOT collide. The scheme prefix namespaces the value
 * so a National ID and a Tax ID with identical digits do not collide.
 */
export function normalizeIdentifier(raw: string, scheme: IdScheme): string {
  const cleaned = raw
    .normalize('NFC')
    .replace(SEPARATORS, '')
    .trim()
    .toUpperCase();
  if (cleaned.length === 0) {
    throw new Error('normalizeIdentifier: identifier is empty after normalization');
  }
  return `${scheme}:${cleaned}`;
}
