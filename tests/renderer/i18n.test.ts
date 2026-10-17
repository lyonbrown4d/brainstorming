import { afterEach, expect, it } from 'vitest'
import { initializeI18n, translate, translateLabel } from '@renderer/i18n'

afterEach(async () => initializeI18n('zh-CN'))

it('switches visible and accessible UI messages and interpolates document titles unchanged', async () => {
  await initializeI18n('en')
  expect(translate('returnToHome')).toBe('Return to home')
  expect(translate('propertiesPanel')).toBe('Properties panel')
  expect(translate('topicCount', { count: 1 })).toBe('1 topic')
  expect(translate('topicCount', { count: 2 })).toBe('2 topics')
  expect(translate('closeMapTab', { title: '我的项目' })).toBe('Close map 我的项目')
  expect(translateLabel('向右逻辑图')).toBe('Right logic chart')
  expect(translateLabel('用户自定义名称')).toBe('用户自定义名称')
  await initializeI18n('zh-CN')
  expect(translate('returnToHome')).toBe('返回首页')
  expect(translate('closeMapTab', { title: 'My project' })).toBe('关闭导图 My project')
})
