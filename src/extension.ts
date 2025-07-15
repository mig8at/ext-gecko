import * as vscode from "vscode";
import * as path from "path";
import { initializeOutputChannel, log, logError } from "./logger";
import { LambdaDetector } from "./detector";
import { ConfigCommand } from "./commands/configCommand";
import { EventCommand } from "./commands/eventCommand";
import { TemplateCommand } from "./commands/templateCommand";
import { RunCommand } from "./commands/runCommand";
import { WorkspaceCommand } from "./commands/workspaceCommand";
import { DownloadCommand } from "./commands/downloadCommand";
import { WorkspaceConfigCommand } from "./commands/workspaceConfigCommand";
import { BuildCommand } from "./commands/buildCommand";
import { LambdaTreeProvider, LambdaTreeItem } from "./views/lambdaTreeProvider";
import { TreeCommands } from "./views/treeCommands";
import { ConfigManager } from "./utils";

let statusBarItem: vscode.StatusBarItem;
let lambdaTreeProvider: LambdaTreeProvider;
let treeCommands: TreeCommands;
let detector: LambdaDetector;

export function activate(context: vscode.ExtensionContext) {
  initializeOutputChannel();
  log("🦎 Gecko Lambda extension is now active!");
  detector = new LambdaDetector();
  performUnifiedSystemMigration();

  const configCommand = new ConfigCommand(context);
  const eventCommand = new EventCommand(context);
  const templateCommand = new TemplateCommand(context);
  const runCommand = new RunCommand(context);
  const buildCommand = new BuildCommand(context);
  const workspaceCommand = new WorkspaceCommand(context);
  const downloadCommand = new DownloadCommand(context);
  const workspaceConfigCommand = new WorkspaceConfigCommand(context);

  const workspacePath = getGlobalWorkspacePath();
  lambdaTreeProvider = new LambdaTreeProvider(workspacePath);
  treeCommands = new TreeCommands(context);

  const treeView = vscode.window.createTreeView("geckoLambdaExplorer", {
    treeDataProvider: lambdaTreeProvider,
    showCollapseAll: true,
  });

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  updateStatusBar();
  statusBarItem.show();

  const commands = [
    vscode.commands.registerCommand("gecko.configure", () =>
      configCommand.execute()
    ),
    vscode.commands.registerCommand("gecko.configureWorkspace", () =>
      workspaceConfigCommand.execute()
    ),
    vscode.commands.registerCommand("gecko.editEvent", () =>
      eventCommand.execute()
    ),
    vscode.commands.registerCommand("gecko.viewTemplate", () =>
      templateCommand.execute()
    ),
    vscode.commands.registerCommand("gecko.run", () => runCommand.execute()),
    vscode.commands.registerCommand("gecko.build", () =>
      buildCommand.execute()
    ),
    vscode.commands.registerCommand("gecko.workspace", () =>
      workspaceCommand.execute()
    ),
    vscode.commands.registerCommand("gecko.download", () => {
      log("🦎 Download command triggered");
      return downloadCommand.execute();
    }),
    vscode.commands.registerCommand("gecko.migrateToUnified", () =>
      performUnifiedSystemMigration(true)
    ),
    vscode.commands.registerCommand("gecko.validateUnified", () =>
      validateUnifiedSystem()
    ),
    vscode.commands.registerCommand("gecko.repairTemplate", () =>
      repairCurrentTemplate()
    ),
    vscode.commands.registerCommand("gecko.refreshTreeView", () => {
      lambdaTreeProvider.refresh();
    }),
    vscode.commands.registerCommand(
      "gecko.tree.runLambda",
      (item: LambdaTreeItem) => treeCommands.runLambdaFromTree(item)
    ),
    vscode.commands.registerCommand(
      "gecko.tree.buildLambda",
      (item: LambdaTreeItem) => treeCommands.buildLambdaFromTree(item)
    ),
    vscode.commands.registerCommand(
      "gecko.tree.openDirectory",
      (item: LambdaTreeItem) => treeCommands.openLambdaDirectory(item)
    ),
    vscode.commands.registerCommand(
      "gecko.tree.openSource",
      (item: LambdaTreeItem) => treeCommands.openSourceFile(item)
    ),
    vscode.commands.registerCommand(
      "gecko.tree.editEvent",
      (item: LambdaTreeItem) => treeCommands.editEventFile(item)
    ),
    vscode.commands.registerCommand(
      "gecko.tree.viewTemplate",
      (item: LambdaTreeItem) => treeCommands.viewTemplateFile(item)
    ),
    vscode.commands.registerCommand(
      "gecko.tree.viewResponse",
      (item: LambdaTreeItem) => treeCommands.viewResponseFile(item)
    ),
    vscode.commands.registerCommand(
      "gecko.tree.removeLambda",
      (item: LambdaTreeItem) => treeCommands.removeLambda(item)
    ),
    vscode.commands.registerCommand(
      "gecko.tree.download",
      (item: LambdaTreeItem) => treeCommands.downloadFromTree(item)
    ),
    vscode.commands.registerCommand("gecko.tree.stopApiServer", () =>
      treeCommands.stopApiServer()
    ),
    vscode.commands.registerCommand("gecko.statusBar.quickActions", () =>
      showQuickActions()
    ),
  ];

  const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      updateContexts(editor, detector);
      updateDynamicStatusBar(editor, detector);
    }
  );

  const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(
    (event) => {
      if (vscode.window.activeTextEditor?.document === event.document) {
        updateContexts(vscode.window.activeTextEditor, detector);
        updateDynamicStatusBar(vscode.window.activeTextEditor, detector);
      }
    }
  );

  const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration(
    (e) => {
      if (e.affectsConfiguration("gecko.workspacePath")) {
        const newPath = getGlobalWorkspacePath();
        lambdaTreeProvider.updateWorkspacePath(newPath);
        updateStatusBar();
        setTimeout(() => performUnifiedSystemMigration(), 1000);
      }
    }
  );

  updateContexts(vscode.window.activeTextEditor, detector);
  updateDynamicStatusBar(vscode.window.activeTextEditor, detector);

  context.subscriptions.push(
    ...commands,
    onDidChangeActiveEditor,
    onDidChangeTextDocument,
    onDidChangeConfiguration,
    statusBarItem,
    treeView
  );
}

