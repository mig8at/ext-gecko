import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { getGlobalWorkspacePath } from "./extension";
import { log, logError } from "./logger";

export interface LambdaConfig {
  functionName: string;
  workspacePath: string;
  eventType: string;
  lastModified: string;
  sourceFile: string;
  sourceDir: string;
}

export class LambdaDetector {
  private static readonly LAMBDA_IMPORT_PATTERNS = [
    "github.com/aws/aws-lambda-go/lambda",
    '"github.com/aws/aws-lambda-go/lambda"',
    "`github.com/aws/aws-lambda-go/lambda`",
  ];

  isLambdaFile(document: vscode.TextDocument): boolean {
    const fileName = path.basename(document.fileName);
    const isGoFile = document.languageId === "go";
    const isMainGo = fileName === "main.go";

    if (!isGoFile || !isMainGo) {
      return false;
    }

    const content = document.getText();
    const hasLambdaImport = this.hasLambdaImport(content);

    if (hasLambdaImport) {
      log(`✅ Lambda file detected: ${document.fileName}`);
    } else {
      log(
        `❌ File ${fileName} is main.go but doesn't import aws-lambda-go/lambda`
      );
    }

    return hasLambdaImport;
  }

  private hasLambdaImport(content: string): boolean {
    return LambdaDetector.LAMBDA_IMPORT_PATTERNS.some((pattern) =>
      content.includes(pattern)
    );
  }

  detectEventType(content: string): string | null {
    const eventTypePatterns = [
      { pattern: /events\.APIGatewayProxyRequest/, type: "apigateway" },
      { pattern: /events\.S3Event/, type: "s3" },
      { pattern: /events\.DynamoDBEvent/, type: "dynamodb" },
      { pattern: /events\.SQSEvent/, type: "sqs" },
    ];
    for (const { pattern, type } of eventTypePatterns) {
      if (pattern.test(content)) {
        return type;
      }
    }
    return null;
  }

  isConfigured(documentUri: vscode.Uri): boolean {
    return this.getConfiguration(documentUri) !== null;
  }

  getConfiguration(documentUri: vscode.Uri): LambdaConfig | null {
    try {
      const sourceFile = documentUri.fsPath;
      const workspacePath = getGlobalWorkspacePath();
      if (!fs.existsSync(workspacePath)) {
        return null;
      }
      const lambdaDirs = fs
        .readdirSync(workspacePath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      for (const lambdaDir of lambdaDirs) {
        const lambdaDirPath = path.join(workspacePath, lambdaDir);
        const templatePath = path.join(lambdaDirPath, "template.yaml");
        if (fs.existsSync(templatePath)) {
          try {
            const templateContent = fs.readFileSync(templatePath, "utf8");
            const template = yaml.load(templateContent) as any;
            const metadata = template.Metadata?.GeckoLambda;
            if (metadata && metadata.sourceFile === sourceFile) {
              return {
                functionName: lambdaDir,
                workspacePath: workspacePath,
                eventType: metadata.eventType || "apigateway",
                lastModified: metadata.lastModified || new Date().toISOString(),
                sourceFile: sourceFile,
                sourceDir: metadata.sourceDir || path.dirname(sourceFile),
              };
            }
          } catch (error) {
            logError(`Could not parse template.yaml in ${lambdaDir}`, error);
          }
        }
      }
      return null;
    } catch (error) {
      logError("Error getting configuration", error);
      return null;
    }
  }

  // **** CORRECCIÓN AQUÍ ****
  // La firma del método ahora solo acepta 'config'.
  saveConfiguration(config: LambdaConfig): void {
    try {
      const lambdaDir = path.join(config.workspacePath, config.functionName);
      const templatePath = path.join(lambdaDir, "template.yaml");
      if (!fs.existsSync(lambdaDir)) {
        fs.mkdirSync(lambdaDir, { recursive: true });
      }

      let template: any = {};
      if (fs.existsSync(templatePath)) {
        try {
          const templateContent = fs.readFileSync(templatePath, "utf8");
          template = yaml.load(templateContent) as any;
        } catch (error) {
          logError(
            "Could not parse existing template, creating new one.",
            error
          );
        }
      }

      if (!template.Metadata) {
        template.Metadata = {};
      }
      template.Metadata.GeckoLambda = {
        sourceFile: config.sourceFile,
        sourceDir: config.sourceDir,
        eventType: config.eventType,
        lastModified: config.lastModified,
        version: "2.0",
      };

      const templateContent = yaml.dump(template, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
      });
      fs.writeFileSync(templatePath, templateContent);
      log(`💾 Configuration saved to template metadata: ${templatePath}`);
    } catch (error) {
      logError("Failed to save configuration", error, true);
      throw new Error(`Failed to save configuration: ${error}`);
    }
  }

