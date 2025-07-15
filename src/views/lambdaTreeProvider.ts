import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LambdaDetector, LambdaConfig } from "../detector";
import { ConfigManager, LocalLambdaConfig } from "../utils";

export class LambdaTreeProvider
  implements vscode.TreeDataProvider<LambdaTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    LambdaTreeItem | undefined | null | void
  > = new vscode.EventEmitter<LambdaTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    LambdaTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private detector: LambdaDetector;
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.detector = new LambdaDetector();
    this.workspacePath = workspacePath;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateWorkspacePath(newPath: string): void {
    this.workspacePath = newPath;
    this.refresh();
  }

  getTreeItem(element: LambdaTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LambdaTreeItem): Thenable<LambdaTreeItem[]> {
    if (!this.workspacePath || !fs.existsSync(this.workspacePath)) {
      return Promise.resolve([]);
    }

    if (element) {
      return Promise.resolve(this.getLambdaFiles(element.config));
    } else {
      return Promise.resolve(this.getLambdas());
    }
  }

  private getLambdas(): LambdaTreeItem[] {
    try {
      const lambdaConfigs = this.detector.getAllLambdaFunctions(
        this.workspacePath
      );
      return lambdaConfigs.map((config) => {
        const lambdaDir = path.join(config.workspacePath, config.functionName);
        let buildStatus = "❌";
        let localConfig: LocalLambdaConfig | null = null;
        try {
          ConfigManager.cleanupConfigJson(lambdaDir);
          localConfig = ConfigManager.readLocalConfig(lambdaDir);
          const buildPath = path.join(lambdaDir, "build", "bootstrap");
          buildStatus = fs.existsSync(buildPath) ? "✅" : "❌";
        } catch (error) {
          console.warn(
            `Could not read template.yaml for ${config.functionName}:`,
            error
          );
          buildStatus = "⚠️";
        }

        const item = new LambdaTreeItem(
          `${config.functionName}`,
          vscode.TreeItemCollapsibleState.Collapsed,
          config,
          "lambda"
        );
        item.description = `${config.eventType} ${buildStatus}`;
        item.tooltip = `Event Type: ${config.eventType}\nBuild Status: ${
          buildStatus === "✅"
            ? "Built"
            : buildStatus === "⚠️"
            ? "Template Missing"
            : "Not Built"
        }\nSource: ${config.sourceFile}\nConfig: template.yaml only`;
        item.iconPath = new vscode.ThemeIcon(
          config.eventType === "apigateway"
            ? "globe"
            : config.eventType === "s3"
            ? "database"
            : config.eventType === "dynamodb"
            ? "table"
            : config.eventType === "sqs"
            ? "mail"
            : "symbol-function"
        );
        item.contextValue = "lambdaFunction";
        return item;
      });
    } catch (error) {
      console.error("Error getting lambdas:", error);
      return [];
    }
  }

  private getLambdaFiles(config: LambdaConfig): LambdaTreeItem[] {
    const lambdaDir = path.join(config.workspacePath, config.functionName);
    const files: LambdaTreeItem[] = [];
    const fileConfigs = [
      {
        name: "template.yaml",
        icon: "file-code",
        description: "SAM template (source of truth)",
        contextValue: "templateFile",
      },
      {
        name: "event.json",
        icon: "symbol-object",
        description: "Test event data",
        contextValue: "eventFile",
      },
      {
        name: "response.json",
        icon: "output",
        description: "Last execution response",
        contextValue: "responseFile",
      },
    ];

    fileConfigs.forEach((fileConfig) => {
      const filePath = path.join(lambdaDir, fileConfig.name);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const item = new LambdaTreeItem(
          fileConfig.name,
          vscode.TreeItemCollapsibleState.None,
          config,
          "file"
        );
        item.description = fileConfig.description;
        item.tooltip = `${
          fileConfig.description
        }\nLast modified: ${stats.mtime.toLocaleString()}`;
        item.iconPath = new vscode.ThemeIcon(fileConfig.icon);
        item.contextValue = fileConfig.contextValue;
        item.filePath = filePath;
        item.command = {
          command: "vscode.open",
          title: "Open File",
          arguments: [vscode.Uri.file(filePath)],
        };
        files.push(item);
      }
    });

    const eventFilePath = path.join(lambdaDir, "event.json");
    if (config.eventType === "apigateway" && !fs.existsSync(eventFilePath)) {
      const infoItem = new LambdaTreeItem(
        "ℹ️ API Gateway Info",
        vscode.TreeItemCollapsibleState.None,
        config,
        "file"
      );
      infoItem.description = "No event.json needed";
      infoItem.tooltip =
        "API Gateway Lambdas don't need event.json files.\nUse 'Run Lambda' on template.yaml to start the server.";
      infoItem.iconPath = new vscode.ThemeIcon("info");
      infoItem.contextValue = "infoFile";
      files.push(infoItem);
    }

    const configJsonPath = path.join(lambdaDir, "config.json");
    if (fs.existsSync(configJsonPath)) {
      const cleanupItem = new LambdaTreeItem(
        "config.json (obsolete)",
        vscode.TreeItemCollapsibleState.None,
        config,
        "file"
      );
      cleanupItem.description = "⚠️ Can be deleted";
      cleanupItem.iconPath = new vscode.ThemeIcon("warning");
      cleanupItem.contextValue = "obsoleteFile";
      cleanupItem.tooltip =
        "This file is obsolete. The extension now uses only template.yaml. You can safely delete this file.";
      files.push(cleanupItem);
    }

    return files;
  }
}

export class LambdaTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly config: LambdaConfig,
    public readonly itemType: "lambda" | "file" | "folder",
    public filePath?: string
  ) {
    super(label, collapsibleState);
  }
}
