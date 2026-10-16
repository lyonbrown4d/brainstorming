import { assertId } from './validation'

export function record(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    throw new Error('扩展属性须为普通对象')
  const result = value as Record<string, unknown>
  if (keys && Object.keys(result).some((key) => !keys.includes(key)))
    throw new Error('包含不支持的扩展属性')
  return result
}
export function text(value: unknown, maximum: number, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && !value.trim()))
    throw new Error('扩展文本长度无效')
}
export function number(value: unknown, minimum: number, maximum: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    throw new Error('扩展数值超出范围')
}
export function oneOf(value: unknown, choices: readonly unknown[]): void {
  if (!choices.includes(value)) throw new Error('扩展枚举值无效')
}
export function color(value: unknown): void {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/iu.test(value))
    throw new Error('颜色须为六位十六进制值')
}
export function list(value: unknown, maximum: number, minimum = 0): unknown[] {
  if (!Array.isArray(value) || value.length > maximum || value.length < minimum)
    throw new Error('扩展列表长度无效')
  return value as unknown[]
}
export function ids(value: unknown, maximum: number, minimum = 0): string[] {
  const result = list(value, maximum, minimum)
  for (const id of result) assertId(id)
  if (new Set(result).size !== result.length) throw new Error('扩展列表包含重复 ID')
  return result as string[]
}
export function boolean(value: unknown): void {
  if (typeof value !== 'boolean') throw new Error('扩展布尔值无效')
}
export function optional(
  value: Record<string, unknown>,
  key: string,
  validate: (entry: unknown) => void,
): void {
  if (Object.hasOwn(value, key)) validate(value[key])
}
export function date(value: unknown): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
    throw new Error('日期须使用 YYYY-MM-DD 格式')
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error('日期无效')
}
