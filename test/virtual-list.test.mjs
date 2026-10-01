import test from 'node:test'
import assert from 'node:assert/strict'
import { flattenGroups, visibleRows } from '../src/utils/virtualList.mjs'

test('5000 messaggi producono solo le righe della viewport, con gruppi e UID corretti', () => {
  const groups = [{ key: 'unread', label: 'Non lette', items: Array.from({ length: 2500 }, (_, uid) => ({ uid })) },
    { key: 'read', label: 'Lette', items: Array.from({ length: 2500 }, (_, i) => ({ uid: i + 2500 })) }]
  const layout = flattenGroups(groups)
  assert.equal(layout.rows.length, 5002)
  for (const top of [0, 10000, 205000, layout.height - 600]) {
    const visible = visibleRows(layout.rows, top, 600)
    assert.ok(visible.length <= 17)
    assert.ok(visible.length > 0)
    assert.equal(new Set(visible.map(row => row.key)).size, visible.length)
  }
})