async function performUnifiedSystemMigration(
  force: boolean = false
): Promise<void> {
  try {
    const workspacePath = getGlobalWorkspacePath();
    if (force) {
      vscode.window.showInformationMessage(
        "🔄 Starting unified system migration..."
      );
    }
    const globalConfigExists = require("fs").existsSync(
      require("path").join(workspacePath, ".gecko-lambda-config.json")
    );
    if (globalConfigExists || force) {
      log("🔄 Migrating to unified system...");
      detector.migrateFromGlobalConfig(workspacePath);
      ConfigManager.cleanupGlobalConfig(workspacePath);
      if (lambdaTreeProvider) {
        lambdaTreeProvider.refresh();
      }
      if (force) {
        vscode.window.showInformationMessage(
          "✅ Migration to unified system completed successfully!"
        );
      }
    } else {
      log("✅ Already using unified system");
    }
  } catch (error: any) {
    logError("Migration failed", error, true);
  }
}

async function validateUnifiedSystem(): Promise<void> {
  try {
    const workspacePath = getGlobalWorkspacePath();
    const lambdaDirs = ConfigManager.getAllLambdaDirectories(workspacePath);
    if (lambdaDirs.length === 0) {
      vscode.window.showInformationMessage(
        "No Lambda functions found in workspace."
      );
      return;
    }
    let validCount = 0;
    let invalidCount = 0;
    const issues: string[] = [];
    for (const lambdaDir of lambdaDirs) {
      const lambdaDirPath = require("path").join(workspacePath, lambdaDir);
      const validation = ConfigManager.validateUnifiedTemplate(lambdaDirPath);
      if (validation.exists && validation.hasMetadata) {
        validCount++;
      } else {
        invalidCount++;
        issues.push(`${lambdaDir}: Missing or invalid Gecko metadata`);
      }
    }
    const message = `🦎 Validation Results:\n✅ Valid: ${validCount}\n❌ Invalid: ${invalidCount}`;
    if (invalidCount > 0) {
      const detail = issues.join("\n");
      vscode.window
        .showWarningMessage(`${message}\n\nIssues:\n${detail}`, "Repair All")
        .then((selection) => {
          if (selection === "Repair All") {
            repairAllTemplates();
          }
        });
    } else {
      vscode.window.showInformationMessage(
        `${message}\n\nAll templates are valid! ✨`
      );
    }
  } catch (error: any) {
    logError(`Validation failed`, error, true);
  }
}

