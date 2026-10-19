import { creationReady, editorReady } from '@tests/native/readiness'
import { expect } from '@wdio/globals'
import { artifact, home, named, native, rootHasText, save } from '@tests/native/driver'
import type { TemplateCatalog } from '@shared/templates'

describe('native static templates', () => {
  it('loads the backend catalog and creates a complete editable workflow in a native file', async () => {
    await home()
    const catalog = await native<TemplateCatalog>('listTemplates')
    expect(catalog.templates).toHaveLength(14)
    const workflow = catalog.templates.find((item) => item.id === 'brainstorm')
    if (!workflow) throw new Error('The bundled brainstorming template is missing')
    await named('下一步').click()
    await creationReady('configuration')
    await expect(named('选择头脑风暴工作流模板')).toBeDisplayed()
    await named('选择头脑风暴工作流模板').click()
    await named('文档名称').setValue('本机头脑风暴工作流')
    await named('创建文档').click()
    await editorReady('本机头脑风暴工作流')
    await rootHasText('本机头脑风暴工作流')
    const workbook = await save(artifact('native-template'))
    const document = workbook.sheets[0]?.document
    expect(Object.keys(document?.topics ?? {})).toHaveLength(workflow.count)
    expect(document?.topics[document.rootId]?.children).toHaveLength(6)
    expect(Object.values(document?.topics ?? {}).some((topic) => topic.notes?.length)).toBe(true)
  })
})
