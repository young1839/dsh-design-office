/**
 * 工具注册 helper：适配 dsh-tools 的 defineTool/register(definition) 格式
 *
 * 关键兼容性知识（从 dsh-tools 源码验证）：
 * - register(definition) 单对象参数，必须含：
 *   - name: string
 *   - description: string
 *   - parameters: JSON Schema（标准格式）
 *   - output: { schema: JSON Schema, render(args, value): blocks[] }（render 必填！）
 *   - execute(args, exec): Promise<any>
 * - 与 dsh-better-sidebar / dsh-vision-router 共用同一注册器，格式必须一致
 *
 * schemastery schema 内部结构（实测）：
 * - { type: 'object'|'string'|'number'|'boolean'|'array'|'union'|'const', meta, dict?, list? }
 * - object.dict: { key: childSchema }
 * - union.list: [constSchema...]，constSchema.value 是枚举值
 * - meta.required: true/false（required(false) 时 meta.required=false）
 */
import type { ToolDefinition, ToolOutputBlock } from './tool-types.js';

/**
 * 从字面量推断 JSON Schema 标量类型。
 *
 * dsh-tools（0.1.5+）的 schema 子集要求：带有 `enum` / `const` 的节点**必须**声明
 * `type`（否则 `assertSupportedJsonSchema` 报 "enum requires type or oneOf"）。
 * schemastery 的 `z.union(['a','b'])` / `z.const('x')` 转换后只有 enum 没有 type，
 * 因此必须在这里补上。
 */
function inferScalarType(value: unknown): 'string' | 'number' | 'integer' | 'boolean' | 'null' | undefined {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value === null) return 'null';
  return undefined;
}

/** schemastery schema → 标准 JSON Schema（递归，兼容 dsh-tools schema 子集） */
export function toJsonSchema(s: any): any {
  // schemastery 的 schema 是函数对象（typeof 'function'），不是普通 object！
  if (!s || (typeof s !== 'object' && typeof s !== 'function')) return {};
  const type = s.type;
  const meta = s.meta ?? {};
  const out: any = {};
  switch (type) {
    case 'string': out.type = 'string'; break;
    case 'number': out.type = 'number'; break;
    case 'integer': out.type = 'integer'; break;
    case 'boolean': out.type = 'boolean'; break;
    // ⚠️ schemastery 的数组元素 schema 存在 `inner`（不是 `element`）；
    // 旧代码读 element → items 恒为 {}，数组项约束全部丢失。
    case 'array': out.type = 'array'; out.items = s.inner ? toJsonSchema(s.inner) : {}; break;
    case 'object': {
      out.type = 'object';
      out.properties = {};
      out.additionalProperties = false;
      const required: string[] = [];
      for (const [k, v] of Object.entries(s.dict ?? {})) {
        const vv = v as any;
        const sub = toJsonSchema(vv);
        out.properties[k] = sub;
        const m = vv.meta ?? {};
        if (m.required !== false) required.push(k); // 默认 required（schemastery 语义：未标 required(false) 即必填）
        if (m.description) out.properties[k].description = m.description;
      }
      if (required.length) out.required = required;
      break;
    }
    case 'union': {
      const list = (s.list ?? []) as any[];
      const consts = list.filter((x) => x.type === 'const').map((x) => x.value);
      if (consts.length === list.length && consts.length > 0) {
        // 全常量联合 → enum；同类型时补 type（宿主子集强制要求）
        const types = new Set(consts.map(inferScalarType));
        if (types.size === 1 && !types.has(undefined)) out.type = [...types][0];
        out.enum = consts;
        // 混合类型无法用单一 type 表达 → 降级为 oneOf（每支带 type + enum）
        if (!out.type) {
          delete out.enum;
          out.oneOf = list.map((x) => toJsonSchema(x)).filter((x: any) => Object.keys(x).length > 0);
          if (out.oneOf.length < 2) delete out.oneOf;
        }
      } else {
        out.oneOf = list.map((x) => toJsonSchema(x)).filter((x: any) => Object.keys(x).length > 0);
        if (out.oneOf.length < 2) delete out.oneOf;
      }
      break;
    }
    case 'const': {
      const t = inferScalarType(s.value);
      if (t) out.type = t;
      out.enum = [s.value];
      break;
    }
    default: return {};
  }
  if (meta.description) out.description = meta.description;
  return out;
}

/** 递归清理：删除所有 undefined 字段/值（dsh-tools lossless JSON 校验要求） */
export function sanitizeLossless(value: any): any {
  if (value === undefined) return null;
  if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) return null;
  if (Array.isArray(value)) return value.map((v) => sanitizeLossless(v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = sanitizeLossless(v);
    }
    return out;
  }
  return value;
}

/** 默认 render：把返回值序列化为文本块 */
export function defaultRender(_args: any, value: any): ToolOutputBlock[] {
  const clean = sanitizeLossless(value);
  return [{
    type: 'text',
    text: typeof clean === 'string' ? clean : JSON.stringify(clean, null, 2),
  }];
}

/** 定义工具（dsh-tools 兼容格式） */
export function defineToolCompat(options: {
  name: string;
  description: string;
  parameters: any; // schemastery schema
  outputSchema?: any; // schemastery schema（默认 {} 不约束，允许任意 JSON 返回）
  render?: (args: any, value: any) => ToolOutputBlock[];
  execute: (args: any, exec?: any) => Promise<any>;
  timeoutMs?: number;
}): ToolDefinition {
  const params = toJsonSchema(options.parameters);
  // 默认 {}：annotation-only schema，dsh-tools 接受为 unconstrained-JSON
  const outputSchema = options.outputSchema ? toJsonSchema(options.outputSchema) : {};
  const render = options.render ?? defaultRender;
  return {
    name: options.name,
    description: options.description,
    parameters: params,
    output: {
      schema: outputSchema,
      // 包装 render：先清理返回值（lossless JSON 要求），再渲染
      render(args, value) {
        return render(args, sanitizeLossless(value));
      },
    },
    // 包装 execute：返回值过 sanitize（确保无 undefined/NaN/-0）
    async execute(args: any, exec?: any) {
      const result = await options.execute(args, exec);
      return sanitizeLossless(result);
    },
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  };
}
