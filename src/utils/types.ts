export interface LocalLambdaConfig {
  functionName: string;
  sourceMainFile: string;
  sourceDir: string;
  eventType: string;
  workspacePath: string;
  lastModified: string;
  runtime: string;
  architecture: string;
  buildMethod: string;
  environment?: {
    variables: { [key: string]: string };
    lastUpdated?: string;
    source?: string;
    awsFunctionName?: string;
  };
  template?: {
    timeout?: number;
    memorySize?: number;
    description?: string;
    policies?: string[];
    layers?: string[];
  };
}
