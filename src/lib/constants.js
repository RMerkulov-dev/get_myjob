/**
 * Только идентификаторы и порядок. Все подписи живут в src/i18n —
 * ключи собираются как `categories.<id>`, `levels.<value>`, `positions.<id>`.
 */

export const POSITIONS = ['PM', 'BA', 'PM/BA']

/** Позиция вакансии → теги, которые получают её требования. */
export function positionTags(positionType) {
  return positionType === 'PM/BA' ? ['PM', 'BA'] : [positionType]
}

export const CATEGORY_IDS = [
  'methodology',
  'tool',
  'analysis',
  'technical',
  'data',
  'soft',
  'domain',
  'certification',
  'language',
  'other',
]

export const LEVEL_VALUES = [0, 1, 2, 3, 4, 5]

export const IMPORTANCE = ['must', 'nice']
