/**
 * Community Edition configuration.
 * DMG/Windows builds allow unlimited element tracking and tagging.
 * The differentiator from Pro (MAS) is that the exported prompt is limited to
 * EXPORT_MAX_ELEMENTS elements. All other prompt content is identical.
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

/** Community edition export is limited to this many elements */
export const EXPORT_MAX_ELEMENTS = 2
