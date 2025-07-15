import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { LocalLambdaConfig } from "./types";
import { TemplateManager } from "./templateManager";
import { EventTemplates } from "./eventTemplates";
import { log, logError } from "../logger";

export class ConfigManager {
  /**
   * Reads configuration directly from template.yaml (the only source of truth)
   */
  static readLocalConfig(lambdaDir: string): LocalLambdaConfig {
    const templatePath = path.join(lambdaDir, "template.yaml");
    if (!fs.existsSync(templatePath)) {
      throw new Error(
        `Template file not found: ${templatePath}. Please reconfigure the lambda.`
      );
    }
    try {
      // Extract source info from template metadata (unified system)
      const sourceInfo = this.extractSourceInfoFromTemplate(lambdaDir);
      // Extract configuration directly from template.yaml
      const config = TemplateManager.extractConfigFromTemplate(
        lambdaDir,
        sourceInfo
      );
      log(
        `📄 Configuration loaded from unified template.yaml: ${templatePath}`
      );
      return config;
    } catch (error) {
      throw new Error(
        `Failed to read configuration from template.yaml: ${error}`
      );
    }
  }

  // AÑADIDO: La función que faltaba
  /**
   * Creates an event.json file from a template.
   * @param eventFilePath The full path where the event file will be created.
   * @param eventType The type of event to generate a template for.
   */
  static createEventFile(eventFilePath: string, eventType: string): void {
    const eventTemplate = EventTemplates.getTemplate(eventType);
    fs.writeFileSync(eventFilePath, JSON.stringify(eventTemplate, null, 2));
    log(`📝 Created event file at: ${eventFilePath}`);
  }

  /**
   * Extracts source info directly from template.yaml metadata (unified system)
   */
  private static extractSourceInfoFromTemplate(lambdaDir: string): any {
    try {
      const templatePath = path.join(lambdaDir, "template.yaml");
      const template = TemplateManager.readTemplate(lambdaDir);
      const functionName = path.basename(lambdaDir);
      const geckoMetadata = template.Metadata?.GeckoLambda;
      if (geckoMetadata) {
        return {
          functionName: functionName,
          sourceMainFile: geckoMetadata.sourceFile || "",
          sourceDir: geckoMetadata.sourceDir || "",
          eventType: geckoMetadata.eventType || "apigateway",
          workspacePath: path.dirname(lambdaDir),
        };
      } else {
        log(
          `No Gecko metadata found in template, using fallback inference`
        );
        return this.inferSourceInfoFromTemplate(lambdaDir, template);
      }
    } catch (error) {
      throw new Error(`Could not extract source info from template: ${error}`);
    }
  }

  private static inferSourceInfoFromTemplate(
    lambdaDir: string,
    template: any
  ): any {
    const functionName = path.basename(lambdaDir);
    const workspacePath = path.dirname(lambdaDir);
    const eventType = this.detectEventTypeFromTemplate(template);
    return {
      functionName: functionName,
      sourceMainFile: "",
      sourceDir: "",
      eventType: eventType,
      workspacePath: workspacePath,
    };
  }

  private static detectEventTypeFromTemplate(template: any): string {
    try {
      const resources = template.Resources || {};
      const functionResource = Object.values(resources).find(
        (resource: any) => resource.Type === "AWS::Serverless::Function"
      ) as any;
      if (functionResource && functionResource.Properties?.Events) {
        const events = functionResource.Properties.Events;
        const eventKeys = Object.keys(events);
        if (eventKeys.length > 0) {
          const firstEvent = events[eventKeys[0]];
          const eventType = firstEvent.Type;
          switch (eventType) {
            case "Api":
              return "apigateway";
            case "S3":
              return "s3";
            case "DynamoDB":
              return "dynamodb";
            case "SQS":
              return "sqs";
            default:
              return "apigateway";
          }
        }
      }
    } catch (error) {
      logError("Could not detect event type from template", error);
    }
    return "apigateway";
  }

  static updateEnvironmentVariables(
    lambdaDir: string,
    environment: { [key: string]: string },
    awsFunctionName?: string
  ): LocalLambdaConfig {
    try {
      TemplateManager.updateEnvironmentVariables(
        lambdaDir,
        environment,
        awsFunctionName
      );
      const updatedConfig = this.readLocalConfig(lambdaDir);
      log(`✅ Environment variables updated in unified template.yaml`);
      return updatedConfig;
    } catch (error) {
      throw new Error(`Failed to update environment variables: ${error}`);
    }
  }

