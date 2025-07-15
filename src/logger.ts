import * as vscode from "vscode";

/**
 * El canal de salida centralizado para toda la extensión.
 * Se inicializa una vez en la función activate().
 */
export let outputChannel: vscode.OutputChannel;

/**
 * Inicializa el canal de salida. Debe ser llamado solo una vez
 * desde la función `activate` de la extensión.
 */
export function initializeOutputChannel() {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Gecko Lambda");
  }
}

/**
 * Una función de utilidad para registrar mensajes.
 * Muestra el canal de salida si se le indica.
 * @param message El mensaje a registrar.
 * @param show Muestra el panel del canal de salida si es `true`.
 */
export function log(message: string, show: boolean = false) {
  if (outputChannel) {
    outputChannel.appendLine(message);
    if (show) {
      outputChannel.show();
    }
  } else {
    // Fallback por si el logger se usa antes de inicializarse
    console.log(`[Gecko-Fallback] ${message}`);
  }
}

/**
 * Registra un mensaje de error y opcionalmente muestra una notificación al usuario.
 * @param message El mensaje de error a registrar.
 * @param error El objeto de error (opcional).
 * @param showNotification Muestra una notificación de error al usuario si es `true`.
 */
export function logError(message: string, error?: any, showNotification: boolean = false) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullMessage = `${message}: ${errorMessage}`;

    if (outputChannel) {
        outputChannel.appendLine(`❌ ERROR: ${fullMessage}`);
        outputChannel.show(true); // Siempre mostrar el canal en caso de error
    } else {
        console.error(`[Gecko-Fallback] ❌ ERROR: ${fullMessage}`);
    }

    if (showNotification) {
        vscode.window.showErrorMessage(message);
    }
}
