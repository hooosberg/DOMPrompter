/**
 * Community Edition configuration.
 * DMG/Windows builds allow unlimited element tracking and tagging.
 * The differentiator from Pro (MAS) is the simplified export prompt.
 */

export const EDITION = 'community' as const

/** Max elements tracked in the page edit ledger (unlimited in community) */
export const MAX_TRACKED_ELEMENTS = Infinity

/** Max tags (annotations) allowed at the same time (unlimited in community) */
export const MAX_TAGS = Infinity

/** Whether the structured JSON block is included in exported prompts */
export const EXPORT_INCLUDE_JSON = false

/** Whether identity hints & ancestor paths are included in exported prompts */
export const EXPORT_INCLUDE_DETAILS = false

/** Community edition exports a simplified prompt instead of the full structured one */
export const EXPORT_COMMUNITY_SIMPLIFIED = true
