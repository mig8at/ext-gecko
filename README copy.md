# 🦎 Gecko Lambda - AWS Lambda Testing for Go

Agile AWS Lambda testing and development tools for Go developers. Build, test, and deploy Lambda functions with ease directly from VS Code.

## ✨ New Features (v0.2.0)

### 🌳 Tree View Explorer

- **Lambda Functions Explorer**: New sidebar panel showing all your Lambda functions
- **Expandable nodes**: Each Lambda shows its files (config.json, template.yaml, event.json, response.json)
- **Visual indicators**: Build status, event type icons, and file descriptions
- **One-click access**: Click any file to open it instantly

### 🖱️ Context Menus

- **Right-click actions**: Right-click any Lambda in the tree view for quick actions
- **Organized menus**: Actions grouped by Main (Run, Build), Files (Edit Event, View Template), Navigation, and Danger zones
- **Smart visibility**: Menu items adapt based on Lambda type and state

### 📊 Dynamic Status Bar

- **Active Lambda display**: Shows current Lambda name when editing main.go files
- **Quick actions**: Click status bar for instant access to Run, Build, Edit Event, etc.
- **Context awareness**: Adapts to show either workspace or active Lambda info

### 🌐 Enhanced API Gateway Support

- **Local API server**: API Gateway Lambdas now use `sam local start-api` instead of single invoke
- **Live testing**: Start a local server at `http://localhost:3000` for real HTTP testing
- **Browser integration**: Automatic browser opening and server management
- **No event files needed**: API Gateway Lambdas don't require event.json files

## 🚀 Features

### Lambda Development Workflow

- **Auto-detection**: Automatically detects Go Lambda functions (main.go with aws-lambda-go import)
- **Smart configuration**: Auto-configures based on function signatures and imports
- **Event type detection**: Supports API Gateway, S3, DynamoDB, and SQS events
- **One-click testing**: Build and run Lambda functions locally with SAM

### File Management

- **Workspace organization**: All Lambda functions organized in a configurable workspace
- **Template generation**: Automatic SAM template.yaml generation from configuration
- **Event templates**: Pre-configured test events for different AWS services
- **Response capture**: Automatic response capture and pretty-printing

### AWS Integration

- **Environment sync**: Download environment variables from existing AWS Lambda functions
- **Credential support**: Uses AWS CLI credentials for seamless integration
- **SAM integration**: Built on AWS SAM for reliable local testing

## 📋 Requirements

- **Go**: Go 1.19 or later
- **AWS CLI**: For AWS integration features
- **Docker**: Required for SAM local testing
- **SAM CLI**: For Lambda simulation and local testing

## 🛠️ Installation

1. Install from VS Code Marketplace
2. Configure your Lambda workspace path (default: `~/lambda-workspace`)
3. Ensure Docker is running for local testing
4. Configure AWS CLI if using AWS integration features

## 📖 Quick Start

### 1. Configure Workspace

- Click the 🦎 icon in the status bar or use Command Palette: "Configure Lambda Workspace"
- Set your preferred workspace path where all Lambda functions will be organized

### 2. Create/Configure a Lambda

- Open a `main.go` file that imports `github.com/aws/aws-lambda-go/lambda`
- Use Command Palette: "Gecko: Configure Lambda" or click the gear icon
- The extension will auto-detect event type and create workspace structure

### 3. Using the Tree View

- Open the "Gecko Lambda" sidebar panel
- Expand any Lambda to see its files
- Right-click for context menu actions:
  - **Run Lambda**: Start local testing
  - **Build Lambda**: Compile the function
  - **Edit Event**: Modify test event (non-API Gateway)
  - **View Template**: Open SAM template
  - **Open Directory**: Access Lambda workspace folder

### 4. Test Your Lambda

#### For API Gateway Lambdas:

- Click "Run Lambda" to start local API server
- Access your endpoints at `http://localhost:3000`
- Test with real HTTP requests, no event files needed

#### For Other Event Types:

- Edit the event.json file with test data
- Click "Run Lambda" to execute with the test event
- View response in automatically opened response.json

### 5. Build and Deploy

- Use "Build Lambda" to compile your function
- Generated files are in the `build/` directory
- Use the SAM template.yaml for AWS deployment

## 🎯 Event Type Support

### 🌐 API Gateway

- **Local server testing**: Uses `sam local start-api`
- **HTTP endpoint simulation**: Real HTTP requests at localhost:3000
- **No event files**: Direct HTTP testing without JSON events

### 🪣 S3 Events

- **Bucket event simulation**: Test object creation, deletion events
- **Event file configuration**: Customize bucket names, object keys

### 📊 DynamoDB Streams

- **Stream event testing**: Test record insertion, updates, deletions
- **Batch processing**: Multiple records in single event

### 📬 SQS Messages

- **Queue message simulation**: Test message processing
- **Batch support**: Multiple messages per event

## ⚙️ Configuration

### Global Settings

```json
{
  "gecko.workspacePath": "/path/to/your/lambda-workspace"
}
```

### Local Lambda Configuration (auto-generated)

Each Lambda gets a `config.json` with:

- Function metadata (name, event type, source paths)
- Runtime configuration (timeout, memory, architecture)
- Environment variables (manual or AWS-synced)
- Build settings

## 🖥️ UI Overview

### Tree View Panel

```
🦎 Gecko Lambda
├─ 📁 my-api-handler (apigateway ✅)
│  ├─ ⚙️ config.json - Local configuration
│  ├─ 📄 template.yaml - SAM template
│  └─ 📤 response.json - Last execution response
├─ 📁 s3-processor (s3 ❌)
│  ├─ ⚙️ config.json - Local configuration
│  ├─ 📄 template.yaml - SAM template
│  └─ 🎯 event.json - Test event data
```

### Status Bar States

- **Workspace mode**: `🦎 lambda-workspace` (when not editing Lambda)
- **Active Lambda mode**: `🦎 my-api-handler` (when editing Lambda main.go)

### Context Menu Actions

- **Run Lambda** - Execute locally
- **Build Lambda** - Compile function
- **Edit Event** - Modify test event
- **View Template** - Open SAM template
- **View Response** - See last execution result
- **Open Source File** - Jump to main.go
- **Open Directory** - Browse Lambda folder
- **Remove Lambda** - Delete from workspace

## 🔧 Advanced Usage

### Environment Variables

- **Manual configuration**: Edit config.json directly
- **AWS sync**: Use "Download from AWS" to sync from existing Lambda
- **Template integration**: Environment variables auto-populate SAM template

### Custom Build Scripts

Each Lambda gets a `build.sh` script for manual compilation:

```bash
cd /path/to/lambda-workspace/my-function
chmod +x build.sh
./build.sh
```

### Response Analysis

- **Automatic capture**: All lambda executions save responses
- **JSON formatting**: Pretty-printed for easy reading
- **Error details**: Failed executions show detailed error information

## 🐛 Troubleshooting

### Common Issues

**Lambda not detected**

- Ensure main.go imports `github.com/aws/aws-lambda-go/lambda`
- File must be named exactly `main.go`

**Docker issues**

- Ensure Docker Desktop is running
- Check Docker CLI access: `docker ps`

**Build failures**

- Verify Go installation and PATH
- Check source code compilation outside VS Code

**SAM errors**

- Install AWS SAM CLI
- Verify template.yaml validity: `sam validate`

### Debug Mode

Enable debug logging in VS Code Developer Tools:

1. Help → Toggle Developer Tools
2. Console tab
3. Look for 🦎 Gecko messages

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions welcome! Please read CONTRIBUTING.md for guidelines.

---

**Happy Lambda development! 🦎**