async function repairAllTemplates(): Promise<void> {
  try {
    const workspacePath = getGlobalWorkspacePath();
    const lambdaDirs = ConfigManager.getAllLambdaDirectories(workspacePath);
    let repairedCount = 0;
    for (const lambdaDir of lambdaDirs) {
      const lambdaDirPath = require("path").join(workspacePath, lambdaDir);
      const validation = ConfigManager.validateUnifiedTemplate(lambdaDirPath);
      if (validation.exists && !validation.hasMetadata) {
        try {
          ConfigManager.repairTemplate(lambdaDirPath, "", "", "apigateway");
          repairedCount++;
        } catch (error: any) {
          logError(`Could not repair ${lambdaDir}`, error);
        }
      }
    }
    vscode.window.showInformationMessage(
      `🔧 Repaired ${repairedCount} templates. Please reconfigure any remaining invalid templates.`
    );
    if (lambdaTreeProvider) {
      lambdaTreeProvider.refresh();
    }
  } catch (error: any) {
    logError(`Repair failed`, error, true);
  }
}

async function repairCurrentTemplate(): Promise<void> {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor found");
    return;
  }
  if (!detector.isLambdaFile(activeEditor.document)) {
    vscode.window.showErrorMessage("Current file is not a Lambda function");
    return;
  }
  const config = detector.getConfiguration(activeEditor.document.uri);
  if (!config) {
    vscode.window.showErrorMessage(
      "Lambda not configured. Please configure first."
    );
    return;
  }
  try {
    const lambdaDir = require("path").join(
      config.workspacePath,
      config.functionName
    );
    ConfigManager.repairTemplate(
      lambdaDir,
      config.sourceFile,
      config.sourceDir,
      config.eventType
    );
    vscode.window.showInformationMessage("✅ Template repaired successfully!");
  } catch (error: any) {
    logError(`Repair failed`, error, true);
  }
}

function updateStatusBar() {
  const workspacePath = getGlobalWorkspacePath();
  statusBarItem.text = `🦎 ${path.basename(workspacePath)}`;
  statusBarItem.tooltip = `Lambda Workspace: ${workspacePath}\nClick to configure\n\n🚀 Using Unified System v2.0`;
  statusBarItem.command = "gecko.configureWorkspace";
}

function updateDynamicStatusBar(
  editor: vscode.TextEditor | undefined,
  detector: LambdaDetector
) {
  if (!editor || editor.document.languageId !== "go") {
    updateStatusBar();
    return;
  }

  const isLambdaFile = detector.isLambdaFile(editor.document);
  if (isLambdaFile) {
    const config = detector.getConfiguration(editor.document.uri);
    if (config) {
      statusBarItem.text = `🦎 ${config.functionName} v2.0`;
      statusBarItem.tooltip = `Active Lambda: ${config.functionName}\nEvent Type: ${config.eventType}\nUnified System v2.0\nClick for quick actions`;
      statusBarItem.command = "gecko.statusBar.quickActions";
    } else {
      const fileName = path.basename(editor.document.fileName, ".go");
      statusBarItem.text = `🦎 ${fileName} (not configured)`;
      statusBarItem.tooltip = `Lambda detected: ${fileName}\nNot configured yet\nClick to configure or run auto-setup`;
      statusBarItem.command = "gecko.statusBar.quickActions";
    }
    return;
  }

  updateStatusBar();
}

