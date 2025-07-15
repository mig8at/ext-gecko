import * as vscode from "vscode";
import * as path from "path";
import { LambdaDetector } from "../detector";
import { ConfigManager, BuildUtils } from "../utils";

export class BuildCommand {
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
        "Lambda not configured. Please run the lambda first to auto-configure."
      );
      return;
    }

    await this.buildLambda(config);
  }

  private async buildLambda(config: any): Promise<void> {
    const lambdaDir = path.join(config.workspacePath, config.functionName);
    try {
      // Clean up any old config.json files
      ConfigManager.cleanupConfigJson(lambdaDir);

      // Read configuration directly from template.yaml
      const localConfig = ConfigManager.readLocalConfig(lambdaDir);

      // Check if build is actually needed
      const needsBuild = BuildUtils.needsRebuild(localConfig, lambdaDir);
      if (!needsBuild) {
        console.log(
          `✅ Build is up-to-date for ${localConfig.functionName}, skipping rebuild.`
        );
        vscode.window.showInformationMessage(
          `✅ ${localConfig.functionName} is already up-to-date, no build needed!`
        );
        return;
      }

      console.log(
        `🦎 Building from source: ${localConfig.sourceMainFile} to workspace: ${lambdaDir}`
      );

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

          console.log(`🔧 Build method: direct`);
          progress.report({
            increment: 20,
            message: "Building with Go (Direct)...",
          });

          await BuildUtils.buildWithGo(lambdaDir, localConfig);
          progress.report({ increment: 100, message: "Build complete!" });
        }
      );

      vscode.window.showInformationMessage(
        `🚀 ${localConfig.functionName} built successfully!`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Build failed: ${error}`);
      console.error("Build error:", error);
    }
  }
}
