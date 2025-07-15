export class StringUtils {
  static toPascalCase(str: string): string {
    return str
      .replace(/[-_](\w)/g, (_, letter) => letter.toUpperCase())
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  static simplifyFunctionName(suggested: string): string {
    return (
      suggested
        .split("-")
        .slice(-2)
        .join("-")
        .replace(/[^a-zA-Z0-9-]/g, "")
        .substring(0, 30) || "lambda-function"
    );
  }
}
