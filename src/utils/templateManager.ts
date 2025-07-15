import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { LocalLambdaConfig } from "./types";
import { StringUtils } from "./stringUtils";

export class TemplateManager {
  /**
   * Creates a new template.yaml with Gecko metadata as the unified source of truth
   */
  static createTemplate(
    lambdaDir: string,
    config: Partial<LocalLambdaConfig>
  ): string {
    const functionName = StringUtils.toPascalCase(config.functionName!);
    const timeout = config.template?.timeout || 30;
    const memorySize = config.template?.memorySize || 128;
    const description =
      config.template?.description ||
      `Lambda function for ${config.eventType} events`;

    const environmentSection = this.generateEnvironmentSection(
      config.environment
    );

    const eventConfiguration = this.getEventConfiguration(
      config.eventType!,
      functionName
    );

    // Build template as object first, then convert to YAML
    const templateObject = {
      AWSTemplateFormatVersion: "2010-09-09",
      Transform: "AWS::Serverless-2016-10-31",
      Description: `${config.functionName}\n\n${description}`,

      // UNIFIED METADATA - Single source of truth for all Gecko configuration
      Metadata: {
        GeckoLambda: {
          sourceFile: config.sourceMainFile || "",
          sourceDir: config.sourceDir || "",
          eventType: config.eventType || "apigateway",
          lastModified: new Date().toISOString(),
          version: "2.0", // Unified system version
          // Additional metadata for future extensibility
          buildMethod: config.buildMethod || "direct",
          architecture: config.architecture || "arm64",
          runtime: config.runtime || "provided.al2023",
        },
      },

      Globals: {
        Function: {
          Timeout: timeout,
          MemorySize: memorySize,
          Runtime: config.runtime || "provided.al2023",
        },
      },

      Resources: {
        [`${functionName}Function`]: {
          Type: "AWS::Serverless::Function",
          Properties: {
            CodeUri: "build/",
            Handler: "bootstrap",
            Runtime: config.runtime || "provided.al2023",
            Architectures: [config.architecture || "arm64"],
            ...environmentSection,
            Events: eventConfiguration,
          },
        },
      },

      Outputs: {
        [`${functionName}Function`]: {
          Description: "Lambda Function ARN",
          Value: { "Fn::GetAtt": [`${functionName}Function`, "Arn"] },
        },
        [`${functionName}FunctionIamRole`]: {
          Description: "Implicit IAM Role created for function",
          Value: { "Fn::GetAtt": [`${functionName}FunctionRole`, "Arn"] },
        },
      },
    };

    // Convert to YAML string
    const templateContent = yaml.dump(templateObject, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    });

