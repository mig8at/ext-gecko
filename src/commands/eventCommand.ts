import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LambdaDetector } from "../detector";
import { ConfigManager, EventTemplates } from "../utils";
import { log, logError } from "../logger";

export class EventCommand {
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
    await this.openEventFile(config);
  }

  private async openEventFile(config: any): Promise<void> {
    const lambdaDir = path.join(config.workspacePath, config.functionName);
    const eventFilePath = path.join(lambdaDir, "event.json");

    try {
      ConfigManager.cleanupConfigJson(lambdaDir);
      let localConfig: any;
      try {
        localConfig = ConfigManager.readLocalConfig(lambdaDir);
      } catch (error) {
        logError(`Could not load from template.yaml, using fallback`, error);
        localConfig = {
          functionName: config.functionName,
          eventType: config.eventType,
          // ... otros fallbacks si son necesarios
        };
      }

      // CORREGIDO: Usar ConfigManager en lugar de FileUtils
      if (!fs.existsSync(eventFilePath)) {
        ConfigManager.createEventFile(eventFilePath, localConfig.eventType);
        log(`Created new event file for ${localConfig.functionName}`);
      }
      
      const eventDocument = await vscode.workspace.openTextDocument(eventFilePath);
      const editor = await vscode.window.showTextDocument(eventDocument, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: false,
      });

      await vscode.languages.setTextDocumentLanguage(eventDocument, "json");

      vscode.window
        .showInformationMessage(
          `📝 Editing test event for ${localConfig.functionName} (${localConfig.eventType})`,
          "Add Sample Data",
          "Reset to Template",
          "Show Config"
        )
        .then(async (selection) => {
          switch (selection) {
            case "Add Sample Data":
              await this.addSampleData(editor, localConfig.eventType);
              break;
            case "Reset to Template":
              await this.resetToTemplate(eventFilePath, localConfig.eventType);
              break;
            case "Show Config":
              await this.showConfig(localConfig, lambdaDir);
              break;
          }
        });
    } catch (error) {
      logError("Failed to open event file", error, true);
    }
  }

  private async addSampleData(
    editor: vscode.TextEditor,
    eventType: string
  ): Promise<void> {
    const sampleData = EventTemplates.getSampleData(eventType);
    if (!sampleData) {
      vscode.window.showInformationMessage(
        "No additional sample data available for this event type"
      );
      return;
    }
    try {
      const currentContent = editor.document.getText();
      const currentEvent = JSON.parse(currentContent);
      const mergedEvent = this.mergeDeep(currentEvent, sampleData);
      
      const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(currentContent.length)
      );
      await editor.edit((editBuilder) => {
        editBuilder.replace(fullRange, JSON.stringify(mergedEvent, null, 2));
      });
      vscode.window.showInformationMessage("✨ Sample data added to event");
    } catch (error) {
      logError("Failed to add sample data", error, true);
    }
  }

  private async resetToTemplate(
    eventFilePath: string,
    eventType: string
  ): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
      "This will reset the event file to the default template. Continue?",
      "Yes",
      "No"
    );
    if (confirmation === "Yes") {
      // CORREGIDO: Usar ConfigManager en lugar de FileUtils
      ConfigManager.createEventFile(eventFilePath, eventType);
      vscode.window.showInformationMessage("🔄 Event file reset to template");
      
      // La lógica de refrescar el editor puede permanecer igual
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document.fileName === eventFilePath) {
        const refreshedContent = fs.readFileSync(eventFilePath, "utf8");
        const fullRange = new vscode.Range(
          activeEditor.document.positionAt(0),
          activeEditor.document.positionAt(activeEditor.document.getText().length)
        );
        await activeEditor.edit((editBuilder) => {
          editBuilder.replace(fullRange, refreshedContent);
        });
      }
    }
  }

  private async showConfig(localConfig: any, lambdaDir: string): Promise<void> {
    const configInfo = `🦎 **Lambda Configuration**
**Function Name:** ${localConfig.functionName}
**Event Type:** ${localConfig.eventType}
**Runtime:** ${localConfig.runtime}
**Architecture:** ${localConfig.architecture}
**Source File:** ${localConfig.sourceMainFile}
**Source Directory:** ${localConfig.sourceDir}
**Lambda Directory:** ${lambdaDir}
**Last Modified:** ${localConfig.lastModified}

## Configuration Source
**template.yaml** - The only source of truth ✅
All configuration is read directly from template.yaml`;
    const configDocument = await vscode.workspace.openTextDocument({
      content: configInfo,
      language: "markdown",
    });
    await vscode.window.showTextDocument(configDocument, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: true,
    });
  }

  private mergeDeep(target: any, source: any): any {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === "object" && !Array.isArray(item);
  }
}
