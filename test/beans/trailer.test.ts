import {expect} from 'chai'

import {commitTrailer, prTitle} from '../../src/beans/trailer.js'

describe('beans/trailer', () => {
  describe('commitTrailer', () => {
    it('builds "Refs: <beanId>" for a prefixed bean id', () => {
      expect(commitTrailer('hordr-abcd')).to.equal('Refs: hordr-abcd')
    })

    it('does not enforce a prefix — id used as-is', () => {
      expect(commitTrailer('abcd')).to.equal('Refs: abcd')
    })

    it('throws on empty id', () => {
      expect(() => commitTrailer('')).to.throw('beanId is required')
    })
  })

  describe('prTitle', () => {
    it('builds "feat: <subject> (Refs: <beanId>)" by default', () => {
      expect(prTitle('hordr-abcd', 'add config loader')).to.equal('feat: add config loader (Refs: hordr-abcd)')
    })

    it('honours a custom commit type', () => {
      expect(prTitle('hordr-abcd', 'fix bug', 'fix')).to.equal('fix: fix bug (Refs: hordr-abcd)')
    })

    it('throws on empty bean id', () => {
      expect(() => prTitle('', 'subject')).to.throw('beanId is required')
    })

    it('throws on empty subject', () => {
      expect(() => prTitle('hordr-abcd', '', 'feat')).to.throw('subject is required')
    })
  })
})
