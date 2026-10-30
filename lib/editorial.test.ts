import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CITIES } from './cities'
import { assessEditorial, cityEditorial, editorialFacts, editorialPath } from './editorial'

test('national hubs need a spread of cities, not one city repeated', () => {
  assert.equal(assessEditorial([]).reason, 'empty')
  assert.equal(assessEditorial([0, 0, 4]).reason, 'thin')
  assert.equal(assessEditorial([12]).reason, 'near-duplicate')
  assert.equal(assessEditorial([10, 1]).reason, 'near-duplicate')
  assert.equal(assessEditorial([6, 6]).index, true)
  assert.equal(assessEditorial([6, 6]).total, 12)
})

test('free, markets and family copy stays useful and does not invent trust badges', () => {
  for (const city of CITIES) {
    for (const topic of ['free-events', 'markets', 'family'] as const) {
      const editorial = cityEditorial(topic, city)
      assert.ok(editorial, city.name)
      const text = [...editorial!.paragraphs, ...editorial!.facts.map((f) => `${f.question} ${f.answer}`)].join(' ')
      assert.match(text, new RegExp(city.name))
      assert.doesNotMatch(text, /verified/i)
      assert.doesNotMatch(text, /confidence/i)
      assert.equal(editorial!.more.href.startsWith('/guides/'), true)
    }
  }
  const facts = editorialFacts(
    { slug: 'markets', topic: 'markets', label: 'Markets', h1: 'Markets in Australia', description: 'Markets already listed.' },
    8,
    2,
  )
  assert.match(facts[0]!.answer, /8 upcoming listings/)
  assert.equal(editorialPath('markets'), '/guides/markets')
})