function updateContexts(
  editor: vscode.TextEditor | undefined,
  detector: LambdaDetector
) {
  if (!editor || editor.document.languageId !== "go") {
    vscode.commands.executeCommand("setContext", "gecko.isLambdaFile", false);
    vscode.commands.executeCommand("setContext", "gecko.isConfigured", false);
    return;
  }

  const isLambdaFile = detector.isLambdaFile(editor.document);
  vscode.commands.executeCommand(
    "setContext",
    "gecko.isLambdaFile",
    isLambdaFile
  );

  if (isLambdaFile) {
    const isConfigured = detector.isConfigured(editor.document.uri);
    vscode.commands.executeCommand(
      "setContext",
      "gecko.isConfigured",
      isConfigured
    );

    log(
      `📝 File: ${path.basename(
        editor.document.fileName
      )} - Lambda: ${isLambdaFile} - Configured: ${isConfigured}`
    );
  } else {
    vscode.commands.executeCommand("setContext", "gecko.isConfigured", false);
  }
}

async function showQuickActions() {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor found");
    return;
  }
  if (!detector.isLambdaFile(activeEditor.document)) {
    vscode.window.showInformationMessage(
      "Current file is not a Lambda function"
    );
    return;
  }
  const config = detector.getConfiguration(activeEditor.document.uri);
  if (!config) {
    const result = await vscode.window.showQuickPick(
      [
        {
          label: "$(gear) Configure Lambda",
          description: "Set up this Lambda function (Unified System v2.0)",
          action: "configure",
        },
      ],
      {
        placeHolder: "Lambda not configured. What would you like to do?",
      }
    );
    if (result?.action === "configure") {
      vscode.commands.executeCommand("gecko.configure");
    }
    return;
  }

  const isApiGateway = config.eventType === "apigateway";
  const actions = [
    {
      label: `$(play) Run Lambda`,
      description: isApiGateway
        ? "Start API Gateway server"
        : "Execute with test event",
      action: "run",
    },
    {
      label: "$(tools) Build Lambda",
      description: "Compile the Lambda function",
      action: "build",
    },
    { kind: vscode.QuickPickItemKind.Separator, label: "Files & Config" },
    {
      label: "$(symbol-object) Edit Event",
      description: "Edit test event JSON",
      action: "editEvent",
      show: !isApiGateway,
    },
    {
      label: "$(file-code) View Template",
      description: "Open unified SAM template.yaml",
      action: "viewTemplate",
    },
    {
      label: "$(folder-library) Open Directory",
      description: "Open Lambda workspace folder",
      action: "openDirectory",
    },
    {
      label: "$(cloud-download) Download from AWS",
      description: "Sync environment variables from AWS",
      action: "download",
    },
    { kind: vscode.QuickPickItemKind.Separator, label: "Utilities" },
    {
      label: "$(check) Validate Template",
      description: "Validate unified template structure",
      action: "validate",
    },
  ].filter((action: any) => action.show !== false);

  const selected = await vscode.window.showQuickPick(actions, {
    placeHolder: `${config.functionName} (${config.eventType}) - Unified System v2.0`,
  });

  if (selected) {
    switch (selected.action) {
      case "run":
        vscode.commands.executeCommand("gecko.run");
        break;
      case "build":
        vscode.commands.executeCommand("gecko.build");
        break;
      case "editEvent":
        vscode.commands.executeCommand("gecko.editEvent");
        break;
      case "viewTemplate":
        vscode.commands.executeCommand("gecko.viewTemplate");
        break;
      case "openDirectory":
        const lambdaDir = path.join(config.workspacePath, config.functionName);
        vscode.commands.executeCommand(
          "vscode.openFolder",
          vscode.Uri.file(lambdaDir)
        );
        break;
      case "download":
        vscode.commands.executeCommand("gecko.download");
        break;
      case "validate":
        vscode.commands.executeCommand("gecko.validateUnified");
        break;
    }
  }
}

export function getGlobalWorkspacePath(): string {
  const config = vscode.workspace.getConfiguration("gecko");
  return (
    config.get<string>("workspacePath") ||
    path.join(require("os").homedir(), "lambda-workspace")
  );
}

export function setGlobalWorkspacePath(workspacePath: string): void {
  const config = vscode.workspace.getConfiguration("gecko");
  config.update(
    "workspacePath",
    workspacePath,
    vscode.ConfigurationTarget.Global
  );
  updateStatusBar();
  if (lambdaTreeProvider) {
    lambdaTreeProvider.updateWorkspacePath(workspacePath);
  }
  setTimeout(() => performUnifiedSystemMigration(), 1000);
}

export function deactivate() {
  log("🦎 Gecko Lambda extension deactivated");
}