  getFunctionNameFromPath(documentUri: vscode.Uri): string {
    const sourceDir = path.dirname(documentUri.fsPath);
    const currentFolder = path.basename(sourceDir);
    if (currentFolder === "cmd") {
      const parentFolder = path.basename(path.dirname(sourceDir));
      return this.sanitizeFunctionName(parentFolder);
    }
    return this.sanitizeFunctionName(currentFolder);
  }

  private sanitizeFunctionName(name: string): string {
    return (
      name
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "lambda-function"
    );
  }

  createAutoConfiguration(
    documentUri: vscode.Uri,
    eventType: string
  ): LambdaConfig {
    const workspacePath = getGlobalWorkspacePath();
    const functionName = this.getFunctionNameFromPath(documentUri);
    const config: LambdaConfig = {
      functionName,
      workspacePath,
      eventType,
      lastModified: new Date().toISOString(),
      sourceFile: documentUri.fsPath,
      sourceDir: path.dirname(documentUri.fsPath),
    };
    return config;
  }

  removeConfiguration(sourceFile: string, workspacePath: string): void {
    try {
      const config = this.findConfigurationBySourceFile(sourceFile);
      if (config) {
        const lambdaDir = path.join(workspacePath, config.functionName);
        if (fs.existsSync(lambdaDir)) {
          fs.rmSync(lambdaDir, { recursive: true, force: true });
          log(`🗑️ Lambda directory removed: ${lambdaDir}`);
        }
      }
    } catch (error) {
      logError("Failed to remove configuration", error);
    }
  }

  private findConfigurationBySourceFile(
    sourceFile: string
  ): LambdaConfig | null {
    const uri = vscode.Uri.file(sourceFile);
    return this.getConfiguration(uri);
  }

  getAllLambdaFunctions(workspacePath: string): LambdaConfig[] {
    // ... (sin cambios aquí)
    try {
      const lambdaConfigs: LambdaConfig[] = [];
      if (!fs.existsSync(workspacePath)) {
        return [];
      }
      const lambdaDirs = fs
        .readdirSync(workspacePath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
      for (const lambdaDir of lambdaDirs) {
        const lambdaDirPath = path.join(workspacePath, lambdaDir);
        const templatePath = path.join(lambdaDirPath, "template.yaml");
        if (fs.existsSync(templatePath)) {
          try {
            const templateContent = fs.readFileSync(templatePath, "utf8");
            const template = yaml.load(templateContent) as any;
            const metadata = template.Metadata?.GeckoLambda;
            if (metadata) {
              lambdaConfigs.push({
                functionName: lambdaDir,
                workspacePath: workspacePath,
                eventType: metadata.eventType || "apigateway",
                lastModified: metadata.lastModified || new Date().toISOString(),
                sourceFile: metadata.sourceFile || "",
                sourceDir: metadata.sourceDir || "",
              });
            } else {
              log(`No Gecko metadata found in ${lambdaDir}, skipping`);
            }
          } catch (error) {
            logError(`Could not parse template.yaml in ${lambdaDir}`, error);
          }
        }
      }
      return lambdaConfigs;
    } catch (error) {
      logError("Error getting all lambda functions", error);
      return [];
    }
  }

  migrateFromGlobalConfig(workspacePath: string): void {
    // ... (sin cambios aquí)
  }
}