  static updateGeckoMetadata(
    lambdaDir: string,
    sourceFile: string,
    sourceDir: string,
    eventType: string
  ): void {
    try {
      const templatePath = path.join(lambdaDir, "template.yaml");
      const template = TemplateManager.readTemplate(lambdaDir);
      if (!template.Metadata) {
        template.Metadata = {};
      }
      template.Metadata.GeckoLambda = {
        sourceFile: sourceFile,
        sourceDir: sourceDir,
        eventType: eventType,
        lastModified: new Date().toISOString(),
        version: "2.0",
      };
      const updatedContent = require("js-yaml").dump(template, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
      });
      fs.writeFileSync(templatePath, updatedContent);
      log(
        `✅ Gecko metadata updated in template.yaml: ${templatePath}`
      );
    } catch (error) {
      throw new Error(`Failed to update Gecko metadata: ${error}`);
    }
  }

  static validateUnifiedTemplate(lambdaDir: string): {
    exists: boolean;
    hasMetadata: boolean;
    metadata?: any;
  } {
    const templatePath = path.join(lambdaDir, "template.yaml");
    if (!fs.existsSync(templatePath)) {
      return { exists: false, hasMetadata: false };
    }
    try {
      const template = TemplateManager.readTemplate(lambdaDir);
      const geckoMetadata = template.Metadata?.GeckoLambda;
      return {
        exists: true,
        hasMetadata: !!geckoMetadata,
        metadata: geckoMetadata,
      };
    } catch (error) {
      logError(`Could not validate template`, error);
      return { exists: true, hasMetadata: false };
    }
  }

  static repairTemplate(
    lambdaDir: string,
    sourceFile: string,
    sourceDir: string,
    eventType: string
  ): void {
    try {
      const validation = this.validateUnifiedTemplate(lambdaDir);
      if (validation.exists && !validation.hasMetadata) {
        log(
          `🔧 Repairing template by adding Gecko metadata: ${lambdaDir}`
        );
        this.updateGeckoMetadata(lambdaDir, sourceFile, sourceDir, eventType);
      } else if (!validation.exists) {
        throw new Error(
          `Template file does not exist: ${lambdaDir}/template.yaml`
        );
      } else {
        log(
          `✅ Template already has proper Gecko metadata: ${lambdaDir}`
        );
      }
    } catch (error) {
      throw new Error(`Failed to repair template: ${error}`);
    }
  }

  static cleanupConfigJson(lambdaDir: string): void {
    const configPath = path.join(lambdaDir, "config.json");
    if (fs.existsSync(configPath)) {
      try {
        fs.unlinkSync(configPath);
        log(`🗑️ Removed obsolete config.json: ${configPath}`);
      } catch (error) {
        logError(`Could not remove config.json`, error);
      }
    }
  }
  
  static cleanupGlobalConfig(workspacePath: string): void {
    const globalConfigPath = path.join(
      workspacePath,
      ".gecko-lambda-config.json"
    );
    if (fs.existsSync(globalConfigPath)) {
      try {
        const backupPath = path.join(
          workspacePath,
          ".gecko-lambda-config.json.backup"
        );
        fs.renameSync(globalConfigPath, backupPath);
        log(`📦 Moved old global config to backup: ${backupPath}`);
        vscode.window.showInformationMessage(
          `🦎 Migrated to unified system! Old config backed up.`
        );
      } catch (error) {
        logError(`Could not backup global config`, error);
      }
    }
  }
  
  static getAllLambdaDirectories(workspacePath: string): string[] {
    try {
      if (!fs.existsSync(workspacePath)) {
        return [];
      }
      return fs
        .readdirSync(workspacePath, { withFileTypes: true })
        .filter((dirent) => {
          if (!dirent.isDirectory()) return false;
          const templatePath = path.join(
            workspacePath,
            dirent.name,
            "template.yaml"
          );
          return fs.existsSync(templatePath);
        })
        .map((dirent) => dirent.name);
    } catch (error) {
      logError("Error getting lambda directories", error);
      return [];
    }
  }
}
