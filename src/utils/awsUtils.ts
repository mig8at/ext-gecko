import { exec } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";

const execAsync = promisify(exec);

export class AWSUtils {
  static async checkAWSCLI(): Promise<boolean> {
    try {
      await execAsync("aws --version");
      console.log("✅ AWS CLI is installed");
      return true;
    } catch (error) {
      vscode.window
        .showErrorMessage(
          "AWS CLI not installed. Please install AWS CLI first.",
          "Download AWS CLI"
        )
        .then((selection) => {
          if (selection === "Download AWS CLI") {
            vscode.env.openExternal(
              vscode.Uri.parse(
                "https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
              )
            );
          }
        });
      return false;
    }
  }

  static async verifyCredentials(): Promise<boolean> {
    try {
      console.log("🔍 Verifying AWS credentials...");
      const { stdout } = await execAsync("aws sts get-caller-identity");
      const identity = JSON.parse(stdout);

      vscode.window.showInformationMessage(
        `✅ Connected to AWS as: ${
          identity.Arn?.split("/").pop() || identity.UserId
        }`
      );
      console.log("✅ AWS credentials verified");
      return true;
    } catch (error) {
      console.error("❌ AWS credentials error:", error);
      vscode.window
        .showErrorMessage(
          "AWS credentials not configured. Please run 'aws configure' first.",
          "Setup Guide"
        )
        .then((selection) => {
          if (selection === "Setup Guide") {
            vscode.env.openExternal(
              vscode.Uri.parse(
                "https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html"
              )
            );
          }
        });
      return false;
    }
  }

  static async getFunctionConfiguration(functionName: string): Promise<any> {
    const { stdout } = await execAsync(
      `aws lambda get-function-configuration --function-name ${functionName}`
    );
    return JSON.parse(stdout);
  }

  static async checkDockerAvailable(): Promise<boolean> {
    try {
      await execAsync("docker ps", { timeout: 3000 });
      return true;
    } catch (error) {
      return false;
    }
  }
}
