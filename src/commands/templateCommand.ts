import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LambdaDetector } from "../detector";
import { ConfigManager } from "../utils";

export class TemplateCommand {
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

    const config = this.detector.getConfiguration(activeEditor.document.uri);
    if (!config) {
      vscode.window.showErrorMessage(
        "Lambda not configured. Please run configure first."
      );
      return;
    }

    await this.openTemplateFile(config);
  }

  private async openTemplateFile(config: any): Promise<void> {
    const lambdaDir = path.join(config.workspacePath, config.functionName);
    const templateFilePath = path.join(lambdaDir, "template.yaml");

    try {
      // Clean up any old config.json files
      ConfigManager.cleanupConfigJson(lambdaDir);

      // Ensure template file exists (it should, as it's the source of truth)
      if (!fs.existsSync(templateFilePath)) {
        vscode.window.showErrorMessage(
          `Template file not found: ${templateFilePath}. Please reconfigure the lambda.`
        );
        return;
      }

      // Read configuration from template.yaml for metadata
      let localConfig: any;
      try {
        localConfig = ConfigManager.readLocalConfig(lambdaDir);
      } catch (error) {
        console.warn(
          "Could not read configuration from template.yaml, showing template anyway:",
          error
        );
        localConfig = {
          functionName: config.functionName,
          eventType: config.eventType,
        };
      }

      // Open the template file (source of truth)
      const templateDocument = await vscode.workspace.openTextDocument(
        templateFilePath
      );
      const editor = await vscode.window.showTextDocument(templateDocument, {
        viewColumn: vscode.ViewColumn.Active,
        preview: false,
      });

      // Set language to YAML
      await vscode.languages.setTextDocumentLanguage(templateDocument, "yaml");

      // Show helpful message
      vscode.window
        .showInformationMessage(
          `📄 Editing template.yaml for ${localConfig.functionName} (${localConfig.eventType}) - This is the ONLY SOURCE OF TRUTH`,
          "Open Lambda Directory",
          "Validate Template",
          "Show Info"
        )
        .then(async (selection) => {
          switch (selection) {
            case "Open Lambda Directory":
              await this.openLambdaDirectory(lambdaDir);
              break;
            case "Validate Template":
              await this.validateTemplate(lambdaDir);
              break;
            case "Show Info":
              await this.showTemplateInfo(localConfig, lambdaDir);
              break;
          }
        });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open template file: ${error}`);
    }
  }

  private async openLambdaDirectory(lambdaDir: string): Promise<void> {
    try {
      await vscode.commands.executeCommand(
        "vscode.openFolder",
        vscode.Uri.file(lambdaDir),
        { forceNewWindow: false }
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open directory: ${error}`);
    }
  }

  private async validateTemplate(lambdaDir: string): Promise<void> {
    const terminal = vscode.window.createTerminal({
      name: "🦎 SAM Validate",
      cwd: lambdaDir,
    });
    terminal.show(true);
    terminal.sendText("sam validate");
    vscode.window.showInformationMessage("🔍 Validating SAM template...");
  }

  private async showTemplateInfo(
    localConfig: any,
    lambdaDir: string
  ): Promise<void> {
    const templatePath = path.join(lambdaDir, "template.yaml");
    const templateExists = fs.existsSync(templatePath);
    const templateStats = templateExists ? fs.statSync(templatePath) : null;
    const envVarsCount = localConfig.environment?.variables
      ? Object.keys(localConfig.environment.variables).length
      : 0;
    const envVarsInfo =
      envVarsCount > 0
        ? `\n\n## Environment Variables (${envVarsCount})\n${Object.entries(
            localConfig.environment!.variables
          )
            .map(([key, value]) => `- **${key}**: ${value}`)
            .join("\n")}`
        : "\n\n## Environment Variables\n- No environment variables configured";

    const infoContent = `🦎 **Lambda Template Information**
## Single Source of Truth: template.yaml ✅
**template.yaml is the ONLY configuration file. All configuration is stored here.**
## Basic Information
- **Function Name:** ${localConfig.functionName}
- **Event Type:** ${localConfig.eventType}
- **Runtime:** ${localConfig.runtime || "provided.al2023"}
- **Architecture:** ${localConfig.architecture || "arm64"}
- **Lambda Directory:** ${lambdaDir}
## File Status
- **template.yaml (ONLY SOURCE):** ${
      templateExists ? "✅ Exists" : "❌ Missing"
    } ${
      templateStats ? `(Modified: ${templateStats.mtime.toLocaleString()})` : ""
    }
## Template Configuration
- **Timeout:** ${localConfig.template?.timeout || 30} seconds
- **Memory Size:** ${localConfig.template?.memorySize || 128} MB
- **Description:** ${
      localConfig.template?.description || "Default description"
    }${envVarsInfo}
${
  localConfig.environment?.source === "aws"
    ? `\n## AWS Integration
- **Source:** Downloaded from AWS Lambda
- **AWS Function Name:** ${localConfig.environment.awsFunctionName}
- **Last Updated:** ${localConfig.environment.lastUpdated}`
    : ""
}
---
## Simplified Architecture
- \`template.yaml\` - **ONLY SOURCE OF TRUTH** - All configuration lives here
- \`event.json\` - Test event data
## Making Changes
1. Edit \`template.yaml\` directly - all changes are immediately available
2. No more config.json - everything is in template.yaml
3. Environment variables, timeout, memory, etc. all in template.yaml
4. Changes persist across builds and downloads
## Benefits
✅ Single source of truth
✅ No config synchronization issues 
✅ Direct SAM template editing
✅ Simplified workflow`;

    const infoDocument = await vscode.workspace.openTextDocument({
      content: infoContent,
      language: "markdown",
    });
    await vscode.window.showTextDocument(infoDocument, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: true,
    });
  }
}
