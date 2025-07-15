import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";
import { LocalLambdaConfig } from "./types";
import { log, logError } from "../logger";

const execAsync = promisify(exec);

export class BuildUtils {
  static async buildWithGo(
    lambdaDir: string,
    localConfig: LocalLambdaConfig
  ): Promise<void> {
    const buildDir = path.join(lambdaDir, "build");
    const bootstrapPath = path.join(buildDir, "bootstrap");

    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }
    
    // MEJORA: La arquitectura ahora es configurable desde localConfig
    const architecture = localConfig.architecture || "arm64";
    const buildCmd = `GOOS=linux GOARCH=${architecture} CGO_ENABLED=0 go build -ldflags="-s -w" -o "${bootstrapPath}" .`;
    
    log(`🔨 Build command: ${buildCmd}`);
    log(`📁 Working directory: ${localConfig.sourceDir}`);
    log(`📦 Output: ${bootstrapPath}`);

    try {
      const { stdout, stderr } = await execAsync(buildCmd, {
        cwd: localConfig.sourceDir,
        env: {
          ...process.env,
          GOOS: "linux",
          GOARCH: architecture,
          CGO_ENABLED: "0",
        },
      });

      if (stderr) {
        log(`Go build warnings: ${stderr}`);
      }
      log(`Go build output: ${stdout}`);
      
      if (!fs.existsSync(bootstrapPath)) {
        throw new Error(`Bootstrap binary was not created at ${bootstrapPath}`);
      }

      await execAsync(`chmod +x "${bootstrapPath}"`);
      await this.createZipPackage(buildDir, "bootstrap");
      log(`✅ Bootstrap binary created: ${bootstrapPath}`);
    } catch (error) {
      throw new Error(`Go build failed: ${error}`);
    }
  }

  static async createZipPackage(
    buildDir: string,
    binaryName: string
  ): Promise<void> {
    const zipPath = path.join(buildDir, `lambda-function.zip`);
    const binaryPath = path.join(buildDir, binaryName);
    try {
      await execAsync(`zip -j "${zipPath}" "${binaryPath}"`, { cwd: buildDir });
      log(`📦 ZIP package created: ${zipPath}`);
    } catch {
      vscode.window
        .showWarningMessage(
          "Could not create ZIP package. Please ensure 'zip' command is available in PATH.",
          "Install Info"
        )
        .then((selection) => {
          if (selection === "Install Info") {
            vscode.env.openExternal(
              vscode.Uri.parse("https://formulae.brew.sh/formula/zip")
            );
          }
        });
    }
  }

  static needsRebuild(
    localConfig: LocalLambdaConfig,
    lambdaDir: string
  ): boolean {
    try {
      if (!localConfig.sourceMainFile || !fs.existsSync(localConfig.sourceMainFile)) {
        log(`Source file not found: ${localConfig.sourceMainFile}, rebuild needed.`);
        return true;
      }
      const sourceStats = fs.statSync(localConfig.sourceMainFile);
      const buildDir = path.join(lambdaDir, "build");
      if (!fs.existsSync(buildDir)) { return true; }

      const binaryPath = path.join(buildDir, "bootstrap");
      if (!fs.existsSync(binaryPath)) { return true; }
      
      const binaryStats = fs.statSync(binaryPath);
      
      const templatePath = path.join(lambdaDir, "template.yaml");
      if (fs.existsSync(templatePath)) {
        const templateStats = fs.statSync(templatePath);
        if (templateStats.mtime > binaryStats.mtime) {
          log(`Template.yaml is newer than binary, rebuild needed.`);
          return true;
        }
      }

      const needsRebuild = sourceStats.mtime > binaryStats.mtime;
      if (needsRebuild) {
        log(`Source file is newer than binary, rebuild needed.`);
      } else {
        log(`Binary is up to date.`);
      }
      return needsRebuild;
    } catch (error) {
      logError(`Error checking build status`, error);
      return true;
    }
  }
}
