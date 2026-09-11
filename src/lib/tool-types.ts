/** dsh-tools 工具定义类型（兼容格式） */

export interface ToolOutputBlock {
  type: 'text';
  text: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: {
    schema: Record<string, unknown>;
    render(args: any, value: any): ToolOutputBlock[];
  };
  execute(args: any, exec?: any): Promise<any>;
  timeoutMs?: number;
}
