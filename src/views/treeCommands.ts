import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LambdaTreeItem } from "./lambdaTreeProvider";
import { ConfigManager, BuildUtils, AWSUtils, StringUtils } from "../utils";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class TreeCommands {
  private apiServerTerminal: vscode.Terminal | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  async runLambdaFromTree(item: LambdaTreeItem): Promise<void> {
    try {
      const lambdaDir = path.join(
        item.config.workspacePath,
        item.config.functionName
      );
      ConfigManager.cleanupConfigJson(lambdaDir);
      const localConfig = ConfigManager.readLocalConfig(lambdaDir);
      const needsBuild = BuildUtils.needsRebuild(localConfig, lambdaDir);
      if (needsBuild) {
        console.log(`🔨 Building ${localConfig.functionName} before run...`);
        await this.buildLambdaFromTree(item);
      } else {
        console.log(
          `✅ Build is up-to-date for ${localConfig.functionName}, skipping rebuild.`
        );
        vscode.window.showInformationMessage(
          `✅ ${localConfig.functionName} is already built and up-to-date!`
        );
      }
      if (localConfig.eventType === "apigateway") {
        await this.runApiGatewayLambda(localConfig, lambdaDir);
      } else {
        await this.runRegularLambda(localConfig, lambdaDir);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to run lambda: ${error}`);
    }
  }

  async buildLambdaFromTree(item: LambdaTreeItem): Promise<void> {
    try {
      const lambdaDir = path.join(
        item.config.workspacePath,
        item.config.functionName
      );
      ConfigManager.cleanupConfigJson(lambdaDir);
      const localConfig = ConfigManager.readLocalConfig(lambdaDir);
      const needsBuild = BuildUtils.needsRebuild(localConfig, lambdaDir);
      if (!needsBuild) {
        vscode.window.showInformationMessage(
          `✅ ${localConfig.functionName} is already up-to-date, no build needed!`
        );
        return;
      }
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `🦎 Building ${localConfig.functionName}`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({
            increment: 0,
            message: "Preparing build environment...",
          });
          progress.report({ increment: 20, message: "Building with Go..." });
          await BuildUtils.buildWithGo(lambdaDir, localConfig);
          progress.report({ increment: 100, message: "Build complete!" });
        }
      );
      vscode.window.showInformationMessage(
        `🚀 ${localConfig.functionName} built successfully!`
      );
      vscode.commands.executeCommand("gecko.refreshTreeView");
    } catch (error) {
      vscode.window.showErrorMessage(`Build failed: ${error}`);
    }
  }

  async openLambdaDirectory(item: LambdaTreeItem): Promise<void> {
    const lambdaDir = path.join(
      item.config.workspacePath,
      item.config.functionName
    );
    await vscode.commands.executeCommand(
      "vscode.openFolder",
      vscode.Uri.file(lambdaDir),
      { forceNewWindow: false }
    );
  }

  async openSourceFile(item: LambdaTreeItem): Promise<void> {
    if (fs.existsSync(item.config.sourceFile)) {
      const document = await vscode.workspace.openTextDocument(
        item.config.sourceFile
      );
      await vscode.window.showTextDocument(document);
    } else {
      vscode.window.showErrorMessage(
        `Source file not found: ${item.config.sourceFile}`
      );
    }
  }

  async editEventFile(item: LambdaTreeItem): Promise<void> {
    const lambdaDir = path.join(
      item.config.workspacePath,
      item.config.functionName
    );
    const eventFilePath = path.join(lambdaDir, "event.json");
    if (item.config.eventType === "apigateway") {
      vscode.window
        .showInformationMessage(
          `🌐 API Gateway Lambdas don't need event files. Use "Run Lambda" to start the local server and test with HTTP requests.`,
          "Run Lambda",
          "OK"
        )
        .then((selection) => {
          if (selection === "Run Lambda") {
            this.runLambdaFromTree(item);
          }
        });
      return;
    }
    if (!fs.existsSync(eventFilePath)) {
      vscode.window.showErrorMessage(
        "Event file not found. Please configure the lambda first."
      );
      return;
    }
    const document = await vscode.workspace.openTextDocument(eventFilePath);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
    });
  }

  async viewTemplateFile(item: LambdaTreeItem): Promise<void> {
    const lambdaDir = path.join(
      item.config.workspacePath,
      item.config.functionName
    );
    const templateFilePath = path.join(lambdaDir, "template.yaml");
    if (!fs.existsSync(templateFilePath)) {
      vscode.window.showErrorMessage(
        "Template file not found. Please configure the lambda first."
      );
      return;
    }
    const document = await vscode.workspace.openTextDocument(templateFilePath);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
    });
  }

  async viewResponseFile(item: LambdaTreeItem): Promise<void> {
    const lambdaDir = path.join(
      item.config.workspacePath,
      item.config.functionName
    );
    const responseFilePath = path.join(lambdaDir, "response.json");
    if (!fs.existsSync(responseFilePath)) {
      vscode.window
        .showInformationMessage(
          "No response file found. Run the lambda first to generate a response.",
          "Run Lambda"
        )
        .then((selection) => {
          if (selection === "Run Lambda") {
            this.runLambdaFromTree(item);
          }
        });
      return;
    }
    const document = await vscode.workspace.openTextDocument(responseFilePath);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
    });
  }

  async removeLambda(item: LambdaTreeItem): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
      `This will permanently delete the lambda workspace for "${item.config.functionName}". The source code will NOT be deleted. Continue?`,
      "Delete Workspace",
      "Cancel"
    );
    if (confirmation === "Delete Workspace") {
      try {
        const lambdaDir = path.join(
          item.config.workspacePath,
          item.config.functionName
        );
        if (fs.existsSync(lambdaDir)) {
          fs.rmSync(lambdaDir, { recursive: true, force: true });
        }
        vscode.window.showInformationMessage(
          `✅ Lambda "${item.config.functionName}" removed from workspace. Source code preserved.`
        );
        vscode.commands.executeCommand("gecko.refreshTreeView");
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to remove lambda: ${error}`);
      }
    }
  }

  async downloadFromTree(item: LambdaTreeItem): Promise<void> {
    try {
      if (
        !(await AWSUtils.checkAWSCLI()) ||
        !(await AWSUtils.verifyCredentials())
      ) {
        return;
      }

      const awsFunctionName = await vscode.window.showInputBox({
        prompt: "Enter the AWS Lambda function name to download from",
        placeHolder: `e.g., my-production-function`,
      });

      if (!awsFunctionName) {
        return;
      }

      const config = item.config;
      const lambdaDir = path.join(config.workspacePath, config.functionName);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `🦎 Downloading env from ${awsFunctionName}`,
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

          if (envCount === 0) {
            vscode.window.showInformationMessage(
              `No environment variables found in AWS Lambda "${awsFunctionName}"`
            );
            return;
          }

          ConfigManager.updateEnvironmentVariables(
            lambdaDir,
            environment,
            awsFunctionName
          );

          progress.report({ increment: 100, message: "Download complete!" });
          vscode.window
            .showInformationMessage(
              `✅ Downloaded ${envCount} variables from "${awsFunctionName}" into template.yaml`,
              "View Template"
            )
            .then((selection) => {
              if (selection === "View Template") {
                this.viewTemplateFile(item);
              }
            });
        }
      );
    } catch (error: any) {
      console.error("❌ Download from tree error:", error);
      if (error.message.includes("ResourceNotFoundException")) {
        vscode.window.showErrorMessage(`Lambda function not found in AWS`);
      } else {
        vscode.window.showErrorMessage(`Download failed: ${error.message}`);
      }
    }
  }

  async stopApiServer(): Promise<void> {
    if (this.apiServerTerminal) {
      this.apiServerTerminal.dispose();
      this.apiServerTerminal = undefined;
      vscode.window.showInformationMessage("🛑 API Gateway server stopped");
    }
  }

  private async runApiGatewayLambda(
    localConfig: any,
    lambdaDir: string
  ): Promise<void> {
    const dockerAvailable = await AWSUtils.checkDockerAvailable();
    if (!dockerAvailable) {
      const result = await vscode.window.showErrorMessage(
        "🐳 Docker is required for SAM local testing. Please start Docker Desktop and try again.",
        "Open Docker",
        "Retry"
      );
      if (result === "Open Docker") {
        vscode.env.openExternal(
          vscode.Uri.parse("https://docs.docker.com/get-docker/")
        );
      }
      return;
    }

    if (this.apiServerTerminal) {
      this.apiServerTerminal.dispose();
    }

    const command = `sam local start-api --host localhost --port 3000`;
    this.apiServerTerminal = vscode.window.createTerminal({
      name: `🦎 API Gateway - ${localConfig.functionName}`,
      cwd: lambdaDir,
    });
    this.apiServerTerminal.show(true);
    this.apiServerTerminal.sendText(command);
    vscode.window
      .showInformationMessage(
        `🌐 API Gateway started for ${localConfig.functionName}! Access at: http://localhost:3000`,
        "Open Browser",
        "Stop Server"
      )
      .then((selection) => {
        if (selection === "Open Browser") {
          vscode.env.openExternal(vscode.Uri.parse("http://localhost:3000"));
        } else if (selection === "Stop Server") {
          this.stopApiServer();
        }
      });
  }

  private async runRegularLambda(
    localConfig: any,
    lambdaDir: string
  ): Promise<void> {
    const eventFilePath = path.join(lambdaDir, "event.json");
    if (!fs.existsSync(eventFilePath)) {
      const createEvent = await vscode.window.showInformationMessage(
        "Event file not found. Create it now?",
        "Yes",
        "No"
      );
      if (createEvent === "Yes") {
        await vscode.commands.executeCommand("gecko.editEvent");
        return;
      } else {
        return;
      }
    }

    const dockerAvailable = await AWSUtils.checkDockerAvailable();
    if (!dockerAvailable) {
      const result = await vscode.window.showErrorMessage(
        "🐳 Docker is required for SAM local testing. Please start Docker Desktop and try again.",
        "Open Docker",
        "Retry"
      );
      if (result === "Open Docker") {
        vscode.env.openExternal(
          vscode.Uri.parse("https://docs.docker.com/get-docker/")
        );
      }
      return;
    }

    const functionName =
      StringUtils.toPascalCase(localConfig.functionName) + "Function";
    const command = `sam local invoke "${functionName}" --event "${eventFilePath}"`;
    const responseFilePath = path.join(lambdaDir, "response.json");
    console.log(`🚀 Executing: ${command}`);
    console.log(`📁 Working directory: ${lambdaDir}`);

    const terminal = vscode.window.createTerminal({
      name: `🦎 Running ${localConfig.functionName}`,
      cwd: lambdaDir,
    });
    terminal.show(true);
    terminal.sendText(command);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `🦎 Executing ${localConfig.functionName}`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({
            increment: 0,
            message: "Starting Lambda execution...",
          });

          const { stdout, stderr } = await execAsync(command, {
            cwd: lambdaDir,
            timeout: 120000,
            maxBuffer: 1024 * 1024 * 10,
          });
          progress.report({ increment: 50, message: "Processing response..." });

          const response = this.parseResponse(stdout);
          fs.writeFileSync(responseFilePath, JSON.stringify(response, null, 2));
          console.log(`📄 Response saved to: ${responseFilePath}`);
          progress.report({ increment: 100, message: "Execution complete!" });

          await this.openResponseFile(responseFilePath);
          vscode.window.showInformationMessage(
            `✅ ${localConfig.functionName} executed successfully! Response opened automatically.`
          );
        }
      );
    } catch (error: any) {
      console.error("SAM execution error:", error);

      const errorResponse = {
        error: true,
        message: error.message,
        stderr: error.stderr || "",
        stdout: error.stdout || "",
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(
        responseFilePath,
        JSON.stringify(errorResponse, null, 2)
      );

      await this.openResponseFile(responseFilePath);
      vscode.window.showErrorMessage(
        `❌ Lambda execution failed. Error details opened automatically.`
      );
    }
  }

  private parseResponse(stdout: string): any {
    try {
      const lines = stdout.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          trimmed.startsWith("{") ||
          trimmed.startsWith("[") ||
          trimmed === "null" ||
          trimmed === "true" ||
          trimmed === "false" ||
          /^".*"$/.test(trimmed) ||
          /^\d+(\.\d+)?$/.test(trimmed)
        ) {
          try {
            return JSON.parse(trimmed);
          } catch {
            continue;
          }
        }
      }
      return {
        output: stdout.trim(),
        timestamp: new Date().toISOString(),
        type: "raw_output",
      };
    } catch (error) {
      return {
        output: stdout.trim(),
        error: "Failed to parse response",
        timestamp: new Date().toISOString(),
        type: "parse_error",
      };
    }
  }

  private async openResponseFile(responseFilePath: string): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(
        responseFilePath
      );
      await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: false,
      });
      await vscode.languages.setTextDocumentLanguage(document, "json");
      console.log(`📄 Response file opened: ${responseFilePath}`);
    } catch (error) {
      console.error("Error opening response file:", error);
    }
  }
}
