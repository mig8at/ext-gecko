import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LambdaDetector } from "../detector";
import { ConfigManager, TemplateManager, AWSUtils } from "../utils";

export class DownloadCommand {
  private detector: LambdaDetector;

  constructor(private context: vscode.ExtensionContext) {
    this.detector = new LambdaDetector();
  }

  async execute(): Promise<void> {
    try {
      console.log("🦎 Download command executed!");
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

      // Verify AWS setup
      if (
        !(await AWSUtils.checkAWSCLI()) ||
        !(await AWSUtils.verifyCredentials())
      ) {
        return;
      }

      const awsFunctionName = await this.getAWSFunctionName();
      if (!awsFunctionName) return;

      await this.downloadAndUpdateTemplate(config, awsFunctionName);
    } catch (error) {
      console.error("❌ Download command error:", error);
      vscode.window.showErrorMessage(`Failed to download lambda: ${error}`);
    }
  }

  private async getAWSFunctionName(): Promise<string | undefined> {
    const result = await vscode.window.showInputBox({
      prompt: "Enter the AWS Lambda function name",
      placeHolder: "e.g., my-lambda-function",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Function name cannot be empty";
        }
        return null;
      },
    });

    return result?.trim();
  }

  private async downloadAndUpdateTemplate(
    config: any,
    awsFunctionName: string
  ): Promise<void> {
    try {
      console.log(
        `🔽 Downloading environment variables from ${awsFunctionName}...`
      );

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `🦎 Downloading ${awsFunctionName} environment variables`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 0, message: "Connecting to AWS..." });

          const functionConfig = await AWSUtils.getFunctionConfiguration(
            awsFunctionName
          );

          progress.report({
            increment: 50,
            message: "Processing environment variables...",
          });

          const environment = functionConfig.Environment?.Variables || {};
          const envCount = Object.keys(environment).length;

          console.log(`📋 Found ${envCount} environment variables`);

          if (envCount === 0) {
            vscode.window.showInformationMessage(
              `No environment variables found in AWS Lambda "${awsFunctionName}"`
            );
            return;
          }

          await this.updateTemplateOnly(config, environment, awsFunctionName);

          progress.report({ increment: 100, message: "Complete!" });
        }
      );
    } catch (error: any) {
      console.error("❌ Download error:", error);
      if (error.message.includes("ResourceNotFoundException")) {
        vscode.window.showErrorMessage(
          `Lambda function "${awsFunctionName}" not found`
        );
      } else if (error.message.includes("AccessDeniedException")) {
        vscode.window.showErrorMessage(
          `Access denied to Lambda function "${awsFunctionName}"`
        );
      } else {
        vscode.window.showErrorMessage(`Failed to download: ${error.message}`);
      }
    }
  }

  private async updateTemplateOnly(
    config: any,
    environment: { [key: string]: string },
    awsFunctionName: string
  ): Promise<void> {
    try {
      const lambdaDir = path.join(config.workspacePath, config.functionName);
      const templatePath = path.join(lambdaDir, "template.yaml");

      console.log(
        `📄 Updating template.yaml (only source of truth): ${templatePath}`
      );

      // Clean up any old config.json files
      ConfigManager.cleanupConfigJson(lambdaDir);

      // Update template.yaml directly (only source of truth)
      TemplateManager.updateEnvironmentVariables(
        lambdaDir,
        environment,
        awsFunctionName
      );

      const envCount = Object.keys(environment).length;
      console.log(`✅ Template updated with ${envCount} environment variables`);

      vscode.window
        .showInformationMessage(
          `✅ Downloaded ${envCount} environment variables from AWS Lambda "${awsFunctionName}" and updated template.yaml (only source of truth)`,
          "View Template",
          "Edit Template",
          "Show Info"
        )
        .then(async (selection) => {
          if (selection === "View Template") {
            const templateDocument = await vscode.workspace.openTextDocument(
              templatePath
            );
            await vscode.window.showTextDocument(templateDocument);
          } else if (selection === "Edit Template") {
            const templateDocument = await vscode.workspace.openTextDocument(
              templatePath
            );
            await vscode.window.showTextDocument(templateDocument, {
              preview: false,
              viewColumn: vscode.ViewColumn.Active,
            });
          } else if (selection === "Show Info") {
            await this.showDownloadInfo(lambdaDir, envCount, awsFunctionName);
          }
        });
    } catch (error) {
      console.error("❌ Template update error:", error);
      vscode.window.showErrorMessage(`Failed to update template: ${error}`);
    }
  }

  private async showDownloadInfo(
    lambdaDir: string,
    envCount: number,
    awsFunctionName: string
  ): Promise<void> {
    const templatePath = path.join(lambdaDir, "template.yaml");
    const templateStats = fs.existsSync(templatePath)
      ? fs.statSync(templatePath)
      : null;

    const infoContent = `🦎 **AWS Download Complete**

## Download Summary
- **AWS Function:** ${awsFunctionName}
- **Environment Variables:** ${envCount} variables downloaded
- **Updated:** ${new Date().toLocaleString()}
- **Target:** template.yaml (only source of truth)

## File Information
- **Template Path:** ${templatePath}
- **Last Modified:** ${
      templateStats ? templateStats.mtime.toLocaleString() : "Unknown"
    }

## Simplified Architecture ✅
- **template.yaml** - Only source of truth, contains all configuration
- **No config.json** - Eliminated for simplicity
- All environment variables are now in template.yaml

## What Happened
1. 🔽 Connected to AWS Lambda "${awsFunctionName}"
2. 📋 Downloaded ${envCount} environment variables
3. 📄 Updated template.yaml directly
4. 🗑️ Cleaned up any old config.json files

## Next Steps
- Edit template.yaml to modify any settings
- Use "Run Lambda" to test with new environment variables
- All changes persist in template.yaml automatically`;

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
