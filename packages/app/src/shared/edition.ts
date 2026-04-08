/**
 * Community Edition limits.
 * Free / open-source builds use these caps to differentiate from the Pro (MAS) version.
 */

export const EDITION = 'community' as const

/** Max elements tracked in the page edit ledger */
export const MAX_TRACKED_ELEMENTS = 5

/** Max tags (annotations) allowed at the same time */
export const MAX_TAGS = 5

/** Whether the structured JSON block is included in exported prompts */
export const EXPORT_INCLUDE_JSON = false

/** Whether identity hints & ancestor paths are included in exported prompts */
export const EXPORT_INCLUDE_DETAILS = false
