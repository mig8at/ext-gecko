import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { LambdaDetector, LambdaConfig } from "../detector";
import { ConfigManager, BuildUtils, StringUtils, AWSUtils, LocalLambdaConfig, TemplateManager } from "../utils";
import { log, logError } from "../logger";

const execAsync = promisify(exec);

export class RunCommand {
    private detector: LambdaDetector;
    private apiServerTerminal: vscode.Terminal | undefined;

    constructor(private context: vscode.ExtensionContext) {
        this.detector = new LambdaDetector();
    }

    async execute(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage("No active editor found");
            return;
        }

        if (!this.detector.isLambdaFile(activeEditor.document)) {
            vscode.window.showErrorMessage("Current file is not a valid Lambda main.go file");
            return;
        }

        try {
            let config = this.detector.getConfiguration(activeEditor.document.uri);

            // Si no está configurada, guiar al usuario
            if (!config) {
                config = await this.handleUnconfiguredLambda(activeEditor);
                if (!config) {
                    return; // El usuario canceló o falló la configuración
                }
            }

            const lambdaDir = path.join(config.workspacePath, config.functionName);
            const localConfig = ConfigManager.readLocalConfig(lambdaDir);

            // Flujo corregido: Compilar SI ES NECESARIO, luego ejecutar.
            const needsBuild = BuildUtils.needsRebuild(localConfig, lambdaDir);
            if (needsBuild) {
                await this.buildLambda(localConfig, lambdaDir);
            } else {
                vscode.window.showInformationMessage(`✅ ${localConfig.functionName} is already built!`);
            }

            // Verificar Docker antes de intentar ejecutar
            if (!(await AWSUtils.checkDockerAvailable())) {
                const result = await vscode.window.showErrorMessage(
                    "🐳 Docker is required for SAM local testing. Please start Docker Desktop and try again.",
                    "Open Docker",
                    "Retry"
                );
                if (result === "Open Docker") {
                    vscode.env.openExternal(vscode.Uri.parse("https://docs.docker.com/get-docker/"));
                } else if (result === "Retry") {
                    await this.execute(); // Reintentar todo el flujo
                }
                return;
            }

            // Ejecutar la lambda según su tipo de evento
            if (localConfig.eventType === "apigateway") {
                await this.runApiGatewayLambda(localConfig, lambdaDir);
            } else {
                await this.runRegularLambda(localConfig, lambdaDir);
            }
        } catch (error) {
            logError("Failed to run lambda", error, true);
        }
    }

    private async handleUnconfiguredLambda(editor: vscode.TextEditor): Promise<LambdaConfig | null> {
        const selection = await vscode.window.showInformationMessage(
            "This Lambda is not configured. We can auto-configure it for you.",
            { modal: true },
            "Auto-Configure",
            "Manual Configuration"
        );

        if (selection === "Auto-Configure") {
            log("🦎 Lambda not configured, starting auto-configuration...");
            return this.autoConfigureLambda(editor);
        } else if (selection === "Manual Configuration") {
            await vscode.commands.executeCommand("gecko.configure");
            return null; // El usuario debe re-ejecutar 'run'
        }
        return null; // El usuario canceló
    }

    private async autoConfigureLambda(editor: vscode.TextEditor): Promise<LambdaConfig | null> {
        const eventType = this.detector.detectEventType(editor.document.getText()) || (await this.promptForEventType());
        if (!eventType) return null;

        const config = this.detector.createAutoConfiguration(editor.document.uri, eventType);
        log(`🤖 Auto-configuring lambda: ${config.functionName}`);
        
        await this.createLambdaStructure(config);
        
        vscode.window.showInformationMessage(`🦎 Lambda "${config.functionName}" auto-configured successfully!`);
        return config;
    }
    
    private async createLambdaStructure(config: LambdaConfig): Promise<void> {
        this.detector.saveConfiguration(config);
        const lambdaDir = path.join(config.workspacePath, config.functionName);
        if (!fs.existsSync(lambdaDir)) fs.mkdirSync(lambdaDir, { recursive: true });

        const localConfig: Partial<LocalLambdaConfig> = {
            functionName: config.functionName,
            sourceMainFile: config.sourceFile,
            sourceDir: config.sourceDir,
            eventType: config.eventType,
            architecture: "arm64", // Default para auto-config
        };
        TemplateManager.createTemplate(lambdaDir, localConfig);

        if (config.eventType !== "apigateway") {
            ConfigManager.createEventFile(path.join(lambdaDir, "event.json"), config.eventType);
        }
        if (!fs.existsSync(path.join(lambdaDir, "build"))) fs.mkdirSync(path.join(lambdaDir, "build"));
        log(`✅ Auto-configuration complete for ${config.functionName}`);
    }

    private async promptForEventType(): Promise<string | undefined> {
        const eventTypes = [
            { label: "🌐 API Gateway (REST)", value: "apigateway" },
            { label: "🪣 S3 Events", value: "s3" },
            { label: "📊 DynamoDB Streams", value: "dynamodb" },
            { label: "📬 SQS Messages", value: "sqs" },
        ];
        const selectedType = await vscode.window.showQuickPick(eventTypes, { placeHolder: "Select the event type for this Lambda" });
        return selectedType?.value;
    }

    private async buildLambda(localConfig: LocalLambdaConfig, lambdaDir: string): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `🦎 Building ${localConfig.functionName}`,
            cancellable: false,
        }, async (progress) => {
            progress.report({ increment: 0, message: "Preparing build..." });
            await BuildUtils.buildWithGo(lambdaDir, localConfig);
            progress.report({ increment: 100, message: "Build complete!" });
        });
        vscode.window.showInformationMessage(`🚀 ${localConfig.functionName} built successfully!`);
    }

    private async runApiGatewayLambda(localConfig: LocalLambdaConfig, lambdaDir: string): Promise<void> {
        log(`🌐 Starting API Gateway for ${localConfig.functionName}`);
        if (this.apiServerTerminal) {
            this.apiServerTerminal.dispose();
        }
        const command = `sam local start-api --host localhost --port 3000`;
        this.apiServerTerminal = vscode.window.createTerminal({
            name: `🦎 API - ${localConfig.functionName}`,
            cwd: lambdaDir,
        });
        this.apiServerTerminal.show(true);
        this.apiServerTerminal.sendText(command);
        vscode.window
            .showInformationMessage(
                `🌐 API Gateway for ${localConfig.functionName} is starting... Access at: http://localhost:3000`,
                "Open in Browser",
                "Stop Server"
            )
            .then((selection) => {
                if (selection === "Open in Browser") {
                    vscode.env.openExternal(vscode.Uri.parse("http://localhost:3000"));
                } else if (selection === "Stop Server") {
                    this.stopApiServer();
                }
            });
    }

    private async runRegularLambda(localConfig: LocalLambdaConfig, lambdaDir: string): Promise<void> {
        const eventFilePath = path.join(lambdaDir, "event.json");
        if (!fs.existsSync(eventFilePath)) {
            const createEvent = await vscode.window.showInformationMessage(
                "Test event file (event.json) not found. Create it now?", "Yes", "No"
            );
            if (createEvent === "Yes") {
                await vscode.commands.executeCommand("gecko.editEvent");
            }
            return;
        }
        await this.runWithSAMInvoke(localConfig, lambdaDir, eventFilePath);
    }
    
    private async runWithSAMInvoke(localConfig: LocalLambdaConfig, lambdaDir: string, eventFilePath: string): Promise<void> {
        const functionName = StringUtils.toPascalCase(localConfig.functionName) + "Function";
        const command = `sam local invoke "${functionName}" --event "${eventFilePath}"`;
        const responseFilePath = path.join(lambdaDir, "response.json");
        log(`🚀 Executing: ${command}`);

        const terminal = vscode.window.createTerminal({ name: `🦎 Run - ${localConfig.functionName}`, cwd: lambdaDir });
        terminal.show(true);
        terminal.sendText(command);

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `🦎 Executing ${localConfig.functionName}`,
            }, async (progress) => {
                progress.report({ message: "Waiting for SAM response..." });
                const { stdout } = await execAsync(command, { cwd: lambdaDir, timeout: 120000 });
                const response = this.parseResponse(stdout);
                fs.writeFileSync(responseFilePath, JSON.stringify(response, null, 2));
                log(`📄 Response saved to: ${responseFilePath}`);
                await this.openResponseFile(responseFilePath);
            });
            vscode.window.showInformationMessage(`✅ ${localConfig.functionName} executed successfully!`);
        } catch (error: any) {
            const errorResponse = {
                error: true,
                message: error.message,
                stderr: error.stderr || "",
                stdout: error.stdout || "",
            };
            fs.writeFileSync(responseFilePath, JSON.stringify(errorResponse, null, 2));
            logError("SAM execution failed", error);
            await this.openResponseFile(responseFilePath);
            vscode.window.showErrorMessage(`❌ Lambda execution failed. Check response.json and logs for details.`);
        }
    }

    private parseResponse(stdout: string): any {
        // Tu lógica de parseo está bien, la mantengo
        try {
            const lines = stdout.split("\n");
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                    try { return JSON.parse(trimmed); } catch { continue; }
                }
            }
            return { output: stdout.trim(), type: "raw_output" };
        } catch (error) {
            return { output: stdout.trim(), error: "Failed to parse response", type: "parse_error" };
        }
    }

    private async openResponseFile(filePath: string): Promise<void> {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
    }
    
    private stopApiServer(): void {
        if (this.apiServerTerminal) {
            this.apiServerTerminal.dispose();
            this.apiServerTerminal = undefined;
            vscode.window.showInformationMessage("🛑 API Gateway server stopped.");
        }
    }
}
