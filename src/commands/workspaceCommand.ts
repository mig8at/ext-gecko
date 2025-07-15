import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LambdaDetector, LambdaConfig } from "../detector";

export class WorkspaceCommand {
  private detector: LambdaDetector;

  constructor(private context: vscode.ExtensionContext) {
    this.detector = new LambdaDetector();
  }

  async execute(): Promise<void> {
    try {
      await this.showWorkspaceManager();
    } catch (error) {
      vscode.window.showErrorMessage(`Workspace manager failed: ${error}`);
    }
  }

  private async showWorkspaceManager(): Promise<void> {
    const defaultPath = path.join(require("os").homedir(), "lambda-workspace");

    // Get workspace path from user
    const workspacePath = await vscode.window.showInputBox({
      prompt: "Enter the lambda workspace path to manage",
      value: defaultPath,
      placeHolder: "e.g., /home/user/lambda-workspace",
    });
    if (!workspacePath) {
      return; // User cancelled
    }

    if (!fs.existsSync(workspacePath)) {
      const create = await vscode.window.showInformationMessage(
        `Workspace directory doesn't exist: ${workspacePath}. Create it?`,
        "Create",
        "Cancel"
      );
      if (create === "Create") {
        fs.mkdirSync(workspacePath, { recursive: true });
        vscode.window.showInformationMessage(
          `✅ Created workspace: ${workspacePath}`
        );
      }
      return;
    }

    // Get all lambda functions in this workspace
    const lambdaConfigs = this.detector.getAllLambdaFunctions(workspacePath);
    if (lambdaConfigs.length === 0) {
      vscode.window
        .showInformationMessage(
          `No Lambda functions found in workspace: ${workspacePath}`,
          "Open Workspace"
        )
        .then((selection) => {
          if (selection === "Open Workspace") {
            vscode.commands.executeCommand(
              "vscode.openFolder",
              vscode.Uri.file(workspacePath)
            );
          }
        });
      return;
    }

    // Show lambda functions in quick pick
    const lambdaItems = lambdaConfigs.map((config) => ({
      label: `🦎 ${config.functionName}`,
      description: `${config.eventType} • ${path.basename(config.sourceFile)}`,
      detail: config.sourceDir,
      config: config,
    }));

    const selectedLambda = await vscode.window.showQuickPick(lambdaItems, {
      placeHolder: `Select a Lambda function from workspace (${lambdaConfigs.length} found)`,
      canPickMany: false,
    });

    if (!selectedLambda) {
      return; // User cancelled
    }

    // Show actions for selected lambda
    await this.showLambdaActions(selectedLambda.config, workspacePath);
  }

  private async showLambdaActions(
    config: LambdaConfig,
    workspacePath: string
  ): Promise<void> {
    const actions = [
      {
        label: "📂 Open Lambda Directory",
        description: "Open the lambda workspace directory",
        action: "openDirectory",
      },
      {
        label: "📝 Open Source File",
        description: "Open the source main.go file",
        action: "openSource",
      },
      {
        label: "📄 View Template",
        description: "View SAM template.yaml",
        action: "viewTemplate",
      },
      {
        label: "🎯 Edit Event",
        description: "Edit test event.json",
        action: "editEvent",
      },
      {
        label: "🗑️ Remove Lambda",
        description: "Remove lambda from workspace",
        action: "remove",
      },
      {
        label: "ℹ️ Show Info",
        description: "Show lambda configuration details",
        action: "showInfo",
      },
    ];

    const selectedAction = await vscode.window.showQuickPick(actions, {
      placeHolder: `What do you want to do with ${config.functionName}?`,
      canPickMany: false,
    });

    if (!selectedAction) {
      return; // User cancelled
    }
    await this.executeAction(selectedAction.action, config, workspacePath);
  }

  private async executeAction(
    action: string,
    config: LambdaConfig,
    workspacePath: string
  ): Promise<void> {
    const lambdaDir = path.join(workspacePath, config.functionName);
    switch (action) {
      case "openDirectory":
        await vscode.commands.executeCommand(
          "vscode.openFolder",
          vscode.Uri.file(lambdaDir)
        );
        break;
      case "openSource":
        if (fs.existsSync(config.sourceFile)) {
          const document = await vscode.workspace.openTextDocument(
            config.sourceFile
          );
          await vscode.window.showTextDocument(document);
        } else {
          vscode.window.showErrorMessage(
            `Source file not found: ${config.sourceFile}`
          );
        }
        break;
      case "viewTemplate":
        const templatePath = path.join(lambdaDir, "template.yaml");
        if (fs.existsSync(templatePath)) {
          const document = await vscode.workspace.openTextDocument(
            templatePath
          );
          await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.Beside,
          });
        } else {
          vscode.window.showErrorMessage(
            `Template file not found: ${templatePath}`
          );
        }
        break;
      case "editEvent":
        const eventPath = path.join(lambdaDir, "event.json");
        if (fs.existsSync(eventPath)) {
          const document = await vscode.workspace.openTextDocument(eventPath);
          await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.Beside,
          });
        } else {
          vscode.window.showErrorMessage(`Event file not found: ${eventPath}`);
        }
        break;
      case "remove":
        await this.removeLambda(config, lambdaDir, workspacePath);
        break;
      case "showInfo":
        await this.showLambdaInfo(config, lambdaDir);
        break;
    }
  }

  private async removeLambda(
    config: LambdaConfig,
    lambdaDir: string,
    workspacePath: string
  ): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
      `This will permanently delete the lambda workspace for "${config.functionName}". The source code will NOT be deleted. Continue?`,
      "Delete Workspace",
      "Cancel"
    );

    if (confirmation === "Delete Workspace") {
      try {
        // Remove from configuration
        this.detector.removeConfiguration(config.sourceFile, workspacePath);
        // Remove directory
        if (fs.existsSync(lambdaDir)) {
          fs.rmSync(lambdaDir, { recursive: true, force: true });
          console.log(`🗑️ Removed lambda directory: ${lambdaDir}`);
        }
        vscode.window.showInformationMessage(
          `✅ Lambda "${config.functionName}" removed from workspace. Source code preserved.`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to remove lambda: ${error}`);
      }
    }
  }

  private async showLambdaInfo(
    config: LambdaConfig,
    lambdaDir: string
  ): Promise<void> {
    const buildPath = path.join(lambdaDir, "build", "bootstrap");
    const buildExists = fs.existsSync(buildPath);
    const buildTime = buildExists
      ? fs.statSync(buildPath).mtime.toISOString()
      : "Never built";

    const infoContent = `🦎 **Lambda Function Details**
## Basic Information
- **Function Name:** ${config.functionName}
- **Event Type:** ${config.eventType}
- **Last Modified:** ${config.lastModified}
## File Locations
- **Source File:** ${config.sourceFile}
- **Source Directory:** ${config.sourceDir}
- **Lambda Workspace:** ${lambdaDir}
## Build Information
- **Build Status:** ${buildExists ? "✅ Built" : "❌ Not built"}
- **Last Build:** ${buildTime}
- **Binary Location:** ${buildPath}
## Available Files
- \`template.yaml\` - SAM template for deployment
- \`event.json\` - Test event data 
- \`config.json\` - Local configuration
---
**Configuration Path:** ${path.join(
      config.workspacePath,
      ".gecko-lambda-config.json"
    )}`;

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
