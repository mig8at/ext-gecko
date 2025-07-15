import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LambdaDetector, LambdaConfig } from "../detector";
import { LocalLambdaConfig, TemplateManager, ConfigManager, StringUtils } from "../utils";
import { getGlobalWorkspacePath } from "../extension";
import { log, logError } from "../logger";

export class ConfigCommand {
  private detector: LambdaDetector;

  constructor(private context: vscode.ExtensionContext) {
    this.detector = new LambdaDetector();
  }

  async execute(): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showErrorMessage("No active editor found");
      return;
    }
    if (!this.detector.isLambdaFile(activeEditor.document)) {
      vscode.window.showErrorMessage("Current file is not a valid Lambda main.go file");
      return;
    }
    try {
      await this.runConfigurationWizard(activeEditor);
    } catch (error) {
      logError("Configuration failed", error, true);
    }
  }

  private async runConfigurationWizard(editor: vscode.TextEditor): Promise<void> {
    const workspacePath = getGlobalWorkspacePath();
    log(`🦎 Using global workspace: ${workspacePath}`);

    const suggestedName = this.detector.getFunctionNameFromPath(editor.document.uri);
    const functionName = await this.getFunctionName(suggestedName);
    if (!functionName) return;

    const eventType = await this.getEventType(editor.document.getText());
    if (!eventType) return;
    
    const architecture = await this.getArchitecture();
    if (!architecture) return;

    await this.handleExistingConfiguration(editor, workspacePath, functionName);

    const config: LambdaConfig = {
      functionName,
      workspacePath,
      eventType,
      lastModified: new Date().toISOString(),
      sourceFile: editor.document.uri.fsPath,
      sourceDir: path.dirname(editor.document.uri.fsPath),
    };

    await this.createLambdaConfiguration(config, architecture);

    vscode.window
      .showInformationMessage(
        `🦎 Lambda "${functionName}" configured successfully! template.yaml is now the only source of truth.`,
        "Open Workspace",
        "Edit Template"
      )
      .then((selection) => {
        if (selection === "Open Workspace") {
          vscode.commands.executeCommand(
            "vscode.openFolder",
            vscode.Uri.file(path.join(workspacePath, functionName))
          );
        } else if (selection === "Edit Template") {
          const templatePath = path.join(workspacePath, functionName, "template.yaml");
          vscode.workspace.openTextDocument(templatePath).then((doc) => {
            vscode.window.showTextDocument(doc);
          });
        }
      });
  }
  
  private async handleExistingConfiguration(editor: vscode.TextEditor, workspacePath: string, functionName: string): Promise<void> {
    const existingConfig = this.detector.getConfiguration(editor.document.uri);
    if (existingConfig) {
      log(`🔄 Reconfiguring existing lambda: ${existingConfig.functionName}`);
      this.detector.removeConfiguration(editor.document.uri.fsPath, workspacePath);
      if (existingConfig.functionName !== functionName) {
        const oldLambdaDir = path.join(existingConfig.workspacePath, existingConfig.functionName);
        if (fs.existsSync(oldLambdaDir)) {
          log(`🧹 Cleaning old directory: ${oldLambdaDir}`);
          fs.rmSync(oldLambdaDir, { recursive: true, force: true });
        }
      }
    }
    const lambdaDir = path.join(workspacePath, functionName);
    if (fs.existsSync(lambdaDir)) {
      log(`🧹 Cleaning existing directory: ${lambdaDir}`);
      fs.rmSync(lambdaDir, { recursive: true, force: true });
    }
  }

  private async createLambdaConfiguration(config: LambdaConfig, architecture: string): Promise<void> {
    // **** CORRECCIÓN AQUÍ ****
    // La llamada ahora solo pasa 'config', que coincide con la nueva firma.
    this.detector.saveConfiguration(config);

    const lambdaDir = path.join(config.workspacePath, config.functionName);

    if (!fs.existsSync(lambdaDir)) {
      fs.mkdirSync(lambdaDir, { recursive: true });
    }
    log(`📁 Created clean lambda directory: ${lambdaDir}`);

    const localConfig: Partial<LocalLambdaConfig> = {
      functionName: config.functionName,
      sourceMainFile: config.sourceFile,
      sourceDir: config.sourceDir,
      eventType: config.eventType,
      workspacePath: config.workspacePath,
      lastModified: config.lastModified,
      runtime: "provided.al2023",
      architecture: architecture,
      buildMethod: "direct",
      environment: { variables: {}, lastUpdated: "", source: "manual" },
      template: { timeout: 30, memorySize: 128, description: `Lambda function for ${config.eventType} events` },
    };

    log(`📄 Creating template.yaml as the only source of truth...`);
    TemplateManager.createTemplate(lambdaDir, localConfig);
    ConfigManager.cleanupConfigJson(lambdaDir);

    if (config.eventType !== "apigateway") {
      ConfigManager.createEventFile(path.join(lambdaDir, "event.json"), config.eventType);
    }
    
    const buildDir = path.join(lambdaDir, "build");
    if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true });
    }

    log(`✅ Configuration complete - template.yaml is the only source of truth!`);
  }

  private async getFunctionName(suggested: string): Promise<string | undefined> {
    const simplifiedSuggestion = StringUtils.simplifyFunctionName(suggested);
    const result = await vscode.window.showInputBox({
      prompt: "Enter the Lambda function name",
      value: simplifiedSuggestion,
      validateInput: (value) => {
        if (!value || !/^[a-zA-Z0-9-_]+$/.test(value.trim())) {
          return "Function name can only contain letters, numbers, hyphens, and underscores";
        }
        return null;
      },
    });
    return result?.trim();
  }
  
  private async getArchitecture(): Promise<string | undefined> {
    const archs = [
        { label: "arm64 (AWS Graviton)", description: "Recommended for new functions, cheaper and faster", value: "arm64" },
        { label: "x86_64 (Intel/AMD)", description: "Legacy architecture", value: "x86_64" }
    ];
    const selected = await vscode.window.showQuickPick(archs, {
        placeHolder: "Select the processor architecture for this Lambda",
    });
    return selected?.value;
  }

  private async getEventType(sourceCode: string): Promise<string | undefined> {
    const detectedType = this.detector.detectEventType(sourceCode);
    const eventTypes = [
      { label: "🌐 API Gateway (REST)", value: "apigateway", description: "HTTP REST API events" },
      { label: "🪣 S3 Events", value: "s3", description: "S3 bucket events" },
      { label: "📊 DynamoDB Streams", value: "dynamodb", description: "DynamoDB stream events" },
      { label: "📬 SQS Messages", value: "sqs", description: "SQS queue events" },
    ];
    let preselectedIndex = 0;
    if (detectedType) {
      const foundIndex = eventTypes.findIndex((type) => type.value === detectedType);
      if (foundIndex >= 0) {
        preselectedIndex = foundIndex;
        vscode.window.showInformationMessage(`🎯 Auto-detected event type: ${eventTypes[foundIndex].label}`);
      }
    }
    const selectedType = await vscode.window.showQuickPick(eventTypes, {
      placeHolder: detectedType ? `Detected: ${eventTypes[preselectedIndex].label}` : "Select the event type",
    });
    return selectedType?.value;
  }
}
