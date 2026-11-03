import type { Prisma } from '@prisma/client'
import { tagForms } from './ai-search-rank'
import { LGBTI_NEEDLES, LGBTI_TERMS, isLgbtiTerm, searchSpellings } from './search-fold'

const mode = 'insensitive' as const

type TextField = 'title' | 'description' | 'venueName' | 'suburb' | 'venueAddress'

function fieldContains(field: TextField, needles: string[]): Prisma.EventWhereInput[] {
  return needles.map((word) => ({ [field]: { contains: word, mode } }))
}

function wordClause(word: string): Prisma.EventWhereInput {
  const spellings = searchSpellings(word)
  const ascii = [word.toLowerCase()]
  return {
    OR: [
      ...fieldContains('title', spellings),
      ...fieldContains('description', spellings),
      ...fieldContains('venueName', ascii),
      ...fieldContains('suburb', ascii),
      ...fieldContains('venueAddress', ascii),
      { subTags: { hasSome: tagForms(word) } },
    ],
  }
}

/**
 * Keyword filter for Ask. An inferred LGBTIQ+ topic is a union with the flag
 * and with queer synonyms, never an extra AND that drops an untagged title.
 */
export function askTextWhere(keywords: string[], lgbtiq: boolean): Prisma.EventWhereInput {
  const words = keywords.map((word) => word.toLowerCase()).filter(Boolean)
  const required = words.filter((word) => !isLgbtiTerm(word))
  const widen = lgbtiq || words.some((word) => isLgbtiTerm(word))
  const parts: Prisma.EventWhereInput[] = required.map(wordClause)
  if (widen) {
    const needles = [...new Set(LGBTI_NEEDLES.flatMap((term) => searchSpellings(term)))]
    const tags = [...new Set(LGBTI_TERMS.flatMap((term) => tagForms(term)))]
    parts.push({
      OR: [
        { isLGBTI: true },
        ...fieldContains('title', needles),
        ...fieldContains('description', needles),
        { subTags: { hasSome: tags } },
      ],
    })
  }
  if (!parts.length) return {}
  return { AND: parts }
}

/** Inclusive calendar days. A listing dated the last day of the year still counts. */
export function askDateBounds(dateFrom: string, dateTo: string): { gte: Date; lte: Date } {
  return {
    gte: new Date(`${dateFrom}T00:00:00.000Z`),
    lte: new Date(`${dateTo}T23:59:59.999Z`),
  }
}

/**
 * Short windows stay small. A named year has to keep March and December in the
 * candidate set, not only the first page of January.
 */
export function askCandidateTake(dateFrom: string, dateTo: string): number {
  const from = new Date(`${dateFrom}T00:00:00.000Z`).getTime()
  const to = new Date(`${dateTo}T00:00:00.000Z`).getTime()
  const days = Math.round((to - from) / 86400000)
  return days > 60 ? 500 : 80
}