    const templatePath = path.join(lambdaDir, "template.yaml");
    fs.writeFileSync(templatePath, templateContent);
    console.log(`📄 Unified template created: ${templatePath}`);
    return templateContent;
  }

  /**
   * Reads and parses template.yaml
   */
  static readTemplate(lambdaDir: string): any {
    const templatePath = path.join(lambdaDir, "template.yaml");
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    try {
      const templateContent = fs.readFileSync(templatePath, "utf8");
      return yaml.load(templateContent);
    } catch (error) {
      throw new Error(`Failed to parse template.yaml: ${error}`);
    }
  }

  /**
   * Updates environment variables in template.yaml directly
   */
  static updateEnvironmentVariables(
    lambdaDir: string,
    environment: { [key: string]: string },
    awsFunctionName?: string
  ): void {
    const templatePath = path.join(lambdaDir, "template.yaml");
    const template = this.readTemplate(lambdaDir);

    // Find the function resource
    const resources = template.Resources || {};
    const functionResource = Object.values(resources).find(
      (resource: any) => resource.Type === "AWS::Serverless::Function"
    ) as any;

    if (!functionResource) {
      throw new Error("Lambda function resource not found in template.yaml");
    }

    // Update environment variables
    if (!functionResource.Properties) {
      functionResource.Properties = {};
    }
    if (!functionResource.Properties.Environment) {
      functionResource.Properties.Environment = {};
    }
    functionResource.Properties.Environment.Variables = environment;

    // Update environment metadata in Gecko section
    if (!template.Metadata) {
      template.Metadata = {};
    }
    if (!template.Metadata.GeckoLambda) {
      template.Metadata.GeckoLambda = {};
    }

    template.Metadata.GeckoLambda.environmentInfo = {
      lastUpdated: new Date().toISOString(),
      source: "aws",
      awsFunctionName: awsFunctionName || "manual",
      variableCount: Object.keys(environment).length,
    };

    // Update general last modified
    template.Metadata.GeckoLambda.lastModified = new Date().toISOString();

    // Write back to template.yaml
    const updatedContent = yaml.dump(template, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    });

    fs.writeFileSync(templatePath, updatedContent);
    console.log(`✅ Environment variables updated in unified template.yaml`);
  }

  /**
   * Updates Gecko Lambda metadata in template.yaml
   */
  static updateGeckoMetadata(
    lambdaDir: string,
    sourceFile: string,
    sourceDir: string,
    eventType: string
  ): void {
    const templatePath = path.join(lambdaDir, "template.yaml");
    const template = this.readTemplate(lambdaDir);

    // Ensure Metadata section exists
    if (!template.Metadata) {
      template.Metadata = {};
    }

    // Update or create Gecko Lambda metadata
    const existingMetadata = template.Metadata.GeckoLambda || {};

    template.Metadata.GeckoLambda = {
      ...existingMetadata,
      sourceFile: sourceFile,
      sourceDir: sourceDir,
      eventType: eventType,
      lastModified: new Date().toISOString(),
      version: "2.0",
    };

    // Write back to template.yaml
    const updatedContent = yaml.dump(template, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    });

    fs.writeFileSync(templatePath, updatedContent);
    console.log(`✅ Gecko metadata updated in unified template.yaml`);
  }

  /**
   * Extracts configuration from template.yaml using unified metadata
   */
  static extractConfigFromTemplate(
    lambdaDir: string,
    fallbackSourceInfo?: any
  ): LocalLambdaConfig {
    const template = this.readTemplate(lambdaDir);

    // Get Gecko metadata (primary source)
    const geckoMetadata = template.Metadata?.GeckoLambda;

    // Find the function resource
    const resources = template.Resources || {};
    const functionResourceKey = Object.keys(resources).find(
      (key) => resources[key].Type === "AWS::Serverless::Function"
    );

    if (!functionResourceKey) {
      throw new Error("Lambda function resource not found in template.yaml");
    }

    const functionResource = resources[functionResourceKey];
    const properties = functionResource.Properties || {};
    const globals = template.Globals?.Function || {};

    // Extract function name from resource key or metadata
    const functionName =
      geckoMetadata?.functionName ||
      functionResourceKey.replace(/Function$/, "").toLowerCase() ||
      path.basename(lambdaDir);

    // Extract environment variables
    const envVars = properties.Environment?.Variables || {};

    // Extract event type from metadata or Events configuration
    const eventType =
      geckoMetadata?.eventType ||
      this.detectEventTypeFromEvents(properties.Events || {});

    // Get source info from metadata or fallback
    const sourceInfo = {
      sourceMainFile:
        geckoMetadata?.sourceFile || fallbackSourceInfo?.sourceMainFile || "",
      sourceDir:
        geckoMetadata?.sourceDir || fallbackSourceInfo?.sourceDir || "",
    };

    // Get environment metadata
    const envMetadata = geckoMetadata?.environmentInfo || {
      lastUpdated: "",
      source: "manual",
    };

    const config: LocalLambdaConfig = {
      functionName: functionName,
      sourceMainFile: sourceInfo.sourceMainFile,
      sourceDir: sourceInfo.sourceDir,
      eventType: eventType,
      workspacePath: path.dirname(lambdaDir),
      lastModified: geckoMetadata?.lastModified || new Date().toISOString(),
      runtime:
        geckoMetadata?.runtime ||
        properties.Runtime ||
        globals.Runtime ||
        "provided.al2023",
      architecture:
        geckoMetadata?.architecture || properties.Architectures?.[0] || "arm64",
      buildMethod: geckoMetadata?.buildMethod || "direct",
      environment: {
        variables: envVars,
        lastUpdated: envMetadata.lastUpdated,
        source: envMetadata.source,
        awsFunctionName: envMetadata.awsFunctionName,
      },
      template: {
        timeout: properties.Timeout || globals.Timeout || 30,
        memorySize: properties.MemorySize || globals.MemorySize || 128,
        description:
          template.Description || `Lambda function for ${eventType} events`,
      },
    };

    return config;
  }

  /**
   * Detects event type from Events configuration in template
   */
  private static detectEventTypeFromEvents(events: any): string {
    const eventKeys = Object.keys(events);
    if (eventKeys.length === 0) return "apigateway";

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

  /**
   * Validates that template.yaml has proper Gecko metadata
   */
  static validateGeckoMetadata(lambdaDir: string): {
    hasMetadata: boolean;
    isValid: boolean;
    metadata?: any;
    issues: string[];
  } {
    const issues: string[] = [];

    try {
      const template = this.readTemplate(lambdaDir);
      const geckoMetadata = template.Metadata?.GeckoLambda;

      if (!geckoMetadata) {
        return {
          hasMetadata: false,
          isValid: false,
          issues: ["No Gecko Lambda metadata found in template.yaml"],
        };
      }

      // Validate required fields
      if (!geckoMetadata.sourceFile) {
        issues.push("Missing sourceFile in metadata");
      }
      if (!geckoMetadata.sourceDir) {
        issues.push("Missing sourceDir in metadata");
      }
      if (!geckoMetadata.eventType) {
        issues.push("Missing eventType in metadata");
      }
      if (!geckoMetadata.version) {
        issues.push("Missing version in metadata");
      }

      return {
        hasMetadata: true,
        isValid: issues.length === 0,
        metadata: geckoMetadata,
        issues: issues,
      };
    } catch (error) {
      return {
        hasMetadata: false,
        isValid: false,
        issues: [`Failed to read template: ${error}`],
      };
    }
  }

  /**
   * Migrates old template to unified system with metadata
   */
  static migrateToUnifiedSystem(
    lambdaDir: string,
    sourceFile: string,
    sourceDir: string,
    eventType: string
  ): void {
    try {
      const validation = this.validateGeckoMetadata(lambdaDir);

      if (!validation.hasMetadata || !validation.isValid) {
        console.log(`🔄 Migrating template to unified system: ${lambdaDir}`);
        this.updateGeckoMetadata(lambdaDir, sourceFile, sourceDir, eventType);
        console.log(`✅ Template migrated to unified system: ${lambdaDir}`);
      } else {
        console.log(`✅ Template already uses unified system: ${lambdaDir}`);
      }
    } catch (error) {
      throw new Error(`Failed to migrate template: ${error}`);
    }
  }

  private static generateEnvironmentSection(environmentConfig?: any): any {
    if (
      !environmentConfig?.variables ||
      Object.keys(environmentConfig.variables).length === 0
    ) {
      return {};
    }

    return {
      Environment: {
        Variables: environmentConfig.variables,
      },
    };
  }

  private static getEventConfiguration(
    eventType: string,
    functionName: string
  ): any {
    const configurations: any = {
      apigateway: {
        ApiEvent: {
          Type: "Api",
          Properties: {
            Path: "/hello",
            Method: "get",
          },
        },
      },
      s3: {
        S3Event: {
          Type: "S3",
          Properties: {
            Bucket: { Ref: "S3Bucket" },
            Events: "s3:ObjectCreated:*",
            Filter: {
              S3Key: {
                Rules: [
                  {
                    Name: "prefix",
                    Value: "uploads/",
                  },
                ],
              },
            },
          },
        },
      },
      dynamodb: {
        DynamoDBEvent: {
          Type: "DynamoDB",
          Properties: {
            Stream: { "Fn::GetAtt": ["DynamoDBTable", "StreamArn"] },
            StartingPosition: "TRIM_HORIZON",
            BatchSize: 10,
          },
        },
      },
      sqs: {
        SQSEvent: {
          Type: "SQS",
          Properties: {
            Queue: { "Fn::GetAtt": ["SQSQueue", "Arn"] },
            BatchSize: 10,
          },
        },
      },
      default: {
        DefaultEvent: {
          Type: "Schedule",
          Properties: {
            Schedule: "rate(10 minutes)",
          },
        },
      },
    };

    return configurations[eventType] || configurations.default;
  }
}
