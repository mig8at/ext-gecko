import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { getGlobalWorkspacePath, setGlobalWorkspacePath } from "../extension";

export class WorkspaceConfigCommand {
  constructor(private context: vscode.ExtensionContext) {}

  async execute(): Promise<void> {
    try {
      const currentPath = getGlobalWorkspacePath();

      const result = await vscode.window.showInputBox({
        prompt: "Configure global Lambda workspace path",
        value: currentPath,
        placeHolder: "e.g., /home/user/lambda-workspace",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Workspace path cannot be empty";
          }
          return null;
        },
      });

      if (!result) {
        return; // User cancelled
      }

      const newPath = result.trim();

      // Create directory if it doesn't exist
      if (!fs.existsSync(newPath)) {
        const create = await vscode.window.showInformationMessage(
          `Directory doesn't exist: ${newPath}. Create it?`,
          "Create",
          "Cancel"
        );

        if (create === "Create") {
          try {
            fs.mkdirSync(newPath, { recursive: true });
            console.log(`📁 Created workspace directory: ${newPath}`);
          } catch (error) {
            vscode.window.showErrorMessage(
              `Failed to create directory: ${error}`
            );
            return;
          }
        } else {
          return;
        }
      }

      // Save the new path
      setGlobalWorkspacePath(newPath);

      vscode.window
        .showInformationMessage(
          `🦎 Lambda workspace configured: ${newPath}`,
          "Open Folder"
        )
        .then((selection) => {
          if (selection === "Open Folder") {
            vscode.commands.executeCommand(
              "vscode.openFolder",
              vscode.Uri.file(newPath)
            );
          }
        });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to configure workspace: ${error}`);
    }
  }
}
